// Steps 4 to 6 of the Track 1 minimum bar, on the loan opened by test-v11-blocking.mjs.
//
//   4. Drawdown                  implicit in LoanSet: NO dedicated transaction exists.
//   5. Repayment                 LoanPay of one installment.
//   6. Withdraw capital + yield  VaultWithdraw by the depositor.
//
// Each step reads the ledger state before/after: that is the proof, and it
// also feeds FEEDBACK-RAW (derived fields readable or not, see H9).

import { Client } from "xrpl";
import { NET, txUrl } from "../../scripts/config.mjs";
import { loadAccounts, submitRaw, readEntry } from "../../scripts/raw-submit.mjs";

// Identifiers produced by the last run of test-v11-blocking.mjs.
const LOAN_ID = process.env.LOAN_ID ?? "6AB3738220620157A5A76AF66E525E4A2BC41B240CDD1913D9789A02F59E5D03";
const VAULT_ID = process.env.VAULT_ID ?? "8F8CCB7AFDD9214483D41F87C385C4081818ED27D06F6A38A39437C7F4475F15";

const drops = (v) => Number(v) / 1e6;
const fmt = (v) => `${drops(v).toFixed(6)} XRP`;
const log = (...a) => console.log(...a);
const step = (n, t) => log(`\n─── ${n}. ${t} ${"─".repeat(Math.max(0, 44 - t.length))}`);

const timeline = [];

const client = new Client(NET.wss);
await client.connect();

try {
  const { lender, borrower } = loadAccounts();
  const bal = async (addr) => {
    const r = await client.request({ command: "account_info", account: addr, ledger_index: "validated" });
    return Number(r.result.account_data.Balance);
  };

  // ─────────────────────────────────────────────────────────────────────────
  step(4, "Drawdown: implicit, no dedicated transaction");
  const loan0 = await readEntry(client, LOAN_ID);
  const vault0 = await readEntry(client, VAULT_ID);
  log(`  PrincipalOutstanding  : ${fmt(loan0.PrincipalOutstanding)}`);
  log(`  Vault AssetsTotal     : ${fmt(vault0.AssetsTotal)}`);
  log(`  Vault AssetsAvailable : ${fmt(vault0.AssetsAvailable)}`);
  log(`  → total/available gap = ${fmt(Number(vault0.AssetsTotal) - Number(vault0.AssetsAvailable))}`);
  log("  This is the principal drawn. LoanSet transferred the funds to the borrower");
  log("  at origination time: there is no `LoanDraw` and no drawdown flag,");
  log("  neither in xrpl@4.6.0 nor in ripple-binary-codec's TRANSACTION_TYPES.");

  // ─────────────────────────────────────────────────────────────────────────
  step(5, "LoanPay: one installment");
  // PeriodicPayment is expressed in drops WITH decimals ("25013700.131…"),
  // while the drop is the indivisible unit of XRP. We round up to the next
  // drop so as not to underpay. A feedback item in its own right.
  // ⚠️ Paying exactly `ceil(PeriodicPayment)` yields `tecINSUFFICIENT_PAYMENT`.
  // The amount actually due is PeriodicPayment + LoanServiceFee, and that total
  // is exposed by NO ledger field. See FEEDBACK-RAW [14:02].
  const periodic = loan0.PeriodicPayment;
  const toPay = String(Math.ceil(Number(periodic)) + Number(loan0.LoanServiceFee));
  log(`  PeriodicPayment announced : ${periodic} drops`);
  log(`  + LoanServiceFee          : ${loan0.LoanServiceFee} drops`);
  log(`  = paid                    : ${toPay} drops = ${fmt(toPay)}`);
  log(`  NextPaymentDueDate : ${loan0.NextPaymentDueDate}  PaymentRemaining : ${loan0.PaymentRemaining}`);

  const borrowerBefore = await bal(borrower.address);
  const pay = await submitRaw(client, borrower.seed, {
    TransactionType: "LoanPay",
    LoanID: LOAN_ID,
    Amount: toPay,
  }, { label: "LoanPay" });
  timeline.push({ label: "LoanPay", code: pay.code, hash: pay.hash });

  const loan1 = await readEntry(client, LOAN_ID);
  const vault1 = await readEntry(client, VAULT_ID);
  const borrowerAfter = await bal(borrower.address);
  log(`  borrower : ${fmt(borrowerBefore)} → ${fmt(borrowerAfter)}  (${fmt(borrowerAfter - borrowerBefore)})`);
  log(`  PrincipalOutstanding : ${fmt(loan0.PrincipalOutstanding)} → ${fmt(loan1.PrincipalOutstanding)}`);
  log(`  PaymentRemaining     : ${loan0.PaymentRemaining} → ${loan1.PaymentRemaining}`);
  log(`  Vault AssetsTotal    : ${fmt(vault0.AssetsTotal)} → ${fmt(vault1.AssetsTotal)}`);
  // AssetsTotal = liquidity + principal lent. A repayment moves principal
  // from one to the other without changing the total: the change in
  // AssetsTotal IS the yield, there is nothing to subtract from it.
  const yieldDrops = Number(vault1.AssetsTotal) - Number(vault0.AssetsTotal);
  log(`  → yield accrued to the vault on this installment: ${fmt(yieldDrops)}`);

  // ─────────────────────────────────────────────────────────────────────────
  step(6, "VaultWithdraw: capital + yield");
  const available = Number(vault1.AssetsAvailable ?? 0);  // field absent when zero, see [14:05]
  log(`  liquidity available in the vault: ${fmt(available)}`);
  log("  (the rest is locked in the outstanding loan, which is the expected");
  log("   behaviour of an open-ended vault: only the unlent part can be withdrawn)");

  if (available <= 0) {
    log("  nothing to withdraw: all the liquidity is lent out. Step 6 already demonstrated");
    log("  by the previous withdrawals (see FEEDBACK-RAW [14:08]).");
    throw new Error("SKIP_STEP_6");
  }

  const lenderBefore = await bal(lender.address);
  const wd = await submitRaw(client, lender.seed, {
    TransactionType: "VaultWithdraw",
    VaultID: VAULT_ID,
    Amount: String(available),
  }, { label: "VaultWithdraw" });
  timeline.push({ label: "VaultWithdraw", code: wd.code, hash: wd.hash });

  if (wd.ok) {
    const lenderAfter = await bal(lender.address);
    const vault2 = await readEntry(client, VAULT_ID);
    log(`  lender : ${fmt(lenderBefore)} → ${fmt(lenderAfter)}  (net ${fmt(lenderAfter - lenderBefore)})`);
    log(`  Vault AssetsTotal     : ${fmt(vault1.AssetsTotal)} → ${fmt(vault2.AssetsTotal)}`);
    // `AssetsAvailable` DISAPPEARS from the node when it drops to zero, see [14:05].
    log(`  Vault AssetsAvailable : ${fmt(vault1.AssetsAvailable)} → ${vault2.AssetsAvailable === undefined ? "FIELD ABSENT (= 0)" : fmt(vault2.AssetsAvailable)}`);
    log(`\n  Withdrawn now : ${fmt(available)}`);
    log(`  Still lent    : ${fmt(loan1.PrincipalOutstanding)} (principal still owed)`);
  }

} catch (e) {
  if (e.message !== "SKIP_STEP_6") log(`\n💥 ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 600));
} finally {
  log("\n─── Summary ───");
  for (const t of timeline) log(`  ${t.label.padEnd(16)} ${String(t.code).padEnd(18)} ${t.hash ?? ""}`);
  for (const t of timeline) if (t.hash) log(`  ${txUrl(t.hash)}`);
  await client.disconnect();
}
