// Suite de la sonde H8 : le broker peut-il BAISSER CoverRateMinimum pendant
// qu'un prêt est vivant, pour contourner le plancher de couverture ?
// Puis LoanBrokerCoverClawback (7e type jamais soumis). Puis démontage.
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
  } catch (e) { console.log(`${label.padEnd(42)} REJET: ${e.message}`); return { code: "rejet", err: e.message }; }
}

// Retrouver les objets vivants du broker.
const objs = await c.request({ command: "account_objects", account: brokerW.address, ledger_index: "validated" });
const brokers = objs.result.account_objects.filter((o) => o.LedgerEntryType === "LoanBroker");
const vaults = objs.result.account_objects.filter((o) => o.LedgerEntryType === "Vault");
console.log(`objets vivants : ${vaults.length} Vault, ${brokers.length} LoanBroker`);
const bn0 = brokers.find((o) => BigInt(o.DebtTotal ?? 0) > 0n) ?? brokers[0];
const B = bn0.index, V = bn0.VaultID;
const loans = await c.request({ command: "account_objects", account: Wallet.fromSeed(borrower.seed).address, type: "loan", ledger_index: "validated" }).catch(() => null);
const L = loans?.result.account_objects.find((o) => o.LoanBrokerID === B)?.index;
console.log(`broker ${B}\nvault  ${V}\nloan   ${L ?? "introuvable"}`);
let b = await readEntry(c, B);
console.log(`DebtTotal ${fmt(b.DebtTotal ?? 0)} · CoverAvailable ${fmt(b.CoverAvailable ?? 0)} · CoverRateMinimum ${b.CoverRateMinimum} (${b.CoverRateMinimum / 1000} %) · plancher ${fmt(BigInt(b.DebtTotal ?? 0) * BigInt(b.CoverRateMinimum) / 100000n)}`);

console.log("\n════ 1) Baisser CoverRateMinimum de 10 % à 1 % avec un prêt vivant ════");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V, LoanBrokerID: B,
  CoverRateMinimum: pctToRate(1), CoverRateLiquidation: pctToRate(1) }, { label: "LoanBrokerSet min 10 %→1 %" });
b = await readEntry(c, B);
console.log(`   CoverRateMinimum lu ${b.CoverRateMinimum} (${b.CoverRateMinimum / 1000} %) · CoverRateLiquidation ${b.CoverRateLiquidation}`);
console.log(`   nouveau plancher ${fmt(BigInt(b.DebtTotal ?? 0) * BigInt(b.CoverRateMinimum) / 100000n)} · disponible ${fmt(b.CoverAvailable ?? 0)}`);
console.log("   → si la baisse a été acceptée, on tente de retirer la couverture libérée");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: "300000" },
  { label: "CoverWithdraw 0,3 XRP après baisse" });
b = await readEntry(c, B);
console.log(`   CoverAvailable ${fmt(b.CoverAvailable ?? 0)} · ratio réel ${(Number(b.CoverAvailable ?? 0) / Number(b.DebtTotal ?? 1) * 100).toFixed(2)} %`);

console.log("\n════ 2) Autres champs modifiables à chaud ? ════");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V, LoanBrokerID: B,
  ManagementFeeRate: pctToRate(9) }, { label: "ManagementFeeRate 2 %→9 %" });
b = await readEntry(c, B);
console.log(`   ManagementFeeRate lu ${b.ManagementFeeRate} · CoverRateMinimum ${b.CoverRateMinimum} · CoverRateLiquidation ${b.CoverRateLiquidation}`);
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V, LoanBrokerID: B,
  DebtMaximum: "1" }, { label: "DebtMaximum → 1 drop (< DebtTotal)" });
b = await readEntry(c, B);
console.log(`   DebtMaximum lu ${b.DebtMaximum} · DebtTotal ${b.DebtTotal}`);
console.log("   LoanBrokerSet avec LoanBrokerID d'un broker d'un AUTRE vault :");
await submitRaw(c, spare.seed, { TransactionType: "LoanBrokerSet", VaultID: V, LoanBrokerID: B,
  ManagementFeeRate: pctToRate(1) }, { label: "LoanBrokerSet par un tiers" });

console.log("\n════ 3) LoanBrokerCoverClawback — 7e et dernier type jamais soumis ════");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: B },
  { label: "CoverClawback par le broker" });
await submitRaw(c, spare.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: B },
  { label: "CoverClawback par un déposant" });
await submitUnvalidated(c, broker.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: B, Amount: "100000" },
  "CoverClawback Amount en drops (raw)");

console.log("\n════ démontage ════");
if (L) {
  const n = await readEntry(c, L);
  await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L,
    Amount: String(Number(n.TotalValueOutstanding) + 300000) }, { label: "LoanPay solde total" });
  await submitRaw(c, broker.seed, { TransactionType: "LoanDelete", LoanID: L }, { label: "LoanDelete" });
}
const bn = await readEntry(c, B).catch(() => null);
if (bn && BigInt(bn.CoverAvailable ?? 0) > 0n) await submitRaw(c, broker.seed,
  { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: String(bn.CoverAvailable) }, { label: "CoverWithdraw final" });
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: B }, { label: "LoanBrokerDelete" });
const sf = await vaultSnapshot(c, V);
console.log(`   vault : AssetsTotal ${fmt(sf.assetsTotal)} · dispo ${fmt(sf.assetsAvailable)} · LossUnrealized ${sf.raw.LossUnrealized ?? "ABSENT"}`);
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === sf.shareMPTID)?.MPTAmount ?? 0); })();
if (sh > 0n) await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: sf.shareMPTID, value: String(sh) } }, { label: `VaultWithdraw ${sh} parts` });
await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete" });
await c.disconnect();
