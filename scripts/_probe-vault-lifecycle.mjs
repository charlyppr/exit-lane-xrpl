// SONDE A1 — VaultSet / VaultClawback / VaultDelete, jamais soumis jusqu'ici.
// + questions ouvertes section B : AssetsMaximum atteint, deux déposants.
// Déposants : spare et borrower. JAMAIS lender (plancher 150 XRP).

import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl } from "./config.mjs";
import { submitRaw, loadAccounts } from "./raw-submit.mjs";
import { vaultSnapshot, fmt } from "./lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const createdNode = (r, t) =>
  (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;

// Soumission SANS validation locale du SDK : indispensable pour demander au
// ledger ce que le validateur du SDK refuse d'exprimer. C'est un item feedback
// `client libraries` en soi.
async function submitUnvalidated(client, seed, tx, label) {
  const w = Wallet.fromSeed(seed);
  const payload = { Account: w.address, ...tx };
  let prepared;
  try { prepared = await client.autofill(payload); }
  catch (e) { console.log(`${label.padEnd(46)} AUTOFILL KO: ${e.message}`); return { code: "autofill-ko", err: e.message }; }
  prepared.SigningPubKey = w.publicKey;
  prepared.TxnSignature = kpSign(encodeForSigning(prepared), w.privateKey);
  try {
    const res = await client.submitAndWait(encode(prepared));
    const code = res.result.meta?.TransactionResult ?? "?";
    console.log(`${label.padEnd(46)} ${code}`);
    console.log(`  ${txUrl(res.result.hash)}`);
    return { code, hash: res.result.hash, result: res.result, ok: code === "tesSUCCESS" };
  } catch (e) {
    console.log(`${label.padEnd(46)} REJET LOCAL/RPC: ${e.message}`);
    return { code: "rejet", err: e.message };
  }
}

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const brokerW = Wallet.fromSeed(broker.seed);
const spareW = Wallet.fromSeed(spare.seed);
const borrowerW = Wallet.fromSeed(borrower.seed);
const log = [];
const M = (l, r) => (log.push(`${l} → ${r.code}${r.hash ? " " + r.hash : ""}${r.err ? " [" + r.err + "]" : ""}`), r);

console.log("\n════ BANC : vault open-ended, AssetsMaximum = 10 XRP ════");
const v = M("VaultCreate(max=10)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultCreate", Asset: { currency: "XRP" },
  AssetsMaximum: XRP(10), WithdrawalPolicy: 1,
  Data: Buffer.from("probe-A1").toString("hex").toUpperCase(),
}, { label: "VaultCreate(max=10)" }));
if (!v.ok) { console.log("banc KO"); await c.disconnect(); process.exit(1); }
const V = createdNode(v.result, "Vault").LedgerIndex;
console.log(`  VaultID ${V}`);
const vn0 = createdNode(v.result, "Vault").NewFields ?? {};
console.log(`  champs à la création : ${JSON.stringify(vn0)}`);

console.log("\n──── Q1 : deux déposants sur le même vault (jamais testé) ────");
M("VaultDeposit spare 3 XRP", await submitRaw(c, spare.seed, {
  TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(3) }, { label: "Dépôt spare 3 XRP" }));
M("VaultDeposit borrower 3 XRP", await submitRaw(c, borrower.seed, {
  TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(3) }, { label: "Dépôt borrower 3 XRP" }));
let s = await vaultSnapshot(c, V);
console.log(`  AssetsTotal ${fmt(s.assetsTotal)} · parts ${s.sharesOutstanding} · max ${fmt(s.raw.AssetsMaximum ?? 0)}`);

console.log("\n──── Q2 : AssetsMaximum atteint — dépôt au-delà du plafond ────");
M("VaultDeposit spare 5 XRP (total 11 > max 10)", await submitRaw(c, spare.seed, {
  TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(5) }, { label: "Dépôt 5 XRP au-delà du max" }));
s = await vaultSnapshot(c, V);
console.log(`  après tentative : AssetsTotal ${fmt(s.assetsTotal)} (dépôt partiel ? ${s.assetsTotal > 6_000_000n ? "OUI ⚠️" : "non, rejet total"})`);

