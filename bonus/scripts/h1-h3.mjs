// H1: does `CoverRateLiquidation` do what its name suggests?
// H3: does an overpayment return a silent partial success?
//
// Two hypotheses the hackathon brief itself raises:
//   "Did first-loss-capital parameters behave as their names suggested?"
// Both touch real money on the borrower side and on the depositor side.
//
// Usage: node bonus/scripts/h1-h3.mjs

import { Client, Wallet } from "xrpl";
import { NET, pctToRate, txUrl } from "../../scripts/config.mjs";
import { loadAccounts, submitRaw, signLoanSetCounterparty, readEntry } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const log = (...a) => console.log(...a);
const title = (t) => log(`\n${"═".repeat(72)}\n  ${t}\n${"═".repeat(72)}`);
const step = (t) => log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const createdNode = (r, t) =>
  (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;

const COVER_MIN_PCT = 10;   // CoverRateMinimum
const COVER_LIQ_PCT = 5;    // CoverRateLiquidation
const findings = [];

const client = new Client(NET.wss);
try {
  await client.connect();
  const { lender, borrower, broker } = loadAccounts();
  const brokerW = Wallet.fromSeed(broker.seed);
  const borrowerW = Wallet.fromSeed(borrower.seed);

  // ── Shared setup ──────────────────────────────────────────────────────
  title("Setup: vault 200 XRP, cover 50 XRP, CoverRateMinimum 10 %, CoverRateLiquidation 5 %");
  const v = await submitRaw(client, broker.seed, {
    TransactionType: "VaultCreate", Asset: { currency: "XRP" },
    AssetsMaximum: XRP(10_000), WithdrawalPolicy: 1,
    Data: Buffer.from("CY-HACK H1-H3").toString("hex").toUpperCase(),
  }, { label: "VaultCreate" });
  const vaultId = createdNode(v.result, "Vault")?.LedgerIndex;

  await submitRaw(client, lender.seed, {
    TransactionType: "VaultDeposit", VaultID: vaultId, Amount: XRP(200),
  }, { label: "VaultDeposit 200" });

  const b = await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerSet", VaultID: vaultId,
    ManagementFeeRate: pctToRate(2), DebtMaximum: XRP(1_000),
    CoverRateMinimum: pctToRate(COVER_MIN_PCT),
    CoverRateLiquidation: pctToRate(COVER_LIQ_PCT),
  }, { label: "LoanBrokerSet" });
  const brokerId = createdNode(b.result, "LoanBroker")?.LedgerIndex;

  await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: brokerId, Amount: XRP(50),
  }, { label: "CoverDeposit 50" });

  const originate = async (label, principal, gracePeriod, flags = 0) => {
    const tx = {
      TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: brokerId,
      Counterparty: borrowerW.address, PrincipalRequested: XRP(principal),
      InterestRate: pctToRate(8), PaymentInterval: 86_400, PaymentTotal: 4,
      GracePeriod: gracePeriod, LoanOriginationFee: XRP(1), LoanServiceFee: XRP(0.5),
      LatePaymentFee: XRP(0.25), ClosePaymentFee: XRP(0.25),
    };
    if (flags) tx.Flags = flags;
    const prepared = await client.autofill(tx);
    const blob = signLoanSetCounterparty(brokerW.sign(prepared).tx_blob, borrower.seed);
    const res = await client.submitAndWait(blob);
    const code = res.result.meta?.TransactionResult;
    log(`${label.padEnd(28)} ${code}\n  ${txUrl(res.result.hash)}`);
    return { code, hash: res.result.hash, loanId: createdNode(res.result, "Loan")?.LedgerIndex };
  };

  const dueOf = (loan) =>
    Math.ceil(Number(loan.PeriodicPayment)) + Number(loan.LoanServiceFee);

  // ══ H3 ════════════════════════════════════════════════════════════════
  title("H3: overpayment, silent partial success or rejection?");

  step("Loan A: 50 XRP, WITHOUT lsfLoanOverpayment");
  const A = await originate("LoanSet A", 50, 3600);
  const loanA0 = await readEntry(client, A.loanId);
  const dueA = dueOf(loanA0);
  log(`  exact installment: ${dueA} drops (${fmt(dueA)})`);
  log(`  PrincipalOutstanding before: ${fmt(loanA0.PrincipalOutstanding)}`);

  step(`LoanPay of 3 × the installment (${fmt(dueA * 3)}) with no flag at all`);
  const payA = await submitRaw(client, borrower.seed, {
    TransactionType: "LoanPay", LoanID: A.loanId, Amount: String(dueA * 3),
  }, { label: "LoanPay ×3 no flag" });
  const loanA1 = await readEntry(client, A.loanId);
  const deltaA = Number(loanA0.PrincipalOutstanding) - Number(loanA1.PrincipalOutstanding);
  log(`  code ${payA.code}`);
  log(`  PrincipalOutstanding after: ${fmt(loanA1.PrincipalOutstanding)}  (−${fmt(deltaA)})`);
  log(`  PaymentRemaining: ${loanA0.PaymentRemaining} → ${loanA1.PaymentRemaining}`);
  findings.push({
    h: "H3", scenario: "overpayment ×3 no flag", code: payA.code, hash: payA.hash,
    note: `${fmt(deltaA)} of principal debited, installments ${loanA0.PaymentRemaining}→${loanA1.PaymentRemaining}`,
  });

  step("Loan B: 50 XRP, WITH tfLoanOverpayment on LoanSet");
  const B = await originate("LoanSet B (overpayment)", 50, 3600, 65536); // tfLoanOverpayment
  if (B.loanId) {
    const loanB0 = await readEntry(client, B.loanId);
    log(`  Loan node Flags: ${loanB0.Flags} (lsfLoanOverpayment = 262144)`);
    const dueB = dueOf(loanB0);

    step("LoanPay ×3 WITH tfLoanOverpayment on the transaction");
    const payB = await submitRaw(client, borrower.seed, {
      TransactionType: "LoanPay", LoanID: B.loanId, Amount: String(dueB * 3), Flags: 65536,
    }, { label: "LoanPay ×3 + flag" });
    const loanB1 = await readEntry(client, B.loanId);
    const deltaB = Number(loanB0.PrincipalOutstanding) - Number(loanB1.PrincipalOutstanding);
    log(`  code ${payB.code}`);
    log(`  PrincipalOutstanding: ${fmt(loanB0.PrincipalOutstanding)} → ${fmt(loanB1.PrincipalOutstanding)}  (−${fmt(deltaB)})`);
    log(`  PaymentRemaining: ${loanB0.PaymentRemaining} → ${loanB1.PaymentRemaining}`);
    findings.push({
      h: "H3", scenario: "overpayment ×3 WITH both flags", code: payB.code, hash: payB.hash,
      note: `${fmt(deltaB)} of principal debited, installments ${loanB0.PaymentRemaining}→${loanB1.PaymentRemaining}`,
    });
  }

  // ══ H1 ════════════════════════════════════════════════════════════════
  title("H1: first-loss capital, does the name keep its promise?");

  step("Loan C: 50 XRP, short GracePeriod to be able to default quickly");
  let C = await originate("LoanSet C", 50, 10);
  if (!C.loanId) { log("  GracePeriod 10 s refused, going back up to 60 s"); C = await originate("LoanSet C (60s)", 50, 60); }
  if (!C.loanId) throw new Error("unable to originate loan C");

  const brokerBefore = await readEntry(client, brokerId);
  const vaultBefore = await vaultSnapshot(client, vaultId);
  const loanC0 = await readEntry(client, C.loanId);
  log(`\n  BEFORE default`);
  log(`    DebtTotal        ${fmt(brokerBefore.DebtTotal ?? 0)}`);
  log(`    CoverAvailable   ${fmt(brokerBefore.CoverAvailable ?? 0)}`);
  log(`    vault AssetsTotal ${fmt(vaultBefore.assetsTotal)}`);
  log(`    loan C: principal ${fmt(loanC0.PrincipalOutstanding)}, TotalValueOutstanding ${fmt(loanC0.TotalValueOutstanding ?? 0)}`);

  step("LoanManage tfLoanImpair: the broker flags a probable loss");
  const imp = await submitRaw(client, broker.seed, {
    TransactionType: "LoanManage", LoanID: C.loanId, Flags: 131072,
  }, { label: "LoanManage impair" });
  findings.push({ h: "H1", scenario: "tfLoanImpair", code: imp.code, hash: imp.hash, note: "" });

  const grace = C.loanId && (await readEntry(client, C.loanId)).GracePeriod;
  const waitS = Number(grace ?? 60) + 8;
  step(`Waiting for the grace period (${grace} s) + margin: ${waitS} s`);
  await sleep(waitS * 1000);

  step("LoanManage tfLoanDefault: recording the default");
  const def = await submitRaw(client, broker.seed, {
    TransactionType: "LoanManage", LoanID: C.loanId, Flags: 65536,
  }, { label: "LoanManage default" });
  findings.push({ h: "H1", scenario: "tfLoanDefault", code: def.code, hash: def.hash, note: "" });

  const brokerAfter = await readEntry(client, brokerId);
  const vaultAfter = await vaultSnapshot(client, vaultId);
  const coverUsed = Number(brokerBefore.CoverAvailable ?? 0) - Number(brokerAfter.CoverAvailable ?? 0);
  const vaultLoss = Number(vaultBefore.assetsTotal) - Number(vaultAfter.assetsTotal);
  const debt = Number(brokerBefore.DebtTotal ?? 0);
  const expected = Math.min(debt * (COVER_MIN_PCT / 100) * (COVER_LIQ_PCT / 100), Number(loanC0.PrincipalOutstanding));

  log(`\n  AFTER default`);
  log(`    CoverAvailable   ${fmt(brokerBefore.CoverAvailable ?? 0)} → ${fmt(brokerAfter.CoverAvailable ?? 0)}`);
  log(`    drawn from the first-loss capital     : ${fmt(Math.round(coverUsed))}`);
  log(`    loss borne by the vault               : ${fmt(Math.round(vaultLoss))}`);
  log(`    cover still available                 : ${fmt(brokerAfter.CoverAvailable ?? 0)}`);
  log(`\n  Formula from the docs:`);
  log(`    min(DebtTotal × CoverRateMinimum × CoverRateLiquidation, amount in default)`);
  log(`    = min(${fmt(debt)} × ${COVER_MIN_PCT}% × ${COVER_LIQ_PCT}%, ${fmt(loanC0.PrincipalOutstanding)})`);
  log(`    = ${fmt(Math.round(expected))}   → observed ${fmt(Math.round(coverUsed))}`);
  const ratio = vaultLoss > 0 ? (100 * coverUsed) / (coverUsed + vaultLoss) : 0;
  log(`\n  ▸▸ The first-loss capital absorbed ${ratio.toFixed(2)} % of the loss,`);
  log(`     while ${fmt(brokerAfter.CoverAvailable ?? 0)} remained available.`);
  findings.push({
    h: "H1", scenario: "default summary", code: "-", hash: "",
    note: `cover drawn ${fmt(Math.round(coverUsed))}, vault loss ${fmt(Math.round(vaultLoss))}, cover remaining ${fmt(brokerAfter.CoverAvailable ?? 0)}`,
  });

  log(`\n  VaultID ${vaultId}\n  BrokerID ${brokerId}\n  LoanA ${A.loanId}\n  LoanB ${B.loanId}\n  LoanC ${C.loanId}`);
} catch (e) {
  log(`\n💥 ABORTED: ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 600));
} finally {
  log("\n─── Summary ───");
  for (const f of findings) log(`  ${f.h}  ${String(f.scenario).padEnd(34)} ${String(f.code).padEnd(22)} ${f.note}\n       ${f.hash}`);
  await client.disconnect();
}
