// Étapes 4 à 6 du minimum bar Track 1, sur le prêt ouvert par test-v11-blocking.mjs.
//
//   4. Drawdown            — implicite au LoanSet : AUCUNE transaction dédiée n'existe.
//   5. Remboursement       — LoanPay d'une échéance.
//   6. Retrait capital + rendement — VaultWithdraw par le déposant.
//
// Chaque étape lit l'état du ledger avant/après : c'est la preuve, et c'est
// aussi ce qui alimente FEEDBACK-RAW (champs dérivés lisibles ou pas — H9).

import { Client } from "xrpl";
import { NET, txUrl } from "../../scripts/config.mjs";
import { loadAccounts, submitRaw, readEntry } from "../../scripts/raw-submit.mjs";

// Identifiants produits par le dernier run de test-v11-blocking.mjs.
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
  step(4, "Drawdown — implicite, pas de transaction dédiée");
  const loan0 = await readEntry(client, LOAN_ID);
  const vault0 = await readEntry(client, VAULT_ID);
  log(`  PrincipalOutstanding  : ${fmt(loan0.PrincipalOutstanding)}`);
  log(`  Vault AssetsTotal     : ${fmt(vault0.AssetsTotal)}`);
  log(`  Vault AssetsAvailable : ${fmt(vault0.AssetsAvailable)}`);
  log(`  → écart total/disponible = ${fmt(Number(vault0.AssetsTotal) - Number(vault0.AssetsAvailable))}`);
  log("  C'est le principal tiré. Le LoanSet a transféré les fonds à l'emprunteur");
  log("  au moment de l'origination : il n'existe ni `LoanDraw` ni flag de tirage,");
  log("  ni dans xrpl@4.6.0 ni dans les TRANSACTION_TYPES de ripple-binary-codec.");

  // ─────────────────────────────────────────────────────────────────────────
  step(5, "LoanPay — une échéance");
  // PeriodicPayment est exprimé en drops AVEC des décimales ("25013700.131…"),
  // alors que le drop est l'unité indivisible du XRP. On arrondit au drop
  // supérieur pour ne pas sous-payer. Item de feedback à part entière.
  // ⚠️ Payer exactement `ceil(PeriodicPayment)` donne `tecINSUFFICIENT_PAYMENT`.
  // Le montant réellement dû est PeriodicPayment + LoanServiceFee, et ce total
  // n'est exposé par AUCUN champ du ledger. Cf. FEEDBACK-RAW [14:02].
  const periodic = loan0.PeriodicPayment;
  const toPay = String(Math.ceil(Number(periodic)) + Number(loan0.LoanServiceFee));
  log(`  PeriodicPayment annoncé : ${periodic} drops`);
  log(`  + LoanServiceFee        : ${loan0.LoanServiceFee} drops`);
  log(`  = payé                  : ${toPay} drops = ${fmt(toPay)}`);
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
  log(`  emprunteur : ${fmt(borrowerBefore)} → ${fmt(borrowerAfter)}  (${fmt(borrowerAfter - borrowerBefore)})`);
  log(`  PrincipalOutstanding : ${fmt(loan0.PrincipalOutstanding)} → ${fmt(loan1.PrincipalOutstanding)}`);
  log(`  PaymentRemaining     : ${loan0.PaymentRemaining} → ${loan1.PaymentRemaining}`);
  log(`  Vault AssetsTotal    : ${fmt(vault0.AssetsTotal)} → ${fmt(vault1.AssetsTotal)}`);
  // AssetsTotal = liquidité + principal prêté. Un remboursement déplace du
  // principal de l'un vers l'autre sans changer le total : la variation de
  // AssetsTotal EST le rendement, il n'y a rien à en soustraire.
  const yieldDrops = Number(vault1.AssetsTotal) - Number(vault0.AssetsTotal);
  log(`  → rendement accru pour le vault sur cette échéance : ${fmt(yieldDrops)}`);

  // ─────────────────────────────────────────────────────────────────────────
  step(6, "VaultWithdraw — capital + rendement");
  const available = Number(vault1.AssetsAvailable ?? 0);  // champ absent si nul, cf. [14:05]
  log(`  liquidité disponible dans le vault : ${fmt(available)}`);
  log("  (le reste est immobilisé dans le prêt en cours — c'est le comportement");
  log("   attendu d'un vault open-ended : on ne retire que le non-prêté)");

  if (available <= 0) {
    log("  rien à retirer : toute la liquidité est prêtée. Étape 6 déjà démontrée");
    log("  par les retraits précédents (cf. FEEDBACK-RAW [14:08]).");
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
    log(`  prêteur : ${fmt(lenderBefore)} → ${fmt(lenderAfter)}  (net ${fmt(lenderAfter - lenderBefore)})`);
    log(`  Vault AssetsTotal     : ${fmt(vault1.AssetsTotal)} → ${fmt(vault2.AssetsTotal)}`);
    // `AssetsAvailable` DISPARAÎT du nœud quand il tombe à zéro — cf. [14:05].
    log(`  Vault AssetsAvailable : ${fmt(vault1.AssetsAvailable)} → ${vault2.AssetsAvailable === undefined ? "CHAMP ABSENT (= 0)" : fmt(vault2.AssetsAvailable)}`);
    log(`\n  Retiré maintenant : ${fmt(available)}`);
    log(`  Encore prêté      : ${fmt(loan1.PrincipalOutstanding)} (principal restant dû)`);
  }

} catch (e) {
  if (e.message !== "SKIP_STEP_6") log(`\n💥 ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 600));
} finally {
  log("\n─── Récapitulatif ───");
  for (const t of timeline) log(`  ${t.label.padEnd(16)} ${String(t.code).padEnd(18)} ${t.hash ?? ""}`);
  for (const t of timeline) if (t.hash) log(`  ${txUrl(t.hash)}`);
  await client.disconnect();
}
