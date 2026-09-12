// Le scénario du use case, en un seul exemplaire.
//
// Deux enveloppes l'utilisent :
//   - step-8-secondary.mjs : mode preuve, enchaîné, pour capturer des hashes.
//   - demo.mjs             : mode pitch, avec pauses et narration.
// Un seul code : impossible de répéter avec l'un et de présenter l'autre.
//
// L'objet `ui` reçoit les événements. Voir demo.mjs pour une implémentation
// bavarde, step-8-secondary.mjs pour une implémentation sobre.

import { Wallet } from "xrpl";
import { createHash, randomBytes } from "node:crypto";
import { pctToRate } from "../config.mjs";
import { submitRaw, signLoanSetCounterparty, readEntry } from "../raw-submit.mjs";
import { vaultSnapshot, sharesToDrops, shareBalance, render, fmt } from "./nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;

const createdNode = (result, type) =>
  (result?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === type)?.CreatedNode ?? null;
const seqOf = (res) => res.result?.tx_json?.Sequence ?? res.result?.Sequence;

// Les montants sont calibrés pour que la démo soit REJOUABLE une vingtaine de
// fois sans réapprovisionner les comptes. Ce n'est pas de la frugalité mal
// placée : dans un vault open-ended intégralement prêté, les parts que la
// vendeuse n'a pas cédées restent immobilisées DÉFINITIVEMENT — AssetsAvailable
// vaut zéro, VaultWithdraw est refusé, et le prêt court jusqu'à son terme.
// Chaque répétition brûle donc du capital sans retour, plus 2 XRP de réserve
// de compte par vault créé. À 100 XRP de dépôt, six répétitions vidaient la
// vendeuse. Cf. FEEDBACK-RAW [15:52].
export const CFG = {
  deposit: 25,           // XRP déposés par la vendeuse → 25 000 000 parts
  cover: 5,              // XRP de first-loss capital (min. requis : 10 % de 25)
  sharesToSell: 7_500_000n,   // 30 % de sa position
  decotePct: 97n,        // prix de cession, en % de la valeur
  redeem: 2_500_000n,    // parts rendues par l'acheteur à la fin
};

/**
 * Joue le scénario complet et renvoie { timeline, ids }.
 * @param {object} ui  { scene, step, line, beat, pause }
 */
