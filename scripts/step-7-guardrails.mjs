// ÉTAPE 7 du minimum bar Track 1 — « Démontrer une transaction rejetée par un
// garde-fou du protocole ». C'est un livrable, pas un accident : chaque rejet
// ci-dessous est provoqué délibérément, avec son code et son hash.
//
// Le brief cite trois pistes : liquidité insuffisante, paiement hors calendrier,
// comportement du first-loss cover. On couvre les trois, plus le contrôle de
// permission rencontré à [13:26].
//
// Toutes les transactions sont soumises au ledger et VALIDÉES : un rejet `tec`
// est un échec métier inscrit on-chain, avec un hash vérifiable dans l'explorer.
// C'est la différence avec un rejet local (`tem`/`fails local checks`), qui ne
// laisse aucune trace — distinction utile à faire pendant la démo.

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
const record = (n, titre, attendu, obtenu, hash, ok) => {
  results.push({ n, titre, attendu, obtenu, hash, ok });
  log(`  attendu : rejet (${attendu})`);
  log(`  obtenu  : ${obtenu}`);
  if (hash) log(`  ${txUrl(hash)}`);
  log(ok ? "  ✅ garde-fou démontré" : "  ⚠️  PAS le comportement attendu — à investiguer");
};

const client = new Client(NET.wss);
await client.connect();