console.log("\n──── Q3 : VaultSet — réduire AssetsMaximum SOUS AssetsTotal ────");
M("VaultSet max=4 XRP (< AssetsTotal 6)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultSet", VaultID: V, AssetsMaximum: XRP(4) }, { label: "VaultSet max=4 < total=6" }));
s = await vaultSnapshot(c, V);
console.log(`  AssetsMaximum lu ${fmt(s.raw.AssetsMaximum ?? 0)} · AssetsTotal ${fmt(s.assetsTotal)}`);

console.log("\n──── Q4 : VaultSet AssetsMaximum = 0 (illimité ?) ────");
M("VaultSet max=0", await submitRaw(c, broker.seed, {
  TransactionType: "VaultSet", VaultID: V, AssetsMaximum: "0" }, { label: "VaultSet max=0" }));
s = await vaultSnapshot(c, V);
console.log(`  AssetsMaximum lu : ${s.raw.AssetsMaximum ?? "ABSENT du nœud"}`);
M("VaultDeposit borrower 2 XRP après max=0", await submitRaw(c, borrower.seed, {
  TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(2) }, { label: "Dépôt 2 XRP après max=0" }));

console.log("\n──── Q5 : VaultSet Data seul, puis par un NON-propriétaire ────");
M("VaultSet Data (owner)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultSet", VaultID: V,
  Data: Buffer.from("probe-A1 modifie").toString("hex").toUpperCase() }, { label: "VaultSet Data (owner)" }));
M("VaultSet par spare (non-owner)", await submitRaw(c, spare.seed, {
  TransactionType: "VaultSet", VaultID: V, AssetsMaximum: XRP(999) }, { label: "VaultSet par non-owner" }));

console.log("\n──── Q6 : VaultSet WithdrawalPolicy — absent du modèle SDK ────");
M("VaultSet WithdrawalPolicy=2 (raw)", await submitUnvalidated(c, broker.seed, {
  TransactionType: "VaultSet", VaultID: V, WithdrawalPolicy: 2 }, "VaultSet WithdrawalPolicy=2 (raw)"));
s = await vaultSnapshot(c, V);
console.log(`  WithdrawalPolicy lu : ${s.raw.WithdrawalPolicy}`);

console.log("\n──── Q7 : VaultClawback sur un vault en XRP ────");
M("VaultClawback total (owner, sans Amount)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultClawback", VaultID: V, Holder: spareW.address }, { label: "VaultClawback total par owner" }));
M("VaultClawback partiel 1 XRP (raw, drops)", await submitUnvalidated(c, broker.seed, {
  TransactionType: "VaultClawback", VaultID: V, Holder: spareW.address, Amount: XRP(1) },
  "VaultClawback partiel drops (raw)"));

console.log("\n──── Q8 : VaultDelete sur vault NON VIDE ────");
M("VaultDelete (AssetsTotal > 0)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete vault non vide" }));

console.log("\n──── Q9 : on vide le vault, deux déposants, WithdrawalPolicy 1 ────");
s = await vaultSnapshot(c, V);
const bal = async (a) => {
  const r = await c.request({ command: "account_objects", account: a, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === s.shareMPTID)?.MPTAmount ?? 0);
};
const sp = await bal(spareW.address), bo = await bal(borrowerW.address);
console.log(`  parts spare ${sp} · borrower ${bo} · total ${s.sharesOutstanding}`);
M("VaultWithdraw spare (tout)", await submitRaw(c, spare.seed, {
  TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: s.shareMPTID, value: String(sp) } }, { label: "Retrait total spare" }));
M("VaultWithdraw borrower (tout)", await submitRaw(c, borrower.seed, {
  TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: s.shareMPTID, value: String(bo) } }, { label: "Retrait total borrower" }));
s = await vaultSnapshot(c, V);
console.log(`  AssetsTotal ${fmt(s.assetsTotal)} · parts en circulation ${s.sharesOutstanding}`);

console.log("\n──── Q10 : VaultDelete vide, mais MPToken encore détenus ────");
M("VaultDelete par spare (non-owner)", await submitRaw(c, spare.seed, {
  TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete par non-owner" }));
M("VaultDelete (vide, MPToken en vie)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete vault vide" }));

console.log("\n════ RÉCAPITULATIF ════");
log.forEach((l) => console.log("  " + l));
await c.disconnect();
