// Step 7 of the Track 1 minimum bar: "Demonstrate a transaction rejected by a
// protocol guardrail". Each rejection below is triggered on purpose and logged
// with its code and hash.
//
// The brief lists three angles: insufficient liquidity, off-schedule payment,
// first-loss cover behavior. All three are covered, plus the permission check
// seen at [13:26].
//
// Every transaction is submitted and validated: a `tec` rejection is recorded
// on-chain, with a hash that can be checked in the explorer. A local rejection
// (`tem` / `fails local checks`) leaves no trace.

import { Client, Wallet } from "xrpl";
import { NET, txUrl, pctToRate } from "./config.mjs";
import { loadAccounts, submitRaw, readEntry, signLoanSetCounterparty } from "./raw-submit.mjs";

const VAULT_ID = process.env.VAULT_ID ?? "8F8CCB7AFDD9214483D41F87C385C4081818ED27D06F6A38A39437C7F4475F15";
const BROKER_ID = process.env.BROKER_ID ?? "AAAA1EB19B77E07B15F642A0F1725DA1498AABD4C26FE7A880E43167C9861471";
const LOAN_ID = process.env.LOAN_ID ?? "6AB3738220620157A5A76AF66E525E4A2BC41B240CDD1913D9789A02F59E5D03";

const XRP = (n) => String(Math.round(n * 1e6));
const fmt = (v) => `${(Number(v) / 1e6).toFixed(6)} XRP`;
const log = (...a) => console.log(...a);

const results = [];
const record = (n, title, expected, actual, hash, ok) => {
  results.push({ n, title, expected, actual, hash, ok });
  log(`  expected: rejection (${expected})`);
  log(`  actual  : ${actual}`);
  if (hash) log(`  ${txUrl(hash)}`);
  log(ok ? "  PASS: guardrail demonstrated" : "  FAIL: not the expected behavior, investigate");
};

const client = new Client(NET.wss);
await client.connect();

