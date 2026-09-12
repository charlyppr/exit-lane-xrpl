// ÉTAPE 8 DU MINIMUM BAR — le use case, joué de bout en bout.
//
// Thèse : un vault open-ended promet le retrait à tout moment, mais les prêts
// qu'il finance sont à terme fixe. Dès que le capital est intégralement prêté,
// `AssetsAvailable` tombe à zéro et le déposant ne peut PLUS SORTIR. Le vault
// est ouvert en droit, fermé en fait.
//
// Réponse : les parts de vault sont des MPT. On les cède de gré à gré par
// échange atomique (deux escrows croisés partageant la même Condition
// PREIMAGE-SHA-256 — un HTLC). Le vault ne débourse rien, seul le porteur change.
//
// Ce qui est cédé est la PART DU DÉPOSANT, jamais le `Loan` : XLS-66 n'offre
// aucune cession de créance. L'emprunteur ne voit pas la transaction.
//
// Le DEX n'est pas une option : `OfferCreate` sur un MPT renvoie `temDISABLED`
// (XLS-82 non déployé), alors même que l'issuance des parts porte le flag
// `lsfMPTCanTrade`. Cf. FEEDBACK-RAW.
//
// Usage : node scripts/step-8-secondary.mjs

import { Client, Wallet } from "xrpl";
import { createHash, randomBytes } from "node:crypto";
import { NET, txUrl, pctToRate } from "./config.mjs";
import { loadAccounts, submitRaw, signLoanSetCounterparty, readEntry } from "./raw-submit.mjs";
import { vaultSnapshot, sharesToDrops, shareBalance, render, fmt } from "./lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;

const DECOTE_PCT = 97n;        // le vendeur cède à 97 % de la valeur
const SHARES_TO_SELL = 30_000_000n;