export async function runScenario(client, accounts, ui, cfg = CFG) {
  const { lender, borrower, broker, spare } = accounts;
  const sellerW = Wallet.fromSeed(lender.seed);
  const buyerW = Wallet.fromSeed(spare.seed);
  const brokerW = Wallet.fromSeed(broker.seed);
  const borrowerW = Wallet.fromSeed(borrower.seed);

  const timeline = [];
  const mark = (label, r) => (timeline.push({ label, code: r.code, hash: r.hash }), r);
  const ids = { vaultId: null, brokerId: null, loanId: null, shareMPTID: null };

  ui.line(`Vendeuse  ${sellerW.address}   déposante`);
  ui.line(`Acheteur  ${buyerW.address}   n'a jamais déposé`);
  ui.line(`Broker    ${brokerW.address}   = propriétaire du vault`);
  ui.line(`Emprunt.  ${borrowerW.address}`);

  // ── SCÈNE 1 ────────────────────────────────────────────────────────────
  await ui.scene(1, "Un vault open-ended finance du crédit PME");

  ui.step("VaultCreate — aucun VaultKind : open-ended est le défaut");
  const vault = mark("VaultCreate", await submitRaw(client, broker.seed, {
    TransactionType: "VaultCreate",
    Asset: { currency: "XRP" },
    AssetsMaximum: XRP(10_000),
    WithdrawalPolicy: 1,
    Data: Buffer.from("CY-HACK PME credit fund").toString("hex").toUpperCase(),
  }, { label: "VaultCreate" }));
  if (!vault.ok) throw new Error(`VaultCreate : ${vault.code}`);
  ids.vaultId = createdNode(vault.result, "Vault")?.LedgerIndex;

  ui.step(`VaultDeposit — la trésorière place ${cfg.deposit} XRP`);
  if (!mark("VaultDeposit", await submitRaw(client, lender.seed, {
    TransactionType: "VaultDeposit", VaultID: ids.vaultId, Amount: XRP(cfg.deposit),
  }, { label: "VaultDeposit" })).ok) throw new Error("dépôt refusé");

  ui.step("LoanBrokerSet — l'intermédiaire de crédit, puis son first-loss capital");
  const brk = mark("LoanBrokerSet", await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerSet", VaultID: ids.vaultId,
    ManagementFeeRate: pctToRate(2), DebtMaximum: XRP(1_000),
    CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5),
    Data: Buffer.from("CY-HACK broker").toString("hex").toUpperCase(),
  }, { label: "LoanBrokerSet" }));
  if (!brk.ok) throw new Error(`LoanBrokerSet : ${brk.code}`);
  ids.brokerId = createdNode(brk.result, "LoanBroker")?.LedgerIndex;

  mark("CoverDeposit", await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: ids.brokerId, Amount: XRP(cfg.cover),
  }, { label: "LoanBrokerCoverDeposit" }));

  ui.step("LoanSet — le broker prête TOUTE la liquidité disponible");
  let snap = await vaultSnapshot(client, ids.vaultId);
  for (const frac of [100n, 95n, 90n]) {
    const principal = (snap.assetsAvailable * frac) / 100n;
    ui.line(`  tentative à ${frac} % de la liquidité → ${fmt(principal)}`);
    const prepared = await client.autofill({
      TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: ids.brokerId,
      Counterparty: borrowerW.address, PrincipalRequested: String(principal),
      // 4 échéances MENSUELLES : le capital est immobilisé ~4 mois. C'est ce qui
      // rend la décote défendable. À 4 échéances quotidiennes, attendre le terme
      // ne coûtait que 0,055 XRP sur 100 quand la cession en coûtait 3 : la
      // vendeuse perdait 55× plus à vendre qu'à patienter, et le use case ne
      // tenait pas sous un calcul de coin de table.
      InterestRate: pctToRate(8), PaymentInterval: 2_592_000, PaymentTotal: 4,
      GracePeriod: 86_400, LoanOriginationFee: XRP(0.25), LoanServiceFee: XRP(0.125),
      LatePaymentFee: XRP(0.0625), ClosePaymentFee: XRP(0.0625),
    });
    // ⚠️ helper maison : signLoanSetByCounterparty du SDK signe le mauvais
    // payload, rippled rejette en local. Cf. FEEDBACK-RAW [13:31].
    const blob = signLoanSetCounterparty(brokerW.sign(prepared).tx_blob, borrower.seed);
    const res = await client.submitAndWait(blob);
    const code = res.result.meta?.TransactionResult;
    timeline.push({ label: `LoanSet ${frac}%`, code, hash: res.result.hash });
    ui.tx?.("LoanSet", code, res.result.hash);
    if (code === "tesSUCCESS") { ids.loanId = createdNode(res.result, "Loan")?.LedgerIndex; break; }
  }
  if (!ids.loanId) throw new Error("aucun LoanSet n'est passé");

  snap = await vaultSnapshot(client, ids.vaultId);
  ids.shareMPTID = snap.shareMPTID;
  ui.line("\n" + render(snap));
  ui.beat("Un seul prêt a absorbé 100 % du vault. Aucun avertissement.");

  // ── SCÈNE 2 ────────────────────────────────────────────────────────────
  await ui.scene(2, "Le mur : le vault est ouvert en droit, fermé en fait");

  const sellerShares = await shareBalance(client, sellerW.address, snap.shareMPTID);
  ui.line(`  Elle détient ${sellerShares} parts, valorisées ${fmt(sharesToDrops(snap, sellerShares))}`);
  ui.line(`  Le vault ne peut en rendre que ${fmt(snap.assetsAvailable)}.`);

  ui.step("VaultWithdraw — la déposante tente de récupérer son argent");
  const wall = mark("VaultWithdraw (refusé)", await submitRaw(client, lender.seed, {
    TransactionType: "VaultWithdraw", VaultID: ids.vaultId,
    Amount: { mpt_issuance_id: snap.shareMPTID, value: String(cfg.sharesToSell) },
  }, { label: "VaultWithdraw ← LE MUR" }));
  ui.beat(wall.code === "tesSUCCESS"
    ? "⚠️ le retrait est passé : liquidité non nulle, scène à rejouer."
    : `⛔ ${wall.code} — elle ne peut pas sortir avant l'échéance des prêts.`);

  // ── SCÈNE 3 ────────────────────────────────────────────────────────────
  await ui.scene(3, "La cession : échange atomique, sans tiers de confiance");

  const valeur = sharesToDrops(snap, cfg.sharesToSell);
  const prix = (valeur * cfg.decotePct) / 100n;
  ui.line(`  ${cfg.sharesToSell} parts valent ${fmt(valeur)} au prix du vault.`);
  ui.line(`  Cédées à ${cfg.decotePct} % → ${fmt(prix)}.`);
  ui.line(`  La décote n'achète pas du rendement : elle achète 4 mois d'avance.`);

  ui.step("MPTokenAuthorize — l'acheteur déclare accepter ces parts");
  // Sans cet opt-in, tout Payment de parts échoue en tecNO_AUTH — cause absente
  // des cinq scénarios d'échec listés par la doc.
  mark("MPTokenAuthorize", await submitRaw(client, spare.seed, {
    TransactionType: "MPTokenAuthorize", MPTokenIssuanceID: snap.shareMPTID,
  }, { label: "MPTokenAuthorize (acheteur)" }));

  const preimage = randomBytes(32);
  const digest = createHash("sha256").update(preimage).digest("hex").toUpperCase();
  const CONDITION = `A0258020${digest}810120`;
  const FULFILLMENT = `A0228020${preimage.toString("hex").toUpperCase()}`;
  ui.line(`\n  Secret tiré par l'acheteur, empreinte publiée : ${digest.slice(0, 32)}…`);

  ui.step("EscrowCreate #1 — l'ACHETEUR verrouille son paiement, expire à +2 h");
  // L'acheteur s'engage en premier : la vendeuse n'expose ses parts qu'après.
  const escBuyer = mark("Escrow paiement", await submitRaw(client, spare.seed, {
    TransactionType: "EscrowCreate", Destination: sellerW.address,
    Amount: String(prix), Condition: CONDITION, CancelAfter: rippleNow() + 7200,
  }, { label: "EscrowCreate (paiement)" }));
  if (!escBuyer.ok) throw new Error(`escrow paiement : ${escBuyer.code}`);

  ui.step("EscrowCreate #2 — la VENDEUSE verrouille ses parts, expire à +1 h");
  // Expiration plus courte côté vendeuse : une fois le secret révélé, elle doit
  // avoir le temps d'encaisser. Inverser les durées casse la sécurité.
  const escSeller = mark("Escrow parts", await submitRaw(client, lender.seed, {
    TransactionType: "EscrowCreate", Destination: buyerW.address,
    Amount: { mpt_issuance_id: snap.shareMPTID, value: String(cfg.sharesToSell) },
    Condition: CONDITION, CancelAfter: rippleNow() + 3600,
  }, { label: "EscrowCreate (parts)" }));
  if (!escSeller.ok) throw new Error(`escrow parts : ${escSeller.code}`);

  ui.step("EscrowFinish #1 — l'acheteur prend les parts et RÉVÈLE le secret");
  const fin1 = mark("EscrowFinish (parts)", await submitRaw(client, spare.seed, {
    TransactionType: "EscrowFinish", Owner: sellerW.address, OfferSequence: seqOf(escSeller),
    Condition: CONDITION, Fulfillment: FULFILLMENT,
  }, { label: "EscrowFinish (parts → acheteur)" }));
  if (!fin1.ok) throw new Error(`finish parts : ${fin1.code}`);

  ui.step("Le secret est public — la vendeuse le relit DANS LE LEDGER");
  // On ne réutilise pas la variable locale : c'est la publication du
  // Fulfillment on-chain qui rend l'échange atomique. La démo doit le montrer.
  const onchain = await client.request({ command: "tx", transaction: fin1.hash });
  const relu = onchain.result?.tx_json?.Fulfillment ?? onchain.result?.Fulfillment;
  ui.line(`  relu dans ${fin1.hash.slice(0, 16)}… → ${String(relu).slice(0, 26)}…`);
  ui.line(`  identique au secret de l'acheteur : ${relu === FULFILLMENT ? "OUI" : "NON ⚠️"}`);

  ui.step("EscrowFinish #2 — la vendeuse encaisse avec ce secret relu");
  const fin2 = mark("EscrowFinish (paiement)", await submitRaw(client, lender.seed, {
    TransactionType: "EscrowFinish", Owner: buyerW.address, OfferSequence: seqOf(escBuyer),
    Condition: CONDITION, Fulfillment: relu,
  }, { label: "EscrowFinish (XRP → vendeuse)" }));
  ui.beat(fin2.ok
    ? "Échange bouclé. Ni notaire, ni séquestre, ni confiance."
    : `⚠️ ${fin2.code}`);

  // ── SCÈNE 4 ────────────────────────────────────────────────────────────
  await ui.scene(4, "Retour au vault : le nouveau porteur est payé");

  ui.step("LoanPay — l'emprunteur rembourse une échéance");
  const loan = await readEntry(client, ids.loanId);
  // Montant dû = ceil(PeriodicPayment) + LoanServiceFee. PeriodicPayment est
  // annoncé avec des décimales de drop ; ceil() seul → tecINSUFFICIENT_PAYMENT.
  const toPay = String(Math.ceil(Number(loan.PeriodicPayment)) + Number(loan.LoanServiceFee));
  ui.line(`  PeriodicPayment ${loan.PeriodicPayment} + LoanServiceFee ${loan.LoanServiceFee}`);
  mark("LoanPay", await submitRaw(client, borrower.seed, {
    TransactionType: "LoanPay", LoanID: ids.loanId, Amount: toPay,
  }, { label: "LoanPay" }));

  snap = await vaultSnapshot(client, ids.vaultId);
  ui.line("\n" + render(snap));

  ui.step("VaultWithdraw — par l'acheteur, qui n'a JAMAIS déposé ici");
  const buyerShares = await shareBalance(client, buyerW.address, snap.shareMPTID);
  const redeem = buyerShares < cfg.redeem ? buyerShares : cfg.redeem;
  ui.line(`  Il détient ${buyerShares} parts, il en rend ${redeem}.`);
  const out = mark("VaultWithdraw (acheteur)", await submitRaw(client, spare.seed, {
    TransactionType: "VaultWithdraw", VaultID: ids.vaultId,
    Amount: { mpt_issuance_id: snap.shareMPTID, value: String(redeem) },
  }, { label: "VaultWithdraw (porteur secondaire)" }));
  ui.beat(out.ok
    ? "Le vault paie un compte qui n'y a jamais déposé. La part porte le droit."
    : `⚠️ ${out.code}`);

  return { timeline, ids, snap };
}
