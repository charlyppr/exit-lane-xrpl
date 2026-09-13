// Probe A3 part 2: isolate the cause of tecEXPIRED on LoanPay.
// Three successive states of the same loan: early / late not impaired /
// late impaired / unimpaired. Also answers the open question
// "does NextPaymentDueDate slide after an early payment?"
import { Client, Wallet } from "xrpl";
import { NET, txUrl, pctToRate } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts, signLoanSetCounterparty, readEntry } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
const createdNode = (r, t) => (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const F = { tfLoanDefault: 65536, tfLoanImpair: 131072, tfLoanUnimpair: 262144 };

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
  CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5) }, { label: "LoanBrokerSet" });
const B = createdNode(brk.result, "LoanBroker").LedgerIndex;
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: B, Amount: XRP(1) }, { label: "CoverDeposit 1" });

const prep = await c.autofill({ TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: B,
  Counterparty: borrowerW.address, PrincipalRequested: XRP(4), InterestRate: pctToRate(8),
  PaymentInterval: 90, PaymentTotal: 4, GracePeriod: 60, LoanOriginationFee: XRP(0.05),
  LoanServiceFee: XRP(0.01), LatePaymentFee: XRP(0.02), ClosePaymentFee: XRP(0.02) });
const r0 = await c.submitAndWait(signLoanSetCounterparty(brokerW.sign(prep).tx_blob, borrower.seed));
console.log(`LoanSet                      ${r0.result.meta?.TransactionResult}`);
console.log(`  ${txUrl(r0.result.hash)}`);
const L = createdNode(r0.result, "Loan")?.LedgerIndex;
if (!L) { console.log("no loan"); await c.disconnect(); process.exit(1); }

const st = async () => { const n = await readEntry(c, L); return { n,
  due: n.NextPaymentDueDate, prev: n.PreviousPaymentDueDate, rem: n.PaymentRemaining,
  flags: n.Flags ?? 0, impaired: !!((n.Flags ?? 0) & 131072),
  exact: Math.ceil(Number(n.PeriodicPayment)) + Number(n.LoanServiceFee ?? 0),
  late: Math.ceil(Number(n.PeriodicPayment)) + Number(n.LoanServiceFee ?? 0) + Number(n.LatePaymentFee ?? 0) }; };

let s = await st();
console.log(`\n  StartDate ${s.n.StartDate}, due date ${s.due} (in ${s.due - rippleNow()} s), interval 90 s, grace 60 s`);
console.log(`  PaymentRemaining ${s.rem}, exact amount due ${s.exact} drops`);

console.log("\n==== A: EARLY PAYMENT: does the next due date slide? ====");
const dueBefore = s.due;
const pa = await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(s.exact) },
  { label: "LoanPay early" });
s = await st();
console.log(`  due date ${dueBefore} -> ${s.due}  (shift ${s.due - dueBefore} s = ${((s.due - dueBefore) / 90).toFixed(2)} interval)`);
console.log(`  PreviousPaymentDueDate ${s.prev}, PaymentRemaining ${s.rem}`);
console.log(`  VERDICT: the due date ${s.due === dueBefore ? "does NOT slide (fixed schedule)" : "SLIDES by " + (s.due - dueBefore) + " s"}`);

console.log("\n==== B: LATE, NOT IMPAIRED, within grace ====");
while (rippleNow() <= s.due) { await sleep(10000); s = await st();
  console.log(`  waiting... due date in ${s.due - rippleNow()} s`); }
s = await st();
let now = rippleNow();
console.log(`  now: due date overdue by ${now - s.due} s, grace ends in ${s.due + s.n.GracePeriod - now} s, impaired ${s.impaired}`);
const pb = await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(s.late) },
  { label: `LoanPay late, not impaired (${s.late})` });

console.log("\n==== C: SAME LOAN, IMPAIRED: is LoanPay still possible? ====");
s = await st();
const imp = await submitRaw(c, broker.seed, { TransactionType: "LoanManage", LoanID: L, Flags: F.tfLoanImpair },
  { label: "tfLoanImpair" });
s = await st();
now = rippleNow();
console.log(`  impaired ${s.impaired}, due date ${now > s.due ? "overdue by " + (now - s.due) : "in " + (s.due - now)} s, term ends in ${s.n.StartDate + 360 - now} s`);
const pc = await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(s.late) },
  { label: `LoanPay on impaired loan (${s.late})` });

console.log("\n==== D: UNIMPAIRED: does payment become possible again? ====");
await submitRaw(c, broker.seed, { TransactionType: "LoanManage", LoanID: L, Flags: F.tfLoanUnimpair }, { label: "tfLoanUnimpair" });
s = await st();
const pd = await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(s.late) },
  { label: `LoanPay after unimpair (${s.late})` });

console.log("\n==== SUMMARY ====");
console.log(`  early, healthy               -> ${pa.code}`);
console.log(`  late, healthy, within grace  -> ${pb.code}`);
console.log(`  late, IMPAIRED               -> ${pc.code}`);
console.log(`  late, unimpaired             -> ${pd.code}`);
console.log(`\n  CAUSE OF tecEXPIRED: ${pb.code === "tesSUCCESS" && pc.code !== "tesSUCCESS"
  ? "IMPAIRMENT blocks the payment (lateness alone does not)"
  : pb.code !== "tesSUCCESS" ? "LATENESS alone is enough to block the payment" : "undecided"}`);
console.log(`  reversibility: ${pd.code === "tesSUCCESS" ? "tfLoanUnimpair reopens payment" : "not reopened by unimpair (" + pd.code + ")"}`);

console.log("\n==== TEARDOWN ====");
s = await st().catch(() => null);
if (s) {
  const tot = Number(s.n.TotalValueOutstanding ?? 0);
  const pay = await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(tot + 200000) },
    { label: "LoanPay full balance (clean exit)" });
  if (!pay.ok) {
    await submitRaw(c, broker.seed, { TransactionType: "LoanManage", LoanID: L, Flags: F.tfLoanImpair }, { label: "impair before default" });
    await submitRaw(c, broker.seed, { TransactionType: "LoanManage", LoanID: L, Flags: F.tfLoanDefault }, { label: "tfLoanDefault" });
  }
}
await submitRaw(c, broker.seed, { TransactionType: "LoanDelete", LoanID: L }, { label: "LoanDelete" });
const bn = await readEntry(c, B).catch(() => null);
if (bn?.CoverAvailable) await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverWithdraw",
  LoanBrokerID: B, Amount: String(bn.CoverAvailable) }, { label: "CoverWithdraw" });
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: B }, { label: "LoanBrokerDelete" });
const sf = await vaultSnapshot(c, V);
console.log(`  vault: AssetsTotal ${fmt(sf.assetsTotal)}, available ${fmt(sf.assetsAvailable)}, share ${sf.navPerShare.toFixed(9)}`);
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === sf.shareMPTID)?.MPTAmount ?? 0); })();
await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: sf.shareMPTID, value: String(sh) } }, { label: `VaultWithdraw ${sh} shares` });
await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete" });
console.log(`\nIDs: vault ${V}, broker ${B}, loan ${L}`);
await c.disconnect();
