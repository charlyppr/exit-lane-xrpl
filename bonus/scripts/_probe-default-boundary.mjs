// Probe: isolate the condition for tfLoanDefault: end of grace or end of term?
// The previous setup had both exceeded at the same time. Here the term is far
// away (20 installments of 60 s = 20 min) and the grace expires at +120 s.
// Also tests: is impairment a prerequisite for default?
import { Client, Wallet } from "xrpl";
import { NET, txUrl, pctToRate } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts, signLoanSetCounterparty, readEntry } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
const createdNode = (r, t) => (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const F = { tfLoanDefault: 65536, tfLoanImpair: 131072 };

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const brokerW = Wallet.fromSeed(broker.seed), spareW = Wallet.fromSeed(spare.seed), borrowerW = Wallet.fromSeed(borrower.seed);

// Small setup: the principal will be lost, so keep it tiny.
const v = await submitRaw(c, broker.seed, { TransactionType: "VaultCreate", Asset: { currency: "XRP" },
  AssetsMaximum: XRP(100), WithdrawalPolicy: 1 }, { label: "VaultCreate" });
const V = createdNode(v.result, "Vault").LedgerIndex;
await submitRaw(c, spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(2) }, { label: "VaultDeposit spare 2" });
const brk = await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V,
  ManagementFeeRate: pctToRate(2), DebtMaximum: XRP(50),
  CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5) }, { label: "LoanBrokerSet" });
const B = createdNode(brk.result, "LoanBroker").LedgerIndex;
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: B, Amount: XRP(0.5) }, { label: "CoverDeposit 0.5" });

const prep = await c.autofill({ TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: B,
  Counterparty: borrowerW.address, PrincipalRequested: XRP(1.6), InterestRate: pctToRate(8),
  PaymentInterval: 60, PaymentTotal: 20, GracePeriod: 60, LoanOriginationFee: XRP(0.02),
  LoanServiceFee: XRP(0.005), LatePaymentFee: XRP(0.01), ClosePaymentFee: XRP(0.01) });
const r0 = await c.submitAndWait(signLoanSetCounterparty(brokerW.sign(prep).tx_blob, borrower.seed));
console.log(`LoanSet                      ${r0.result.meta?.TransactionResult}`);
console.log(`  ${txUrl(r0.result.hash)}`);
const L = createdNode(r0.result, "Loan")?.LedgerIndex;
if (!L) { await c.disconnect(); process.exit(1); }
const n0 = await readEntry(c, L);
const graceEnd = n0.NextPaymentDueDate + n0.GracePeriod;
const termEnd = n0.StartDate + n0.PaymentInterval * 20;
console.log(`  due date ${n0.NextPaymentDueDate}, end of grace ${graceEnd}, END OF TERM ${termEnd} (in ${termEnd - rippleNow()} s)`);
console.log(`  at test time the term will be far away: only the grace will be exceeded.`);

console.log("\n---- waiting for the end of grace ----");
while (rippleNow() <= graceEnd + 5) {
  console.log(`  end of grace in ${graceEnd - rippleNow()} s`);
  await sleep(15000);
}
let now = rippleNow();
console.log(`\n  now: grace exceeded by ${now - graceEnd} s, term in ${termEnd - now} s, Flags ${(await readEntry(c, L)).Flags ?? 0}`);

console.log("\n---- 1) tfLoanDefault WITHOUT prior impairment ----");
const d1 = await submitRaw(c, broker.seed, { TransactionType: "LoanManage", LoanID: L, Flags: F.tfLoanDefault },
  { label: "tfLoanDefault (not impaired)" });

console.log("\n---- 2) impairment, then tfLoanDefault ----");
await submitRaw(c, broker.seed, { TransactionType: "LoanManage", LoanID: L, Flags: F.tfLoanImpair }, { label: "tfLoanImpair" });
now = rippleNow();
console.log(`  grace exceeded by ${now - graceEnd} s, term in ${termEnd - now} s`);
const s0 = await vaultSnapshot(c, V), b0 = await readEntry(c, B);
const d2 = await submitRaw(c, broker.seed, { TransactionType: "LoanManage", LoanID: L, Flags: F.tfLoanDefault },
  { label: "tfLoanDefault (impaired)" });
const s1 = await vaultSnapshot(c, V);
const b1 = await readEntry(c, B).catch(() => null);

console.log("\n==== VERDICT ====");
console.log(`  without impairment -> ${d1.code}`);
console.log(`  with impairment    -> ${d2.code}`);
console.log(`  ${d2.ok && !d1.ok ? "IMPAIRMENT is a PREREQUISITE for default" : d1.ok ? "default does NOT require impairment" : "both refused: the condition is not the end of grace"}`);
console.log(`  ${d2.ok ? `boundary = END OF GRACE (term still ${termEnd - rippleNow()} s away)` : "boundary beyond the end of grace"}`);
if (d2.ok) {
  console.log(`  cover ${fmt(b0.CoverAvailable ?? 0)} -> ${fmt(b1?.CoverAvailable ?? 0)}, AssetsTotal ${fmt(s0.assetsTotal)} -> ${fmt(s1.assetsTotal)}, share ${s0.navPerShare.toFixed(9)} -> ${s1.navPerShare.toFixed(9)}`);
}

console.log("\n---- teardown ----");
await submitRaw(c, broker.seed, { TransactionType: "LoanDelete", LoanID: L }, { label: "LoanDelete" });
const bn = await readEntry(c, B).catch(() => null);
if (bn && BigInt(bn.CoverAvailable ?? 0) > 0n) await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverWithdraw",
  LoanBrokerID: B, Amount: String(bn.CoverAvailable) }, { label: "CoverWithdraw" });
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: B }, { label: "LoanBrokerDelete" });
const sf = await vaultSnapshot(c, V);
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === sf.shareMPTID)?.MPTAmount ?? 0); })();
if (sh > 0n) await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: sf.shareMPTID, value: String(sh) } }, { label: "VaultWithdraw" });
await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete" });
console.log(`\nIDs: vault ${V}, broker ${B}, loan ${L}`);
await c.disconnect();
