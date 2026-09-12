// SONDE H8 — le broker peut-il retirer sa couverture SOUS le CoverRateMinimum
// qu'il a promis, pendant qu'un prêt est vivant ? Et LoanBrokerCoverClawback
// (7e et dernier type jamais soumis) sur un broker en XRP.
import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl, pctToRate } from "./config.mjs";
import { submitRaw, loadAccounts, signLoanSetCounterparty, readEntry } from "./raw-submit.mjs";
import { vaultSnapshot, fmt } from "./lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const createdNode = (r, t) => (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;

async function submitUnvalidated(client, seed, tx, label) {
  const w = Wallet.fromSeed(seed);
  let prepared;
  try { prepared = await client.autofill({ Account: w.address, ...tx }); }
  catch (e) { console.log(`${label.padEnd(44)} AUTOFILL KO: ${e.message}`); return { code: "autofill-ko" }; }
  prepared.SigningPubKey = w.publicKey;
  prepared.TxnSignature = kpSign(encodeForSigning(prepared), w.privateKey);
  try {
    const res = await client.submitAndWait(encode(prepared));
    const code = res.result.meta?.TransactionResult ?? "?";
    console.log(`${label.padEnd(44)} ${code}`);
    console.log(`  ${txUrl(res.result.hash)}`);
    return { code, hash: res.result.hash, ok: code === "tesSUCCESS" };
  } catch (e) { console.log(`${label.padEnd(44)} REJET: ${e.message}`); return { code: "rejet", err: e.message }; }
}

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const brokerW = Wallet.fromSeed(broker.seed), spareW = Wallet.fromSeed(spare.seed), borrowerW = Wallet.fromSeed(borrower.seed);

const v = await submitRaw(c, broker.seed, { TransactionType: "VaultCreate", Asset: { currency: "XRP" },
  AssetsMaximum: XRP(100), WithdrawalPolicy: 1 }, { label: "VaultCreate" });
const V = createdNode(v.result, "Vault").LedgerIndex;
await submitRaw(c, spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(5) }, { label: "VaultDeposit spare 5" });
const brk = await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V,
  ManagementFeeRate: pctToRate(2), DebtMaximum: XRP(50),
  CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5) }, { label: "LoanBrokerSet (min 10 %)" });
const B = createdNode(brk.result, "LoanBroker").LedgerIndex;
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: B, Amount: XRP(1) }, { label: "CoverDeposit 1 XRP" });

console.log("\n── prêt de 4 XRP : minimum de couverture requis = 10 % × 4 = 0,4 XRP ──");
const prep = await c.autofill({ TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: B,
  Counterparty: borrowerW.address, PrincipalRequested: XRP(4), InterestRate: pctToRate(8),
  PaymentInterval: 2_592_000, PaymentTotal: 4, GracePeriod: 86_400, LoanOriginationFee: XRP(0.05),
  LoanServiceFee: XRP(0.01), LatePaymentFee: XRP(0.02), ClosePaymentFee: XRP(0.02) });
const r0 = await c.submitAndWait(signLoanSetCounterparty(brokerW.sign(prep).tx_blob, borrower.seed));
console.log(`LoanSet                      ${r0.result.meta?.TransactionResult}`);
const L = createdNode(r0.result, "Loan")?.LedgerIndex;
let b = await readEntry(c, B);
console.log(`  DebtTotal ${fmt(b.DebtTotal ?? 0)} · CoverAvailable ${fmt(b.CoverAvailable ?? 0)} · minimum requis ${fmt(BigInt(b.DebtTotal ?? 0) / 10n)}`);

console.log("\n════ H8 — retrait de couverture pendant qu'un prêt est vivant ════");
const show = async (t) => { b = await readEntry(c, B);
  console.log(`   ${t} : CoverAvailable ${fmt(b.CoverAvailable ?? 0)} · DebtTotal ${fmt(b.DebtTotal ?? 0)} · ratio ${(Number(b.CoverAvailable ?? 0) / Number(b.DebtTotal ?? 1) * 100).toFixed(2)} %`); };

console.log("1) retirer 0,9 XRP → il resterait 0,1 XRP, soit 2,5 % (sous les 10 % promis)");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: XRP(0.9) },
  { label: "CoverWithdraw 0,9 (sous le min)" });
await show("après");
console.log("2) retirer 0,6 XRP → il resterait exactement 0,4 XRP = 10 %");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: XRP(0.6) },
  { label: "CoverWithdraw 0,6 (= le min)" });
await show("après");
console.log("3) retirer 1 drop de plus que le minimum autorisé");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: "1" },
  { label: "CoverWithdraw 1 drop de trop" });
await show("après");
console.log("4) retirer TOUTE la couverture restante");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B,
  Amount: String(b.CoverAvailable ?? 0) }, { label: "CoverWithdraw tout" });
await show("après");

console.log("\n════ Le broker peut-il baisser CoverRateMinimum après origination ? ════");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerSet", LoanBrokerID: B,
  CoverRateMinimum: pctToRate(1) }, { label: "LoanBrokerSet min 10 %→1 %" });
b = await readEntry(c, B);
console.log(`   CoverRateMinimum lu : ${b.CoverRateMinimum} (${(b.CoverRateMinimum ?? 0) / 1000} %)`);

console.log("\n════ LoanBrokerCoverClawback — 7e type, jamais soumis ════");
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: B },
  { label: "CoverClawback par le broker" });
await submitRaw(c, spare.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: B },
  { label: "CoverClawback par un déposant" });
await submitUnvalidated(c, broker.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: B, Amount: XRP(0.1) },
  "CoverClawback montant en drops (raw)");

console.log("\n── démontage ──");
const n = await readEntry(c, L).catch(() => null);
if (n) {
  const tot = Number(n.TotalValueOutstanding ?? 0) + 200000;
  await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(tot) }, { label: "LoanPay solde total" });
}
await submitRaw(c, broker.seed, { TransactionType: "LoanDelete", LoanID: L }, { label: "LoanDelete" });
const bn = await readEntry(c, B).catch(() => null);
if (bn && BigInt(bn.CoverAvailable ?? 0) > 0n) await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverWithdraw",
  LoanBrokerID: B, Amount: String(bn.CoverAvailable) }, { label: "CoverWithdraw final" });
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: B }, { label: "LoanBrokerDelete" });
const sf = await vaultSnapshot(c, V);
console.log(`   vault : AssetsTotal ${fmt(sf.assetsTotal)} · dispo ${fmt(sf.assetsAvailable)} · part ${sf.navPerShare.toFixed(9)}`);
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === sf.shareMPTID)?.MPTAmount ?? 0); })();
if (sh > 0n) await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: sf.shareMPTID, value: String(sh) } }, { label: "VaultWithdraw" });
await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete" });
console.log(`\nIDs : vault ${V} · broker ${B} · loan ${L}`);
await c.disconnect();