const log = (...a) => console.log(...a);
const scene = (n, t) => log(`\n${"═".repeat(70)}\n  SCÈNE ${n} — ${t}\n${"═".repeat(70)}`);
const step = (t) => log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`);

const createdNode = (result, type) =>
  (result?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === type)?.CreatedNode ?? null;

const seqOf = (res) => res.result?.tx_json?.Sequence ?? res.result?.Sequence;

const timeline = [];
const mark = (label, r) => (timeline.push({ label, code: r.code, hash: r.hash }), r);

const client = new Client(NET.wss);

try {
  await client.connect();
  const { lender, borrower, broker, spare } = loadAccounts();
  const sellerW = Wallet.fromSeed(lender.seed);   // Chloé — déposante qui veut sortir
  const buyerW = Wallet.fromSeed(spare.seed);     // Marc  — acheteur secondaire
  const brokerW = Wallet.fromSeed(broker.seed);
  const borrowerW = Wallet.fromSeed(borrower.seed);

  log(`Réseau    ${NET.wss}`);
  log(`Vendeuse  ${sellerW.address}  (déposante)`);
  log(`Acheteur  ${buyerW.address}  (n'a jamais déposé)`);
  log(`Broker    ${brokerW.address}  (= propriétaire du vault, contrainte du protocole)`);
  log(`Emprunt.  ${borrowerW.address}`);

  // ══════════════════════════════════════════════════════════════════════
  scene(1, "Le vault finance des prêts, et se vide de sa liquidité");

  step("VaultCreate — open-ended (aucun VaultKind : c'est le défaut)");
  const vault = mark("VaultCreate", await submitRaw(client, broker.seed, {
    TransactionType: "VaultCreate",
    Asset: { currency: "XRP" },
    AssetsMaximum: XRP(10_000),
    WithdrawalPolicy: 1,
    Data: Buffer.from("CY-HACK PME credit fund").toString("hex").toUpperCase(),
  }, { label: "VaultCreate" }));
  if (!vault.ok) throw new Error(`VaultCreate : ${vault.code}`);
  const vaultId = createdNode(vault.result, "Vault")?.LedgerIndex;
  log(`  VaultID ${vaultId}`);

  step("VaultDeposit — Chloé place 100 XRP de trésorerie");
  if (!mark("VaultDeposit", await submitRaw(client, lender.seed, {
    TransactionType: "VaultDeposit", VaultID: vaultId, Amount: XRP(100),
  }, { label: "VaultDeposit" })).ok) throw new Error("dépôt refusé");

  step("LoanBrokerSet + LoanBrokerCoverDeposit — first-loss capital");
  const brk = mark("LoanBrokerSet", await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerSet", VaultID: vaultId,
    ManagementFeeRate: pctToRate(2), DebtMaximum: XRP(1_000),
    CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5),
    Data: Buffer.from("CY-HACK broker").toString("hex").toUpperCase(),
  }, { label: "LoanBrokerSet" }));
  if (!brk.ok) throw new Error(`LoanBrokerSet : ${brk.code}`);
  const brokerId = createdNode(brk.result, "LoanBroker")?.LedgerIndex;

  mark("CoverDeposit", await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: brokerId, Amount: XRP(20),
  }, { label: "LoanBrokerCoverDeposit" }));

  step("LoanSet — le broker prête TOUTE la liquidité disponible");
  let snap = await vaultSnapshot(client, vaultId);
  let loanId = null;
  // Repli progressif : si 100 % de la liquidité est refusé, on descend.
  for (const frac of [100n, 95n, 90n]) {
    const principal = (snap.assetsAvailable * frac) / 100n;
    log(`  tentative à ${frac} % de la liquidité → ${fmt(principal)}`);
    const loanSet = {
      TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: brokerId,
      Counterparty: borrowerW.address, PrincipalRequested: String(principal),
      InterestRate: pctToRate(8), PaymentInterval: 86_400, PaymentTotal: 4,
      GracePeriod: 3_600, LoanOriginationFee: XRP(1), LoanServiceFee: XRP(0.5),
      LatePaymentFee: XRP(0.25), ClosePaymentFee: XRP(0.25),
    };
    const prepared = await client.autofill(loanSet);
    const signed = brokerW.sign(prepared);
    // ⚠️ helper maison : `signLoanSetByCounterparty` du SDK signe le mauvais
    // payload et rippled rejette en local. Cf. FEEDBACK-RAW [13:31].
    const blob = signLoanSetCounterparty(signed.tx_blob, borrower.seed);
    const res = await client.submitAndWait(blob);
    const code = res.result.meta?.TransactionResult;
    timeline.push({ label: `LoanSet ${frac}%`, code, hash: res.result.hash });
    log(`  LoanSet → ${code}\n  ${txUrl(res.result.hash)}`);
    if (code === "tesSUCCESS") { loanId = createdNode(res.result, "Loan")?.LedgerIndex; break; }
  }
  if (!loanId) throw new Error("aucun LoanSet n'est passé — scène impossible à jouer");
  log(`  LoanID ${loanId}`);

  snap = await vaultSnapshot(client, vaultId);
  log(`\n  État du vault :\n${render(snap)}`);

  // ══════════════════════════════════════════════════════════════════════
  scene(2, "Le mur : Chloé veut sortir, le protocole refuse");

  const sellerShares = await shareBalance(client, sellerW.address, snap.shareMPTID);
  log(`  Chloé détient ${sellerShares} parts, valorisées ${fmt(sharesToDrops(snap, sellerShares))}`);
  log(`  Mais le vault ne peut en rendre que ${fmt(snap.assetsAvailable)}.\n`);

  const wall = mark("VaultWithdraw (refusé)", await submitRaw(client, lender.seed, {
    TransactionType: "VaultWithdraw", VaultID: vaultId,
    Amount: { mpt_issuance_id: snap.shareMPTID, value: String(SHARES_TO_SELL) },
  }, { label: "VaultWithdraw ← LE MUR" }));
  log(wall.code === "tesSUCCESS"
    ? "  ⚠️  le retrait est passé : la liquidité n'était pas à zéro, scène à rejouer."
    : `  ⛔ ${wall.code} — le vault est ouvert en droit, fermé en fait.`);

  // ══════════════════════════════════════════════════════════════════════
  scene(3, "La cession : échange atomique parts ↔ XRP, sans tiers de confiance");

  const valeur = sharesToDrops(snap, SHARES_TO_SELL);
  const prix = (valeur * DECOTE_PCT) / 100n;
  log(`  ${SHARES_TO_SELL} parts valent ${fmt(valeur)} au prix du vault.`);
  log(`  Cédées à ${DECOTE_PCT} % → ${fmt(prix)}. La décote est le prix du temps.`);

  step("MPTokenAuthorize — l'acheteur déclare accepter ces parts");
  // Sans cet opt-in, tout Payment de parts échoue en tecNO_AUTH — cause absente
  // des cinq scénarios d'échec listés par la doc. Cf. FEEDBACK-RAW.
  mark("MPTokenAuthorize", await submitRaw(client, spare.seed, {
    TransactionType: "MPTokenAuthorize", MPTokenIssuanceID: snap.shareMPTID,
  }, { label: "MPTokenAuthorize (acheteur)" }));

  const preimage = randomBytes(32);
  const digest = createHash("sha256").update(preimage).digest("hex").toUpperCase();
  const CONDITION = `A0258020${digest}810120`;
  const FULFILLMENT = `A0228020${preimage.toString("hex").toUpperCase()}`;
  log(`\n  Secret tiré par l'acheteur. Empreinte publiée : ${digest.slice(0, 32)}…`);

  step("EscrowCreate #1 — l'ACHETEUR verrouille son paiement (expire à +2 h)");
  // L'acheteur s'engage EN PREMIER : la vendeuse n'expose ses parts qu'après
  // avoir vu l'argent bloqué.
  const escBuyer = await submitRaw(client, spare.seed, {
    TransactionType: "EscrowCreate", Destination: sellerW.address,
    Amount: String(prix), Condition: CONDITION, CancelAfter: rippleNow() + 7200,
  }, { label: "EscrowCreate (paiement)" });
  mark("Escrow paiement", escBuyer);
  if (!escBuyer.ok) throw new Error(`escrow paiement : ${escBuyer.code}`);
  const seqBuyer = seqOf(escBuyer);

  step("EscrowCreate #2 — la VENDEUSE verrouille ses parts (expire à +1 h)");
  // Expiration plus COURTE côté vendeuse : une fois le secret révélé, elle doit
  // avoir le temps d'encaisser. Inverser les deux durées casse la sécurité.
  const escSeller = await submitRaw(client, lender.seed, {
    TransactionType: "EscrowCreate", Destination: buyerW.address,
    Amount: { mpt_issuance_id: snap.shareMPTID, value: String(SHARES_TO_SELL) },
    Condition: CONDITION, CancelAfter: rippleNow() + 3600,
  }, { label: "EscrowCreate (parts)" });
  mark("Escrow parts", escSeller);
  if (!escSeller.ok) throw new Error(`escrow parts : ${escSeller.code}`);
  const seqSeller = seqOf(escSeller);

  step("EscrowFinish #1 — l'acheteur prend les parts et RÉVÈLE le secret");
  const fin1 = mark("EscrowFinish (parts)", await submitRaw(client, spare.seed, {
    TransactionType: "EscrowFinish", Owner: sellerW.address, OfferSequence: seqSeller,
    Condition: CONDITION, Fulfillment: FULFILLMENT,
  }, { label: "EscrowFinish (parts → acheteur)" }));
  if (!fin1.ok) throw new Error(`finish parts : ${fin1.code}`);

  step("Le secret est maintenant PUBLIC — la vendeuse le relit dans le ledger");
  // Point de conception : on ne réutilise PAS la variable locale. C'est la
  // publication du Fulfillment on-chain qui rend l'échange atomique ; la démo
  // doit le montrer, pas le contourner.
  const onchain = await client.request({ command: "tx", transaction: fin1.hash });
  const relu = onchain.result?.tx_json?.Fulfillment ?? onchain.result?.Fulfillment;
  log(`  Fulfillment lu dans la transaction ${fin1.hash.slice(0, 16)}… : ${String(relu).slice(0, 24)}…`);
  log(`  identique à celui de l'acheteur : ${relu === FULFILLMENT ? "OUI" : "NON (⚠️)"}`);

  step("EscrowFinish #2 — la vendeuse encaisse avec ce secret relu");
  const fin2 = mark("EscrowFinish (paiement)", await submitRaw(client, lender.seed, {
    TransactionType: "EscrowFinish", Owner: buyerW.address, OfferSequence: seqBuyer,
    Condition: CONDITION, Fulfillment: relu,
  }, { label: "EscrowFinish (XRP → vendeuse)" }));
  log(fin2.ok ? "  ✅ Échange bouclé. Personne n'a eu à faire confiance à personne." : `  ⚠️ ${fin2.code}`);

  // ══════════════════════════════════════════════════════════════════════
  scene(4, "Le nouveau porteur est payé par le vault");

  step("LoanPay — l'emprunteur rembourse une échéance, la liquidité revient");
  const loan = await readEntry(client, loanId);
  // Le montant dû = ceil(PeriodicPayment) + LoanServiceFee. PeriodicPayment est
  // annoncé avec des décimales de drop ; payer ceil() seul donne
  // tecINSUFFICIENT_PAYMENT. Cf. FEEDBACK-RAW [14:02].
  const toPay = String(Math.ceil(Number(loan.PeriodicPayment)) + Number(loan.LoanServiceFee));
  log(`  PeriodicPayment ${loan.PeriodicPayment} + LoanServiceFee ${loan.LoanServiceFee} → ${toPay} drops`);
  mark("LoanPay", await submitRaw(client, borrower.seed, {
    TransactionType: "LoanPay", LoanID: loanId, Amount: toPay,
  }, { label: "LoanPay" }));

  snap = await vaultSnapshot(client, vaultId);
  log(`\n  État du vault :\n${render(snap)}`);

  step("VaultWithdraw — par l'acheteur, qui n'a JAMAIS déposé dans ce vault");
  const buyerShares = await shareBalance(client, buyerW.address, snap.shareMPTID);
  const redeem = buyerShares < 10_000_000n ? buyerShares : 10_000_000n;
  log(`  Marc détient ${buyerShares} parts. Il en rend ${redeem}.`);
  const out = mark("VaultWithdraw (acheteur)", await submitRaw(client, spare.seed, {
    TransactionType: "VaultWithdraw", VaultID: vaultId,
    Amount: { mpt_issuance_id: snap.shareMPTID, value: String(redeem) },
  }, { label: "VaultWithdraw (porteur secondaire)" }));
  log(out.ok
    ? "  ✅ Le vault paie un compte qui n'y a jamais déposé. La part porte le droit."
    : `  ⚠️ ${out.code}`);

  log(`\n${"═".repeat(70)}`);
  log("  VaultID  " + vaultId);
  log("  BrokerID " + brokerId);
  log("  LoanID   " + loanId);
  log("  Parts    " + snap.shareMPTID);
} catch (e) {
  log(`\n💥 ARRÊT : ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 600));
} finally {
  log("\n─── Récapitulatif (à coller dans FEEDBACK-RAW.md) ───");
  for (const t of timeline) log(`  ${String(t.label).padEnd(26)} ${String(t.code).padEnd(22)} ${t.hash ?? ""}`);
  await client.disconnect();
}
