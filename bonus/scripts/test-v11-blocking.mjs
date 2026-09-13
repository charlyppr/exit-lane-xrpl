// TEST DÉCISIF — LendingProtocolV1_1 est actif sur ce devnet (cf. FEEDBACK-RAW [13:05]).
// Question à trancher : un LoanSet passe-t-il sur un vault OPEN-ENDED, ou V1.1
// restreint-il les prêts aux vaults fermés ? Toute la prémisse du Track 1 en dépend.
//
// Couvre les étapes 1 à 3 du minimum bar. Chaque échec est un résultat, pas un bug :
// on capture le code et le hash, on continue le plus loin possible.

import { Client, Wallet } from "xrpl";
import { NET, txUrl, pctToRate } from "../../scripts/config.mjs";
import { loadAccounts, submitRaw, signLoanSetCounterparty } from "../../scripts/raw-submit.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000)); // en drops

const log = (...a) => console.log(...a);
const step = (n, t) => log(`\n─── ${n}. ${t} ${"─".repeat(Math.max(0, 46 - t.length))}`);

// Retrouve un nœud créé dans les métadonnées, par type de ledger entry.
function createdNode(result, entryType) {
  const nodes = result?.meta?.AffectedNodes ?? [];
  for (const n of nodes) {
    if (n.CreatedNode?.LedgerEntryType === entryType) return n.CreatedNode;
  }
  return null;
}

const found = { vaultId: null, brokerId: null, loanId: null };
const timeline = [];
const mark = (label, res) => {
  timeline.push({ label, code: res.code, hash: res.hash });
  return res;
};

const client = new Client(NET.wss);