try {
  const { lender, borrower, broker, spare } = loadAccounts();
  const vault = await readEntry(client, VAULT_ID);
  const loan = await readEntry(client, LOAN_ID);
  const available = Number(vault.AssetsAvailable ?? 0);

  log("État de départ");
  log(`  Vault AssetsTotal     : ${fmt(vault.AssetsTotal)}`);
  log(`  Vault AssetsAvailable : ${fmt(available)}`);
  log(`  Loan PrincipalOutstanding : ${fmt(loan.PrincipalOutstanding)}`);
  log(`  Loan PaymentRemaining     : ${loan.PaymentRemaining}`);

  // ── 1 ────────────────────────────────────────────────────────────────────
  log("\n─── 1. Liquidité insuffisante — LoanSet au-delà du disponible ───");
  log(`  On demande un prêt de 5 000 XRP alors que le vault n'a que ${fmt(available)}.`);
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
  record(1, "Liquidité insuffisante (LoanSet > AssetsAvailable)",
    "tecINSUFFICIENT_FUNDS", c1, r1.result.hash, c1 === "tecINSUFFICIENT_FUNDS");

  // ── 2 ────────────────────────────────────────────────────────────────────
  log("\n─── 2. Paiement hors calendrier — LoanPay sous-payé ───");
  log(`  Échéance due : ${loan.PeriodicPayment} + ${loan.LoanServiceFee} drops de frais.`);
  log("  On paie délibérément 1 XRP, très en dessous.");
  const r2 = await submitRaw(client, borrower.seed, {
    TransactionType: "LoanPay",
    LoanID: LOAN_ID,
    Amount: XRP(1),
  }, { label: "LoanPay (sous-payé)" });
  record(2, "Paiement insuffisant (LoanPay < échéance due)",
    "tecINSUFFICIENT_PAYMENT", r2.code, r2.hash, r2.code === "tecINSUFFICIENT_PAYMENT");

  // ── 3 ────────────────────────────────────────────────────────────────────
  log("\n─── 3. First-loss cover — retrait qui passerait sous le minimum ───");
  const brokerNode = await readEntry(client, BROKER_ID);
  const cover = Number(brokerNode.CoverAvailable ?? 0);
  const debt = Number(brokerNode.DebtTotal ?? 0);
  const coverRequis = debt * Number(brokerNode.CoverRateMinimum) / 100_000;
  const seuil = cover - coverRequis;
  log(`  CoverAvailable   : ${fmt(cover)}`);
  log(`  DebtTotal        : ${fmt(debt)}`);
  log(`  CoverRateMinimum : ${(Number(brokerNode.CoverRateMinimum) / 1000).toFixed(2)} %`);
  log(`  → cover requis pour la dette en cours : ${fmt(coverRequis)}`);
  log(`  → retirable sans violer le ratio      : ${fmt(seuil)}`);

  // On demande PLUS que le seuil mais MOINS que le solde : les fonds existent,
  // c'est le ratio de couverture qui bloque. C'est le vrai garde-fou du
  // first-loss cover, à distinguer d'un simple « solde insuffisant ».
  const trop = Math.round(cover - coverRequis / 2);
  log(`  On retire ${fmt(trop)} : les fonds SONT là (${fmt(cover)} disponibles),`);
  log(`  mais il ne resterait que ${fmt(cover - trop)} pour ${fmt(coverRequis)} requis.`);
  const r3 = await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverWithdraw",
    LoanBrokerID: BROKER_ID,
    Amount: String(trop),
  }, { label: "LoanBrokerCoverWithdraw (sous le minimum)" });
  record(3, "First-loss cover protégé (retrait sous le ratio minimum)",
    "tecINSUFFICIENT_FUNDS", r3.code, r3.hash, String(r3.code).startsWith("tec"));
  log("  ⚠️  note feedback : le code est `tecINSUFFICIENT_FUNDS` alors que les fonds");
  log("      sont suffisants — c'est le RATIO qui est violé. Cf. FEEDBACK-RAW [14:22].");

  // ── 3 bis ────────────────────────────────────────────────────────────────
  log("\n─── 3 bis. Contrôle positif — juste sous le seuil, ça passe ───");
  log("  Sans ce contrôle, on ne prouve pas que la limite est au bon endroit :");
  log("  on prouverait seulement que la transaction échoue toujours.");
  const okAmount = Math.floor(seuil - 1e6); // 1 XRP de marge sous le seuil
  const r3b = await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverWithdraw",
    LoanBrokerID: BROKER_ID,
    Amount: String(okAmount),
  }, { label: `LoanBrokerCoverWithdraw ${fmt(okAmount)}` });
  log(`  ${fmt(okAmount)} → ${r3b.code}  (attendu : tesSUCCESS)`);
  if (r3b.ok) {
    log("  ✅ la limite est exactement le ratio de couverture annoncé par le ledger.");
    // remise en état pour que le scénario reste rejouable tel quel
    await submitRaw(client, broker.seed, {
      TransactionType: "LoanBrokerCoverDeposit",
      LoanBrokerID: BROKER_ID,
      Amount: String(okAmount),
    }, { label: "LoanBrokerCoverDeposit (remise en état)" });
  }

  // ── 4 ────────────────────────────────────────────────────────────────────
  log("\n─── 4. Contrôle de permission — LoanBrokerSet par un tiers ───");
  log("  Un compte qui ne possède pas le vault tente d'y attacher un broker.");
  const r4 = await submitRaw(client, spare.seed, {
    TransactionType: "LoanBrokerSet",
    VaultID: VAULT_ID,
    ManagementFeeRate: pctToRate(2),
    DebtMaximum: XRP(1_000),
    CoverRateMinimum: pctToRate(10),
    CoverRateLiquidation: pctToRate(5),
  }, { label: "LoanBrokerSet (tiers)" });
  record(4, "Permission (LoanBrokerSet par un non-propriétaire)",
    "tecNO_PERMISSION", r4.code, r4.hash, r4.code === "tecNO_PERMISSION");

  // ── 5 ────────────────────────────────────────────────────────────────────
  log("\n─── 5. Retrait au-delà de la liquidité non prêtée ───");
  log("  Le prêteur tente de retirer 10 000 XRP : le principal prêté n'est pas");
  log("  retirable tant que l'emprunteur ne l'a pas remboursé.");
  const r5 = await submitRaw(client, lender.seed, {
    TransactionType: "VaultWithdraw",
    VaultID: VAULT_ID,
    Amount: XRP(10_000),
  }, { label: "VaultWithdraw (excessif)" });
  record(5, "Retrait plafonné à la liquidité disponible",
    "tecINSUFFICIENT_FUNDS", r5.code, r5.hash, String(r5.code).startsWith("tec"));
} catch (e) {
  log(`\n💥 ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 600));
} finally {
  log("\n" + "═".repeat(72));
  log("ÉTAPE 7 — garde-fous du protocole démontrés");
  log("═".repeat(72));
  for (const r of results) {
    log(`${r.ok ? "✅" : "⚠️ "} ${r.n}. ${r.titre}`);
    log(`     ${r.obtenu}${r.hash ? `  ${r.hash}` : ""}`);
  }
  const ok = results.filter((r) => r.ok).length;
  log(`\n${ok}/${results.length} garde-fous déclenchés comme prévu.`);
  log("Tous ces rejets sont VALIDÉS on-chain : chaque hash est vérifiable dans l'explorer.");
  await client.disconnect();
}
