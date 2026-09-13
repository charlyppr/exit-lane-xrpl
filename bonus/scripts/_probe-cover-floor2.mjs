// Follow-up to probe H8: can the broker LOWER CoverRateMinimum while a loan
// is live, to get around the cover floor?
// Then LoanBrokerCoverClawback (7th type never submitted). Then teardown.
import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, pctToRate } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts, readEntry } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const brokerW = Wallet.fromSeed(broker.seed), spareW = Wallet.fromSeed(spare.seed);

async function submitUnvalidated(client, seed, tx, label) {
  const w = Wallet.fromSeed(seed);
  const prepared = await client.autofill({ Account: w.address, ...tx });
  prepared.SigningPubKey = w.publicKey;
  prepared.TxnSignature = kpSign(encodeForSigning(prepared), w.privateKey);
  try {
    const res = await client.submitAndWait(encode(prepared));
    const code = res.result.meta?.TransactionResult ?? "?";
    console.log(`${label.padEnd(42)} ${code}  ${res.result.hash}`);
    return { code, hash: res.result.hash, ok: code === "tesSUCCESS" };
  } catch (e) { console.log(`${label.padEnd(42)} REJECTED: ${e.message}`); return { code: "rejected", err: e.message }; }
}

// Find the broker's live objects.
const objs = await c.request({ command: "account_objects", account: brokerW.address, ledger_index: "validated" });
const brokers = objs.result.account_objects.filter((o) => o.LedgerEntryType === "LoanBroker");
const vaults = objs.result.account_objects.filter((o) => o.LedgerEntryType === "Vault");
console.log(`live objects: ${vaults.length} Vault, ${brokers.length} LoanBroker`);
const bn0 = brokers.find((o) => BigInt(o.DebtTotal ?? 0) > 0n) ?? brokers[0];
const B = bn0.index, V = bn0.VaultID;
const loans = await c.request({ command: "account_objects", account: Wallet.fromSeed(borrower.seed).address, type: "loan", ledger_index: "validated" }).catch(() => null);
const L = loans?.result.account_objects.find((o) => o.LoanBrokerID === B)?.index;
console.log(`broker ${B}\nvault  ${V}\nloan   ${L ?? "not found"}`);
let b = await readEntry(c, B);
console.log(`DebtTotal ${fmt(b.DebtTotal ?? 0)} · CoverAvailable ${fmt(b.CoverAvailable ?? 0)} · CoverRateMinimum ${b.CoverRateMinimum} (${b.CoverRateMinimum / 1000} %) · floor ${fmt(BigInt(b.DebtTotal ?? 0) * BigInt(b.CoverRateMinimum) / 100000n)}`);

console.log("\n════ 1) Lower CoverRateMinimum from 10 % to 1 % with a live loan ════");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V, LoanBrokerID: B,
  CoverRateMinimum: pctToRate(1), CoverRateLiquidation: pctToRate(1) }, { label: "LoanBrokerSet min 10 %→1 %" });
b = await readEntry(c, B);
console.log(`   CoverRateMinimum read ${b.CoverRateMinimum} (${b.CoverRateMinimum / 1000} %) · CoverRateLiquidation ${b.CoverRateLiquidation}`);
console.log(`   new floor ${fmt(BigInt(b.DebtTotal ?? 0) * BigInt(b.CoverRateMinimum) / 100000n)} · available ${fmt(b.CoverAvailable ?? 0)}`);
console.log("   → if the decrease was accepted, try to withdraw the freed cover");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: "300000" },
  { label: "CoverWithdraw 0.3 XRP after decrease" });
b = await readEntry(c, B);
console.log(`   CoverAvailable ${fmt(b.CoverAvailable ?? 0)} · actual ratio ${(Number(b.CoverAvailable ?? 0) / Number(b.DebtTotal ?? 1) * 100).toFixed(2)} %`);

console.log("\n════ 2) Other fields changeable live? ════");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V, LoanBrokerID: B,
  ManagementFeeRate: pctToRate(9) }, { label: "ManagementFeeRate 2 %→9 %" });
b = await readEntry(c, B);
console.log(`   ManagementFeeRate read ${b.ManagementFeeRate} · CoverRateMinimum ${b.CoverRateMinimum} · CoverRateLiquidation ${b.CoverRateLiquidation}`);
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V, LoanBrokerID: B,
  DebtMaximum: "1" }, { label: "DebtMaximum → 1 drop (< DebtTotal)" });
b = await readEntry(c, B);
console.log(`   DebtMaximum read ${b.DebtMaximum} · DebtTotal ${b.DebtTotal}`);
console.log("   LoanBrokerSet with the LoanBrokerID of a broker from ANOTHER vault:");
await submitRaw(c, spare.seed, { TransactionType: "LoanBrokerSet", VaultID: V, LoanBrokerID: B,
  ManagementFeeRate: pctToRate(1) }, { label: "LoanBrokerSet by a third party" });

console.log("\n════ 3) LoanBrokerCoverClawback: 7th and last type never submitted ════");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: B },
  { label: "CoverClawback by the broker" });
await submitRaw(c, spare.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: B },
  { label: "CoverClawback by a depositor" });
await submitUnvalidated(c, broker.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: B, Amount: "100000" },
  "CoverClawback Amount in drops (raw)");

console.log("\n════ teardown ════");
if (L) {
  const n = await readEntry(c, L);
  await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L,
    Amount: String(Number(n.TotalValueOutstanding) + 300000) }, { label: "LoanPay full balance" });
  await submitRaw(c, broker.seed, { TransactionType: "LoanDelete", LoanID: L }, { label: "LoanDelete" });
}
const bn = await readEntry(c, B).catch(() => null);
if (bn && BigInt(bn.CoverAvailable ?? 0) > 0n) await submitRaw(c, broker.seed,
  { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: String(bn.CoverAvailable) }, { label: "Final CoverWithdraw" });
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: B }, { label: "LoanBrokerDelete" });
const sf = await vaultSnapshot(c, V);
console.log(`   vault: AssetsTotal ${fmt(sf.assetsTotal)} · available ${fmt(sf.assetsAvailable)} · LossUnrealized ${sf.raw.LossUnrealized ?? "ABSENT"}`);
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === sf.shareMPTID)?.MPTAmount ?? 0); })();
if (sh > 0n) await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: sf.shareMPTID, value: String(sh) } }, { label: `VaultWithdraw ${sh} shares` });
await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete" });
await c.disconnect();