try {
  await client.connect();
  const { lender, borrower, broker } = loadAccounts();

  log(`Réseau   : ${NET.wss}`);
  log(`broker   : ${broker.address}  (propriétaire du vault — contrainte du protocole)`);
  log(`lender   : ${lender.address}  (déposant)`);
  log(`borrower : ${borrower.address}`);

  // ─────────────────────────────────────────────────────────────────────────
  step(1, "VaultCreate — single asset, open-ended, XRP");
  // Il n'existe AUCUN champ de durée/fermeture dans VaultCreate (xrpl 4.6.0) :
  // open-ended est le comportement par défaut, pas une option à demander.
  // Le vault est créé par le BROKER : `tecNO_PERMISSION` confirme que seul le
  // propriétaire du vault peut y attacher un LoanBroker (cf. FEEDBACK-RAW [13:2x]).
  const vault = mark("VaultCreate", await submitRaw(client, broker.seed, {
    TransactionType: "VaultCreate",
    Asset: { currency: "XRP" },
    AssetsMaximum: XRP(10_000),
    WithdrawalPolicy: 1, // vaultStrategyFirstComeFirstServe
    Data: Buffer.from("CY-HACK track1 open-ended").toString("hex").toUpperCase(),
  }, { label: "VaultCreate" }));

  if (!vault.ok) throw new Error(`VaultCreate a échoué : ${vault.code} — on ne peut pas continuer.`);

  const vaultNode = createdNode(vault.result, "Vault");
  found.vaultId = vaultNode?.LedgerIndex ?? null;
  log(`  VaultID : ${found.vaultId ?? "INTROUVABLE dans les métadonnées"}`);
  if (vaultNode?.NewFields) {
    const f = vaultNode.NewFields;
    log(`  champs  : ${Object.keys(f).join(", ")}`);
  }
  if (!found.vaultId) throw new Error("VaultID introuvable — item de feedback (métadonnées).");

  // ─────────────────────────────────────────────────────────────────────────
  step(2, "VaultDeposit — le prêteur apporte 300 XRP");
  const dep = mark("VaultDeposit", await submitRaw(client, lender.seed, {
    TransactionType: "VaultDeposit",
    VaultID: found.vaultId,
    Amount: XRP(300),
  }, { label: "VaultDeposit" }));
  if (!dep.ok) log(`  ⚠️  dépôt refusé (${dep.code}) — on tente la suite quand même.`);

  // ─────────────────────────────────────────────────────────────────────────
  step(3, "LoanBrokerSet — création du broker sur ce vault");
  const brk = mark("LoanBrokerSet", await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerSet",
    VaultID: found.vaultId,
    ManagementFeeRate: pctToRate(2),      // 2 %
    DebtMaximum: XRP(1_000),
    CoverRateMinimum: pctToRate(10),      // first-loss cover : 10 %
    CoverRateLiquidation: pctToRate(5),
    Data: Buffer.from("CY-HACK broker").toString("hex").toUpperCase(),
  }, { label: "LoanBrokerSet" }));

  if (!brk.ok) throw new Error(`LoanBrokerSet a échoué : ${brk.code}`);

  const brkNode = createdNode(brk.result, "LoanBroker");
  found.brokerId = brkNode?.LedgerIndex ?? null;
  log(`  LoanBrokerID : ${found.brokerId ?? "INTROUVABLE"}`);
  if (!found.brokerId) throw new Error("LoanBrokerID introuvable — item de feedback (métadonnées).");

  // ─────────────────────────────────────────────────────────────────────────
  step(4, "LoanBrokerCoverDeposit — first-loss cover");
  // CoverRateMinimum à 10 % : sans cover déposé, un LoanSet devrait être refusé.
  // On dépose de quoi couvrir 100 XRP de principal.
  const cov = mark("LoanBrokerCoverDeposit", await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverDeposit",
    LoanBrokerID: found.brokerId,
    Amount: XRP(50),
  }, { label: "LoanBrokerCoverDeposit" }));
  if (!cov.ok) log(`  ⚠️  cover refusé (${cov.code}) — le LoanSet suivant échouera peut-être pour ça.`);

  // ─────────────────────────────────────────────────────────────────────────
  step(5, "LoanSet — LE TEST : prêt sur un vault OPEN-ENDED");
  const brokerWallet = Wallet.fromSeed(broker.seed);
  const borrowerWallet = Wallet.fromSeed(borrower.seed);

  const loanSet = {
    TransactionType: "LoanSet",
    Account: brokerWallet.address,
    LoanBrokerID: found.brokerId,
    Counterparty: borrowerWallet.address,
    PrincipalRequested: XRP(100),
    InterestRate: pctToRate(8),   // 8 %
    PaymentInterval: 86_400,      // 1 jour
    PaymentTotal: 4,              // 4 échéances
    GracePeriod: 3_600,
    LoanOriginationFee: XRP(1),
    LoanServiceFee: XRP(0.5),
    LatePaymentFee: XRP(0.25),
    ClosePaymentFee: XRP(0.25),
  };

  log("  autofill…");
  const prepared = await client.autofill(loanSet);

  log("  signature broker (first party)…");
  const signedByBroker = brokerWallet.sign(prepared);

  // ⚠️ PAS `signLoanSetByCounterparty` du SDK : il signe le mauvais payload
  // et rippled rejette en local. Cf. FEEDBACK-RAW [13:31].
  log("  signature borrower (contournement maison — bug SDK [13:31])…");
  const fullyBlob = signLoanSetCounterparty(signedByBroker.tx_blob, borrower.seed);

  log("  soumission…");
  const res = await client.submitAndWait(fullyBlob);
  const code = res.result.meta?.TransactionResult ?? "?";
  const hash = res.result.hash;
  timeline.push({ label: "LoanSet", code, hash });

  log(`\n  LoanSet → ${code}`);
  log(`  ${txUrl(hash)}`);

  const loanNode = createdNode(res.result, "Loan");
  found.loanId = loanNode?.LedgerIndex ?? null;

  log("\n" + "═".repeat(64));
  if (code === "tesSUCCESS") {
    log("✅ VERDICT : LoanSet PASSE sur un vault open-ended.");
    log("   LendingProtocolV1_1 actif n'interdit PAS le Track 1.");
    log(`   LoanID : ${found.loanId}`);
    log("   → La règle n°4 de CLAUDE.md ne se déclenche pas. On construit.");
  } else {
    log(`❌ VERDICT : LoanSet REFUSÉ — code ${code}`);
    log("   Si le code indique un vault non fermé, V1.1 bloque bien le Track 1.");
    log("   → Capturer ce hash et aller voir un mentor AVANT de continuer.");
  }
  log("═".repeat(64));
} catch (e) {
  log(`\n💥 ARRÊT : ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 800));
} finally {
  log("\n─── Récapitulatif (à coller dans FEEDBACK-RAW.md) ───");
  for (const t of timeline) log(`  ${t.label.padEnd(24)} ${String(t.code).padEnd(18)} ${t.hash ?? ""}`);
  log(`  VaultID       : ${found.vaultId ?? "—"}`);
  log(`  LoanBrokerID  : ${found.brokerId ?? "—"}`);
  log(`  LoanID        : ${found.loanId ?? "—"}`);
  await client.disconnect();
}
