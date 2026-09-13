// H1 — le first-loss capital absorbe-t-il la première perte ?
//
// Question posée mot pour mot par le brief : « Did first-loss-capital
// parameters behave as their names suggested? »
//
// Décor isolé : un vault, un broker, UN SEUL prêt, pour que DebtTotal soit
// sans ambiguïté. GracePeriod = 60 s, le minimum accepté par le protocole
// (59 s → temINVALID, mesuré).
//
// Usage : node bonus/scripts/h1-default.mjs

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

const COVER_MIN = 10, COVER_LIQ = 5, PRINCIPAL = 50, COVER = 50, DEPOSIT = 200;
const client = new Client(NET.wss);

try {
  await client.connect();
  const { lender, borrower, broker } = loadAccounts();
  const brokerW = Wallet.fromSeed(broker.seed), borrowerW = Wallet.fromSeed(borrower.seed);

  title(`Décor isolé — vault ${DEPOSIT} XRP · cover ${COVER} XRP · CoverRateMinimum ${COVER_MIN} % · CoverRateLiquidation ${COVER_LIQ} %`);
  const v = await submitRaw(client, broker.seed, {
    TransactionType: "VaultCreate", Asset: { currency: "XRP" }, AssetsMaximum: XRP(10_000),
    WithdrawalPolicy: 1, Data: Buffer.from("CY-HACK H1 default").toString("hex").toUpperCase(),
  }, { label: "VaultCreate" });
  const vaultId = createdNode(v.result, "Vault")?.LedgerIndex;

  await submitRaw(client, lender.seed, {
    TransactionType: "VaultDeposit", VaultID: vaultId, Amount: XRP(DEPOSIT),
  }, { label: `VaultDeposit ${DEPOSIT}` });

  const b = await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerSet", VaultID: vaultId, ManagementFeeRate: pctToRate(2),
    DebtMaximum: XRP(1_000), CoverRateMinimum: pctToRate(COVER_MIN),
    CoverRateLiquidation: pctToRate(COVER_LIQ),
  }, { label: "LoanBrokerSet" });
  const brokerId = createdNode(b.result, "LoanBroker")?.LedgerIndex;
  log(`  LoanBrokerID ${brokerId}`);

  await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: brokerId, Amount: XRP(COVER),
  }, { label: `CoverDeposit ${COVER}` });

  step(`LoanSet — ${PRINCIPAL} XRP, PaymentInterval 60 s, GracePeriod 60 s`);
  const prepared = await client.autofill({
    TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: brokerId,
    Counterparty: borrowerW.address, PrincipalRequested: XRP(PRINCIPAL),
    InterestRate: pctToRate(8), PaymentInterval: 60, PaymentTotal: 4,
    GracePeriod: 60, LoanOriginationFee: XRP(1), LoanServiceFee: XRP(0.5),
    LatePaymentFee: XRP(0.25), ClosePaymentFee: XRP(0.25),
  });
  const lres = await client.submitAndWait(signLoanSetCounterparty(brokerW.sign(prepared).tx_blob, borrower.seed));
  log(`LoanSet ${lres.result.meta?.TransactionResult}\n  ${txUrl(lres.result.hash)}`);
  const loanId = createdNode(lres.result, "Loan")?.LedgerIndex;
  if (!loanId) throw new Error("pas de Loan créé");

  const brk0 = await readEntry(client, brokerId);
  const vault0 = await vaultSnapshot(client, vaultId);
  const loan0 = await readEntry(client, loanId);
  log(`\n  AVANT`);
  log(`    DebtTotal          ${fmt(brk0.DebtTotal ?? 0)}`);
  log(`    CoverAvailable     ${fmt(brk0.CoverAvailable ?? 0)}`);
  log(`    vault AssetsTotal  ${fmt(vault0.assetsTotal)}`);
  log(`    valeur d'une part  ${vault0.navPerShare.toFixed(9)}`);
  log(`    prêt : PrincipalOutstanding ${fmt(loan0.PrincipalOutstanding)}`);

  step("Attente de la 1re échéance — 65 s (PaymentInterval = 60 s)");
  await sleep(65_000);

  step("LoanManage tfLoanImpair — perte enregistrée AVANT tout défaut");
  const imp = await submitRaw(client, broker.seed, {
    TransactionType: "LoanManage", LoanID: loanId, Flags: 131072,
  }, { label: "LoanManage impair" });
  const vaultImp = await vaultSnapshot(client, vaultId);
  log(`  vault AssetsTotal  ${fmt(vault0.assetsTotal)} → ${fmt(vaultImp.assetsTotal)}`);
  log(`  valeur d'une part  ${vault0.navPerShare.toFixed(9)} → ${vaultImp.navPerShare.toFixed(9)}`);
  log(`  ▸ l'impairment ${vaultImp.assetsTotal === vault0.assetsTotal ? "ne touche PAS" : "touche"} la valeur affichée aux déposants`);

  step("Attente de la grace period — 70 s");
  await sleep(70_000);

  step("LoanManage tfLoanDefault");
  const def = await submitRaw(client, broker.seed, {
    TransactionType: "LoanManage", LoanID: loanId, Flags: 65536,
  }, { label: "LoanManage default" });

  const brk1 = await readEntry(client, brokerId);
  const vault1 = await vaultSnapshot(client, vaultId);
  const coverUsed = Number(brk0.CoverAvailable ?? 0) - Number(brk1.CoverAvailable ?? 0);
  const vaultLoss = Number(vault0.assetsTotal) - Number(vault1.assetsTotal);
  const debt = Number(brk0.DebtTotal ?? 0);
  const principal = Number(loan0.PrincipalOutstanding);
  const attendu = Math.min(debt * (COVER_MIN / 100) * (COVER_LIQ / 100), principal);

  title("RÉSULTAT H1");
  log(`  Défaut sur un principal de              ${fmt(principal)}`);
  log(`  First-loss capital ponctionné           ${fmt(Math.round(coverUsed))}`);
  log(`  Perte encaissée par les déposants       ${fmt(Math.round(vaultLoss))}`);
  log(`  First-loss capital ENCORE disponible    ${fmt(brk1.CoverAvailable ?? 0)}`);
  log(`\n  Formule documentée :`);
  log(`    min(DebtTotal × CoverRateMinimum × CoverRateLiquidation, défaut)`);
  log(`    = min(${fmt(debt)} × ${COVER_MIN}% × ${COVER_LIQ}%, ${fmt(principal)}) = ${fmt(Math.round(attendu))}`);
  log(`    observé : ${fmt(Math.round(coverUsed))}  → ${Math.abs(attendu - coverUsed) < 2 ? "CONFORME à la formule" : "ÉCART avec la formule"}`);
  const part = coverUsed + vaultLoss > 0 ? (100 * coverUsed) / (coverUsed + vaultLoss) : 0;
  log(`\n  ▸▸ Le « first-loss capital » a absorbé ${part.toFixed(2)} % de la perte,`);
  log(`     alors que ${fmt(brk1.CoverAvailable ?? 0)} restaient disponibles pour l'absorber.`);
  log(`\n  vault AssetsTotal ${fmt(vault0.assetsTotal)} → ${fmt(vault1.assetsTotal)}`);
  log(`  valeur d'une part ${vault0.navPerShare.toFixed(9)} → ${vault1.navPerShare.toFixed(9)}`);
  log(`\n  VaultID ${vaultId}\n  BrokerID ${brokerId}\n  LoanID ${loanId}`);
  log(`  impair  ${imp.code} ${imp.hash}`);
  log(`  default ${def.code} ${def.hash}`);
} catch (e) {
  log(`\n💥 ARRÊT : ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 600));
} finally {
  await client.disconnect();
}