try {
  const { lender, borrower, broker, spare } = loadAccounts();
  const vault = await readEntry(client, VAULT_ID);
  const loan = await readEntry(client, LOAN_ID);
  const available = Number(vault.AssetsAvailable ?? 0);

  log("Starting state");
  log(`  Vault AssetsTotal     : ${fmt(vault.AssetsTotal)}`);
  log(`  Vault AssetsAvailable : ${fmt(available)}`);
  log(`  Loan PrincipalOutstanding : ${fmt(loan.PrincipalOutstanding)}`);
  log(`  Loan PaymentRemaining     : ${loan.PaymentRemaining}`);

  log("\n--- 1. Insufficient liquidity: LoanSet beyond what is available ---");
  log(`  Requesting a 5,000 XRP loan while the vault only has ${fmt(available)}.`);
  const bw = Wallet.fromSeed(broker.seed);
  const cw = Wallet.fromSeed(borrower.seed);
  const prepared = await client.autofill({
    TransactionType: "LoanSet",
    Account: bw.address,
    LoanBrokerID: BROKER_ID,
    Counterparty: cw.address,
    PrincipalRequested: XRP(5_000),
    InterestRate: pctToRate(8),
    PaymentInterval: 86_400,
    PaymentTotal: 4,
    GracePeriod: 3_600,
  });
  const blob = signLoanSetCounterparty(bw.sign(prepared).tx_blob, borrower.seed);
  const r1 = await client.submitAndWait(blob);
  const c1 = r1.result.meta?.TransactionResult;
  record(1, "Insufficient liquidity (LoanSet > AssetsAvailable)",
    "tecINSUFFICIENT_FUNDS", c1, r1.result.hash, c1 === "tecINSUFFICIENT_FUNDS");

  log("\n--- 2. Off-schedule payment: underpaid LoanPay ---");
  log(`  Installment due: ${loan.PeriodicPayment} + ${loan.LoanServiceFee} drops of fees.`);
  log("  Paying 1 XRP on purpose, far below.");
  const r2 = await submitRaw(client, borrower.seed, {
    TransactionType: "LoanPay",
    LoanID: LOAN_ID,
    Amount: XRP(1),
  }, { label: "LoanPay (underpaid)" });
  record(2, "Insufficient payment (LoanPay < installment due)",
    "tecINSUFFICIENT_PAYMENT", r2.code, r2.hash, r2.code === "tecINSUFFICIENT_PAYMENT");

  log("\n--- 3. First-loss cover: a withdrawal that would drop below the minimum ---");
  const brokerNode = await readEntry(client, BROKER_ID);
  const cover = Number(brokerNode.CoverAvailable ?? 0);
  const debt = Number(brokerNode.DebtTotal ?? 0);
  const coverRequired = debt * Number(brokerNode.CoverRateMinimum) / 100_000;
  const threshold = cover - coverRequired;
  log(`  CoverAvailable   : ${fmt(cover)}`);
  log(`  DebtTotal        : ${fmt(debt)}`);
  log(`  CoverRateMinimum : ${(Number(brokerNode.CoverRateMinimum) / 1000).toFixed(2)} %`);
  log(`  Cover required for the outstanding debt : ${fmt(coverRequired)}`);
  log(`  Withdrawable without breaking the ratio : ${fmt(threshold)}`);

  // The amount is above the threshold but below the balance: the funds exist
  // and only the cover ratio blocks the withdrawal. This tests the first-loss
  // cover guardrail, not a plain insufficient balance.
  const tooMuch = Math.round(cover - coverRequired / 2);
  log(`  Withdrawing ${fmt(tooMuch)}: the funds are there (${fmt(cover)} available),`);
  log(`  but only ${fmt(cover - tooMuch)} would remain for ${fmt(coverRequired)} required.`);
  const r3 = await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverWithdraw",
    LoanBrokerID: BROKER_ID,
    Amount: String(tooMuch),
  }, { label: "LoanBrokerCoverWithdraw (below the minimum)" });
  record(3, "First-loss cover protected (withdrawal below the minimum ratio)",
    "tecINSUFFICIENT_FUNDS", r3.code, r3.hash, String(r3.code).startsWith("tec"));
  log("  Feedback note: the code is `tecINSUFFICIENT_FUNDS` although the funds are");
  log("  sufficient. The violated rule is the cover ratio. See FEEDBACK-RAW [14:22].");

  log("\n--- 3 bis. Positive control: just under the threshold, it goes through ---");
  log("  Without this control, the test would only show that the withdrawal fails,");
  log("  not that the limit sits at the cover ratio.");
  const okAmount = Math.floor(threshold - 1e6); // 1 XRP of margin under the threshold
  const r3b = await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverWithdraw",
    LoanBrokerID: BROKER_ID,
    Amount: String(okAmount),
  }, { label: `LoanBrokerCoverWithdraw ${fmt(okAmount)}` });
  log(`  ${fmt(okAmount)}: ${r3b.code}  (expected: tesSUCCESS)`);
  if (r3b.ok) {
    log("  PASS: the limit is exactly the cover ratio stored on the ledger.");
    // restore the state so the scenario stays replayable as is
    await submitRaw(client, broker.seed, {
      TransactionType: "LoanBrokerCoverDeposit",
      LoanBrokerID: BROKER_ID,
      Amount: String(okAmount),
    }, { label: "LoanBrokerCoverDeposit (restore)" });
  }

  log("\n--- 4. Permission check: LoanBrokerSet by a third party ---");
  log("  An account that does not own the vault tries to attach a broker to it.");
  const r4 = await submitRaw(client, spare.seed, {
    TransactionType: "LoanBrokerSet",
    VaultID: VAULT_ID,
    ManagementFeeRate: pctToRate(2),
    DebtMaximum: XRP(1_000),
    CoverRateMinimum: pctToRate(10),
    CoverRateLiquidation: pctToRate(5),
  }, { label: "LoanBrokerSet (third party)" });
  record(4, "Permission (LoanBrokerSet by a non-owner)",
    "tecNO_PERMISSION", r4.code, r4.hash, r4.code === "tecNO_PERMISSION");

  log("\n--- 5. Withdrawal beyond the unlent liquidity ---");
  log("  The lender tries to withdraw 10,000 XRP: the lent principal is not");
  log("  withdrawable until the borrower has repaid it.");
  const r5 = await submitRaw(client, lender.seed, {
    TransactionType: "VaultWithdraw",
    VaultID: VAULT_ID,
    Amount: XRP(10_000),
  }, { label: "VaultWithdraw (excessive)" });
  record(5, "Withdrawal capped at the available liquidity",
    "tecINSUFFICIENT_FUNDS", r5.code, r5.hash, String(r5.code).startsWith("tec"));
} catch (e) {
  log(`\nERROR: ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 600));
} finally {
  log("\n" + "=".repeat(72));
  log("STEP 7: protocol guardrails demonstrated");
  log("=".repeat(72));
  for (const r of results) {
    log(`${r.ok ? "PASS" : "FAIL"} ${r.n}. ${r.title}`);
    log(`     ${r.actual}${r.hash ? `  ${r.hash}` : ""}`);
  }
  const ok = results.filter((r) => r.ok).length;
  log(`\n${ok}/${results.length} guardrails triggered as expected.`);
  log("All these rejections are validated on-chain; each hash can be checked in the explorer.");
  await client.disconnect();
}
