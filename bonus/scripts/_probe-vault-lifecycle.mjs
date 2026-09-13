// PROBE A1: VaultSet / VaultClawback / VaultDelete, never submitted so far.
// + open questions from section B: AssetsMaximum reached, two depositors.
// Depositors: spare and borrower. NEVER lender (150 XRP floor).

import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const createdNode = (r, t) =>
  (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;

// Submission WITHOUT the SDK's local validation: required to ask the ledger
// what the SDK validator refuses to express. This is a `client libraries`
// feedback item in itself.
async function submitUnvalidated(client, seed, tx, label) {
  const w = Wallet.fromSeed(seed);
  const payload = { Account: w.address, ...tx };
  let prepared;
  try { prepared = await client.autofill(payload); }
  catch (e) { console.log(`${label.padEnd(46)} AUTOFILL FAILED: ${e.message}`); return { code: "autofill-failed", err: e.message }; }
  prepared.SigningPubKey = w.publicKey;
  prepared.TxnSignature = kpSign(encodeForSigning(prepared), w.privateKey);
  try {
    const res = await client.submitAndWait(encode(prepared));
    const code = res.result.meta?.TransactionResult ?? "?";
    console.log(`${label.padEnd(46)} ${code}`);
    console.log(`  ${txUrl(res.result.hash)}`);
    return { code, hash: res.result.hash, result: res.result, ok: code === "tesSUCCESS" };
  } catch (e) {
    console.log(`${label.padEnd(46)} LOCAL/RPC REJECTION: ${e.message}`);
    return { code: "rejected", err: e.message };
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

console.log("\n════ BENCH: open-ended vault, AssetsMaximum = 10 XRP ════");
const v = M("VaultCreate(max=10)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultCreate", Asset: { currency: "XRP" },
  AssetsMaximum: XRP(10), WithdrawalPolicy: 1,
  Data: Buffer.from("probe-A1").toString("hex").toUpperCase(),
}, { label: "VaultCreate(max=10)" }));
if (!v.ok) { console.log("bench failed"); await c.disconnect(); process.exit(1); }
const V = createdNode(v.result, "Vault").LedgerIndex;
console.log(`  VaultID ${V}`);
const vn0 = createdNode(v.result, "Vault").NewFields ?? {};
console.log(`  fields at creation: ${JSON.stringify(vn0)}`);

console.log("\n──── Q1: two depositors on the same vault (never tested) ────");
M("VaultDeposit spare 3 XRP", await submitRaw(c, spare.seed, {
  TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(3) }, { label: "Deposit spare 3 XRP" }));
M("VaultDeposit borrower 3 XRP", await submitRaw(c, borrower.seed, {
  TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(3) }, { label: "Deposit borrower 3 XRP" }));
let s = await vaultSnapshot(c, V);
console.log(`  AssetsTotal ${fmt(s.assetsTotal)} · shares ${s.sharesOutstanding} · max ${fmt(s.raw.AssetsMaximum ?? 0)}`);

console.log("\n──── Q2: AssetsMaximum reached, deposit above the cap ────");
M("VaultDeposit spare 5 XRP (total 11 > max 10)", await submitRaw(c, spare.seed, {
  TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(5) }, { label: "Deposit 5 XRP above the max" }));
s = await vaultSnapshot(c, V);
console.log(`  after the attempt: AssetsTotal ${fmt(s.assetsTotal)} (partial deposit? ${s.assetsTotal > 6_000_000n ? "YES ⚠️" : "no, fully rejected"})`);

console.log("\n──── Q3: VaultSet, lower AssetsMaximum BELOW AssetsTotal ────");
M("VaultSet max=4 XRP (< AssetsTotal 6)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultSet", VaultID: V, AssetsMaximum: XRP(4) }, { label: "VaultSet max=4 < total=6" }));
s = await vaultSnapshot(c, V);
console.log(`  AssetsMaximum read ${fmt(s.raw.AssetsMaximum ?? 0)} · AssetsTotal ${fmt(s.assetsTotal)}`);

