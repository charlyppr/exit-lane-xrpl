// H1 — `CoverRateLiquidation` fait-il ce que son nom suggère ?
// H3 — un surpaiement renvoie-t-il un succès silencieux partiel ?
//
// Deux hypothèses que le brief du hackathon pose lui-même :
//   « Did first-loss-capital parameters behave as their names suggested? »
// Les deux touchent à de l'argent réel côté emprunteur et côté déposant.
//
// Usage : node bonus/scripts/h1-h3.mjs

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

  // ── Décor commun ──────────────────────────────────────────────────────
  title("Décor : vault 200 XRP, cover 50 XRP, CoverRateMinimum 10 %, CoverRateLiquidation 5 %");
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
  title("H3 — surpaiement : succès silencieux partiel, ou rejet ?");

  step("Prêt A — 50 XRP, SANS lsfLoanOverpayment");
  const A = await originate("LoanSet A", 50, 3600);
  const loanA0 = await readEntry(client, A.loanId);
  const dueA = dueOf(loanA0);
  log(`  échéance exacte : ${dueA} drops (${fmt(dueA)})`);
  log(`  PrincipalOutstanding avant : ${fmt(loanA0.PrincipalOutstanding)}`);

  step(`LoanPay de 3 × l'échéance (${fmt(dueA * 3)}) sans aucun flag`);
  const payA = await submitRaw(client, borrower.seed, {
    TransactionType: "LoanPay", LoanID: A.loanId, Amount: String(dueA * 3),
  }, { label: "LoanPay ×3 sans flag" });
  const loanA1 = await readEntry(client, A.loanId);
  const deltaA = Number(loanA0.PrincipalOutstanding) - Number(loanA1.PrincipalOutstanding);
  log(`  code ${payA.code}`);
  log(`  PrincipalOutstanding après : ${fmt(loanA1.PrincipalOutstanding)}  (−${fmt(deltaA)})`);
  log(`  PaymentRemaining : ${loanA0.PaymentRemaining} → ${loanA1.PaymentRemaining}`);
  findings.push({
    h: "H3", cas: "surpaiement ×3 sans flag", code: payA.code, hash: payA.hash,
    note: `débité ${fmt(deltaA)} de principal, échéances ${loanA0.PaymentRemaining}→${loanA1.PaymentRemaining}`,
  });

  step("Prêt B — 50 XRP, AVEC tfLoanOverpayment sur LoanSet");
  const B = await originate("LoanSet B (overpayment)", 50, 3600, 65536); // tfLoanOverpayment
  if (B.loanId) {
    const loanB0 = await readEntry(client, B.loanId);
    log(`  Flags du nœud Loan : ${loanB0.Flags} (lsfLoanOverpayment = 262144)`);
    const dueB = dueOf(loanB0);

    step("LoanPay ×3 AVEC tfLoanOverpayment sur la transaction");
    const payB = await submitRaw(client, borrower.seed, {
      TransactionType: "LoanPay", LoanID: B.loanId, Amount: String(dueB * 3), Flags: 65536,
    }, { label: "LoanPay ×3 + flag" });
    const loanB1 = await readEntry(client, B.loanId);
    const deltaB = Number(loanB0.PrincipalOutstanding) - Number(loanB1.PrincipalOutstanding);
    log(`  code ${payB.code}`);
    log(`  PrincipalOutstanding : ${fmt(loanB0.PrincipalOutstanding)} → ${fmt(loanB1.PrincipalOutstanding)}  (−${fmt(deltaB)})`);
    log(`  PaymentRemaining : ${loanB0.PaymentRemaining} → ${loanB1.PaymentRemaining}`);
    findings.push({
      h: "H3", cas: "surpaiement ×3 AVEC les deux flags", code: payB.code, hash: payB.hash,
      note: `débité ${fmt(deltaB)} de principal, échéances ${loanB0.PaymentRemaining}→${loanB1.PaymentRemaining}`,
    });
  }

  // ══ H1 ════════════════════════════════════════════════════════════════
  title("H1 — first-loss capital : le nom tient-il ses promesses ?");

  step("Prêt C — 50 XRP, GracePeriod court pour pouvoir défauter vite");
  let C = await originate("LoanSet C", 50, 10);
  if (!C.loanId) { log("  GracePeriod 10 s refusé, on remonte à 60 s"); C = await originate("LoanSet C (60s)", 50, 60); }
  if (!C.loanId) throw new Error("impossible d'originer le prêt C");

  const brokerBefore = await readEntry(client, brokerId);
  const vaultBefore = await vaultSnapshot(client, vaultId);
  const loanC0 = await readEntry(client, C.loanId);
  log(`\n  AVANT défaut`);
  log(`    DebtTotal        ${fmt(brokerBefore.DebtTotal ?? 0)}`);
  log(`    CoverAvailable   ${fmt(brokerBefore.CoverAvailable ?? 0)}`);
  log(`    vault AssetsTotal ${fmt(vaultBefore.assetsTotal)}`);
  log(`    prêt C : principal ${fmt(loanC0.PrincipalOutstanding)}, TotalValueOutstanding ${fmt(loanC0.TotalValueOutstanding ?? 0)}`);

  step("LoanManage tfLoanImpair — le broker signale une perte probable");
  const imp = await submitRaw(client, broker.seed, {
    TransactionType: "LoanManage", LoanID: C.loanId, Flags: 131072,
  }, { label: "LoanManage impair" });
  findings.push({ h: "H1", cas: "tfLoanImpair", code: imp.code, hash: imp.hash, note: "" });

  const grace = C.loanId && (await readEntry(client, C.loanId)).GracePeriod;
  const waitS = Number(grace ?? 60) + 8;
  step(`Attente de la grace period (${grace} s) + marge — ${waitS} s`);
  await sleep(waitS * 1000);

  step("LoanManage tfLoanDefault — constatation du défaut");
  const def = await submitRaw(client, broker.seed, {
    TransactionType: "LoanManage", LoanID: C.loanId, Flags: 65536,
  }, { label: "LoanManage default" });
  findings.push({ h: "H1", cas: "tfLoanDefault", code: def.code, hash: def.hash, note: "" });

  const brokerAfter = await readEntry(client, brokerId);
  const vaultAfter = await vaultSnapshot(client, vaultId);
  const coverUsed = Number(brokerBefore.CoverAvailable ?? 0) - Number(brokerAfter.CoverAvailable ?? 0);
  const vaultLoss = Number(vaultBefore.assetsTotal) - Number(vaultAfter.assetsTotal);
  const debt = Number(brokerBefore.DebtTotal ?? 0);
  const attendu = Math.min(debt * (COVER_MIN_PCT / 100) * (COVER_LIQ_PCT / 100), Number(loanC0.PrincipalOutstanding));

  log(`\n  APRÈS défaut`);
  log(`    CoverAvailable   ${fmt(brokerBefore.CoverAvailable ?? 0)} → ${fmt(brokerAfter.CoverAvailable ?? 0)}`);
  log(`    ponctionné sur le first-loss capital : ${fmt(Math.round(coverUsed))}`);
  log(`    perte encaissée par le vault          : ${fmt(Math.round(vaultLoss))}`);
  log(`    cover encore disponible               : ${fmt(brokerAfter.CoverAvailable ?? 0)}`);
  log(`\n  Formule de la doc :`);
  log(`    min(DebtTotal × CoverRateMinimum × CoverRateLiquidation, montant en défaut)`);
  log(`    = min(${fmt(debt)} × ${COVER_MIN_PCT}% × ${COVER_LIQ_PCT}%, ${fmt(loanC0.PrincipalOutstanding)})`);
  log(`    = ${fmt(Math.round(attendu))}   → observé ${fmt(Math.round(coverUsed))}`);
  const ratio = vaultLoss > 0 ? (100 * coverUsed) / (coverUsed + vaultLoss) : 0;
  log(`\n  ▸▸ Le first-loss capital a absorbé ${ratio.toFixed(2)} % de la perte,`);
  log(`     alors que ${fmt(brokerAfter.CoverAvailable ?? 0)} restaient disponibles.`);
  findings.push({
    h: "H1", cas: "bilan du défaut", code: "—", hash: "",
    note: `cover ponctionné ${fmt(Math.round(coverUsed))}, perte vault ${fmt(Math.round(vaultLoss))}, cover restant ${fmt(brokerAfter.CoverAvailable ?? 0)}`,
  });

  log(`\n  VaultID ${vaultId}\n  BrokerID ${brokerId}\n  LoanA ${A.loanId}\n  LoanB ${B.loanId}\n  LoanC ${C.loanId}`);
} catch (e) {
  log(`\n💥 ARRÊT : ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 600));
} finally {
  log("\n─── Récapitulatif ───");
  for (const f of findings) log(`  ${f.h}  ${String(f.cas).padEnd(34)} ${String(f.code).padEnd(22)} ${f.note}\n       ${f.hash}`);
  await client.disconnect();
}