console.log("\n──── Q4: VaultSet AssetsMaximum = 0 (unlimited?) ────");
M("VaultSet max=0", await submitRaw(c, broker.seed, {
  TransactionType: "VaultSet", VaultID: V, AssetsMaximum: "0" }, { label: "VaultSet max=0" }));
s = await vaultSnapshot(c, V);
console.log(`  AssetsMaximum read: ${s.raw.AssetsMaximum ?? "ABSENT from the node"}`);
M("VaultDeposit borrower 2 XRP after max=0", await submitRaw(c, borrower.seed, {
  TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(2) }, { label: "Deposit 2 XRP after max=0" }));

console.log("\n──── Q5: VaultSet Data alone, then by a NON-owner ────");
M("VaultSet Data (owner)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultSet", VaultID: V,
  Data: Buffer.from("probe-A1 modified").toString("hex").toUpperCase() }, { label: "VaultSet Data (owner)" }));
M("VaultSet by spare (non-owner)", await submitRaw(c, spare.seed, {
  TransactionType: "VaultSet", VaultID: V, AssetsMaximum: XRP(999) }, { label: "VaultSet by non-owner" }));

console.log("\n──── Q6: VaultSet WithdrawalPolicy, absent from the SDK model ────");
M("VaultSet WithdrawalPolicy=2 (raw)", await submitUnvalidated(c, broker.seed, {
  TransactionType: "VaultSet", VaultID: V, WithdrawalPolicy: 2 }, "VaultSet WithdrawalPolicy=2 (raw)"));
s = await vaultSnapshot(c, V);
console.log(`  WithdrawalPolicy read: ${s.raw.WithdrawalPolicy}`);

console.log("\n──── Q7: VaultClawback on an XRP vault ────");
M("VaultClawback full (owner, no Amount)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultClawback", VaultID: V, Holder: spareW.address }, { label: "VaultClawback full by owner" }));
M("VaultClawback partial 1 XRP (raw, drops)", await submitUnvalidated(c, broker.seed, {
  TransactionType: "VaultClawback", VaultID: V, Holder: spareW.address, Amount: XRP(1) },
  "VaultClawback partial drops (raw)"));

console.log("\n──── Q8: VaultDelete on a NON-EMPTY vault ────");
M("VaultDelete (AssetsTotal > 0)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete non-empty vault" }));

console.log("\n──── Q9: empty the vault, two depositors, WithdrawalPolicy 1 ────");
s = await vaultSnapshot(c, V);
const bal = async (a) => {
  const r = await c.request({ command: "account_objects", account: a, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === s.shareMPTID)?.MPTAmount ?? 0);
};
const sp = await bal(spareW.address), bo = await bal(borrowerW.address);
console.log(`  shares spare ${sp} · borrower ${bo} · total ${s.sharesOutstanding}`);
M("VaultWithdraw spare (all)", await submitRaw(c, spare.seed, {
  TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: s.shareMPTID, value: String(sp) } }, { label: "Full withdrawal spare" }));
M("VaultWithdraw borrower (all)", await submitRaw(c, borrower.seed, {
  TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: s.shareMPTID, value: String(bo) } }, { label: "Full withdrawal borrower" }));
s = await vaultSnapshot(c, V);
console.log(`  AssetsTotal ${fmt(s.assetsTotal)} · shares outstanding ${s.sharesOutstanding}`);

console.log("\n──── Q10: VaultDelete empty, but MPTokens still held ────");
M("VaultDelete by spare (non-owner)", await submitRaw(c, spare.seed, {
  TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete by non-owner" }));
M("VaultDelete (empty, MPToken alive)", await submitRaw(c, broker.seed, {
  TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete empty vault" }));

console.log("\n════ SUMMARY ════");
log.forEach((l) => console.log("  " + l));
await c.disconnect();
