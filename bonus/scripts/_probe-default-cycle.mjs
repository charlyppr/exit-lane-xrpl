// PROBE A2 + D: LoanManage (tfLoanUnimpair, tfLoanDefault), LoanDelete,
// LoanBrokerDelete: 4 of the 7 types/flags never submitted. Plus the full
// default cycle and its effect on the depositor's share.
// Depositor: spare. NEVER lender.

import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl, pctToRate } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts, signLoanSetCounterparty, readEntry } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
const createdNode = (r, t) => (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const F = { tfLoanDefault: 65536, tfLoanImpair: 131072, tfLoanUnimpair: 262144 };

async function submitUnvalidated(client, seed, tx, label) {
  const w = Wallet.fromSeed(seed);
  let prepared;
  try { prepared = await client.autofill({ Account: w.address, ...tx }); }
  catch (e) { console.log(`${label.padEnd(44)} AUTOFILL FAILED: ${e.message}`); return { code: "autofill-ko" }; }
  prepared.SigningPubKey = w.publicKey;
  prepared.TxnSignature = kpSign(encodeForSigning(prepared), w.privateKey);
  try {
    const res = await client.submitAndWait(encode(prepared));
    const code = res.result.meta?.TransactionResult ?? "?";
    console.log(`${label.padEnd(44)} ${code}`);
    return { code, hash: res.result.hash, result: res.result, ok: code === "tesSUCCESS" };
  } catch (e) { console.log(`${label.padEnd(44)} REJECTED: ${e.message}`); return { code: "rejected", err: e.message }; }
}

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const brokerW = Wallet.fromSeed(broker.seed), spareW = Wallet.fromSeed(spare.seed), borrowerW = Wallet.fromSeed(borrower.seed);
const log = [];
const M = (l, r) => (log.push(`${l.padEnd(44)} ${r.code}${r.hash ? "  " + r.hash : ""}`), r);

const loanState = async (L) => {
  const n = await readEntry(c, L);
  const f = n.Flags ?? 0;
  return { n, flags: f,
    impaired: !!(f & 131072), defaulted: !!(f & 65536),
    due: n.NextPaymentDueDate, remaining: n.PaymentRemaining,
    principal: n.PrincipalOutstanding, total: n.TotalValueOutstanding };
};
const brokerState = async (B) => { const n = await readEntry(c, B);
  return { cover: BigInt(n.CoverAvailable ?? 0), debt: BigInt(n.DebtTotal ?? 0), n }; };

console.log("\n════ BENCH ════");
const v = M("VaultCreate", await submitRaw(c, broker.seed, { TransactionType: "VaultCreate",
  Asset: { currency: "XRP" }, AssetsMaximum: XRP(100), WithdrawalPolicy: 1,
  Data: Buffer.from("probe-default").toString("hex").toUpperCase() }, { label: "VaultCreate" }));
const V = createdNode(v.result, "Vault").LedgerIndex;
M("VaultDeposit spare 5 XRP", await submitRaw(c, spare.seed, { TransactionType: "VaultDeposit",
  VaultID: V, Amount: XRP(5) }, { label: "VaultDeposit spare 5" }));
const brk = M("LoanBrokerSet", await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerSet",
  VaultID: V, ManagementFeeRate: pctToRate(2), DebtMaximum: XRP(50),
  CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5) }, { label: "LoanBrokerSet" }));
const B = createdNode(brk.result, "LoanBroker").LedgerIndex;
M("CoverDeposit 1 XRP", await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverDeposit",
  LoanBrokerID: B, Amount: XRP(1) }, { label: "LoanBrokerCoverDeposit 1" }));

console.log("\n   LoanSet: 4 XRP, 60 s installments, 60 s grace (the known minimum)");
const prepared = await c.autofill({ TransactionType: "LoanSet", Account: brokerW.address,
  LoanBrokerID: B, Counterparty: borrowerW.address, PrincipalRequested: XRP(4),
  InterestRate: pctToRate(8), PaymentInterval: 60, PaymentTotal: 4, GracePeriod: 60,
  LoanOriginationFee: XRP(0.05), LoanServiceFee: XRP(0.01),
  LatePaymentFee: XRP(0.02), ClosePaymentFee: XRP(0.02) });
const res = await c.submitAndWait(signLoanSetCounterparty(brokerW.sign(prepared).tx_blob, borrower.seed));
console.log(`LoanSet                                      ${res.result.meta?.TransactionResult}`);
console.log(`  ${txUrl(res.result.hash)}`);
log.push(`${"LoanSet".padEnd(44)} ${res.result.meta?.TransactionResult}  ${res.result.hash}`);
const L = createdNode(res.result, "Loan")?.LedgerIndex;
if (!L) { console.log("no loan, aborting"); await c.disconnect(); process.exit(1); }
let ls = await loanState(L);
const t0 = rippleNow();
console.log(`  LoanID ${L}`);
console.log(`  StartDate ${ls.n.StartDate} · NextPaymentDueDate ${ls.due} (in ${ls.due - t0} s) · grace ${ls.n.GracePeriod} s`);
console.log(`  PeriodicPayment ${ls.n.PeriodicPayment} · PrincipalOutstanding ${ls.principal} · Flags ${ls.flags}`);

console.log("\n════ PHASE 1: HEALTHY loan, the expected refusals ════");
M("tfLoanUnimpair on a healthy loan", await submitRaw(c, broker.seed, { TransactionType: "LoanManage",
  LoanID: L, Flags: F.tfLoanUnimpair }, { label: "tfLoanUnimpair (healthy)" }));
M("tfLoanDefault on a healthy loan", await submitRaw(c, broker.seed, { TransactionType: "LoanManage",
  LoanID: L, Flags: F.tfLoanDefault }, { label: "tfLoanDefault (healthy)" }));
M("LoanManage without any flag", await submitRaw(c, broker.seed, { TransactionType: "LoanManage",
  LoanID: L }, { label: "LoanManage Flags=0" }));
M("tfLoanImpair by the BORROWER", await submitRaw(c, borrower.seed, { TransactionType: "LoanManage",
  LoanID: L, Flags: F.tfLoanImpair }, { label: "tfLoanImpair by borrower" }));
M("Default+Impair at once (raw)", await submitUnvalidated(c, broker.seed, { TransactionType: "LoanManage",
  LoanID: L, Flags: F.tfLoanDefault | F.tfLoanImpair }, "Default+Impair (raw)"));
M("LoanDelete on a live loan", await submitRaw(c, broker.seed, { TransactionType: "LoanDelete",
  LoanID: L }, { label: "LoanDelete (live loan)" }));
M("LoanBrokerDelete with a live loan", await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerDelete",
  LoanBrokerID: B }, { label: "LoanBrokerDelete (live loan)" }));
M("VaultDelete with a live broker", await submitRaw(c, broker.seed, { TransactionType: "VaultDelete",
  VaultID: V }, { label: "VaultDelete (live broker)" }));

console.log("\n════ PHASE 2: from WHEN is tfLoanImpair allowed? ════");
console.log("   (tecTOO_SOON does not say from when: measure the boundary)");
let impaired = null;
for (let i = 0; i < 14; i++) {
  const now = rippleNow();
  ls = await loanState(L);
  const dDue = now - ls.due, dGrace = now - (ls.due + ls.n.GracePeriod);
  const r = await submitRaw(c, broker.seed, { TransactionType: "LoanManage", LoanID: L, Flags: F.tfLoanImpair },
    { label: `impair @ due${dDue >= 0 ? "+" : ""}${dDue}s grace${dGrace >= 0 ? "+" : ""}${dGrace}s` });
  console.log(`      → ${r.code}  (due date ${dDue >= 0 ? "exceeded by " + dDue : "in " + -dDue} s · end of grace ${dGrace >= 0 ? "exceeded by " + dGrace : "in " + -dGrace} s)`);
  if (r.ok) { impaired = { dDue, dGrace, hash: r.hash };
    log.push(`tfLoanImpair OK at due+${dDue}s / grace+${dGrace}s        tesSUCCESS  ${r.hash}`); break; }
  log.push(`tfLoanImpair refused at due${dDue >= 0 ? "+" : ""}${dDue}s / grace${dGrace >= 0 ? "+" : ""}${dGrace}s   ${r.code}`);
  await sleep(15000);
}
if (!impaired) { console.log("   impair never accepted in 14 attempts, stopping here"); }

console.log("\n════ PHASE 3: effect of IMPAIRMENT on the vault and the depositor ════");
let s = await vaultSnapshot(c, V);
let bs = await brokerState(B);
ls = await loanState(L);
console.log(`   Loan Flags ${ls.flags} (impaired ${ls.impaired}, default ${ls.defaulted})`);
console.log(`   Vault: AssetsTotal ${fmt(s.assetsTotal)} · available ${fmt(s.assetsAvailable)} · share ${s.navPerShare.toFixed(9)}`);
console.log(`   Broker: cover ${fmt(bs.cover)} · DebtTotal ${fmt(bs.debt)}`);
const navAfterImpair = s.navPerShare, totalAfterImpair = s.assetsTotal;

if (impaired) {
  console.log("\n════ PHASE 4: tfLoanUnimpair on an ACTUALLY impaired loan ════");
  const un = M("tfLoanUnimpair (impaired loan)", await submitRaw(c, broker.seed, { TransactionType: "LoanManage",
    LoanID: L, Flags: F.tfLoanUnimpair }, { label: "tfLoanUnimpair (impaired)" }));
  ls = await loanState(L); s = await vaultSnapshot(c, V);
  console.log(`   Flags ${ls.flags} (impaired ${ls.impaired}) · AssetsTotal ${fmt(s.assetsTotal)} · share ${s.navPerShare.toFixed(9)}`);
  console.log(`   reversible: ${s.assetsTotal === totalAfterImpair && un.ok ? "no effect on the vault" : "effect observed ⚠️"}`);

  console.log("\n════ PHASE 5: re-impair then tfLoanDefault ════");
  M("tfLoanImpair (2nd time)", await submitRaw(c, broker.seed, { TransactionType: "LoanManage",
    LoanID: L, Flags: F.tfLoanImpair }, { label: "tfLoanImpair #2" }));
  const before = { s: await vaultSnapshot(c, V), b: await brokerState(B) };
  const def = M("tfLoanDefault", await submitRaw(c, broker.seed, { TransactionType: "LoanManage",
    LoanID: L, Flags: F.tfLoanDefault }, { label: "tfLoanDefault" }));
  const after = { s: await vaultSnapshot(c, V), b: await brokerState(B) };
  ls = await loanState(L).catch(() => null);
  console.log(`   Loan after default: ${ls ? `Flags ${ls.flags} (default ${ls.defaulted}) · principal ${ls.principal}` : "NODE DELETED"}`);
  console.log(`   cover      ${fmt(before.b.cover)} → ${fmt(after.b.cover)}   (drawn ${fmt(before.b.cover - after.b.cover)})`);
  console.log(`   DebtTotal  ${fmt(before.b.debt)} → ${fmt(after.b.debt)}`);
  console.log(`   AssetsTotal ${fmt(before.s.assetsTotal)} → ${fmt(after.s.assetsTotal)}   (loss ${fmt(before.s.assetsTotal - after.s.assetsTotal)})`);
  console.log(`   available  ${fmt(before.s.assetsAvailable)} → ${fmt(after.s.assetsAvailable)}`);
  console.log(`   share      ${before.s.navPerShare.toFixed(9)} → ${after.s.navPerShare.toFixed(9)}`);

  console.log("\n════ PHASE 6: cleanup after default: LoanDelete, LoanBrokerDelete ════");
  M("LoanPay on a defaulted loan", await submitRaw(c, borrower.seed, { TransactionType: "LoanPay",
    LoanID: L, Amount: XRP(1) }, { label: "LoanPay (in default)" }));
  M("LoanDelete after default", await submitRaw(c, broker.seed, { TransactionType: "LoanDelete",
    LoanID: L }, { label: "LoanDelete (after default)" }));
  M("LoanBrokerDelete after default", await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerDelete",
    LoanBrokerID: B }, { label: "LoanBrokerDelete (after default)" }));
  const s2 = await vaultSnapshot(c, V);
  console.log(`   Final vault: AssetsTotal ${fmt(s2.assetsTotal)} · available ${fmt(s2.assetsAvailable)} · share ${s2.navPerShare.toFixed(9)}`);
  console.log(`   Can the depositor exit? shares outstanding ${s2.sharesOutstanding}`);
  const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  const sh = BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === s2.shareMPTID)?.MPTAmount ?? 0);
  console.log(`   spare holds ${sh} shares, theoretical value ${fmt(s2.sharesOutstanding === 0n ? 0n : (sh * s2.assetsTotal) / s2.sharesOutstanding)}`);
  M("VaultWithdraw spare (all, after default)", await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw",
    VaultID: V, Amount: { mpt_issuance_id: s2.shareMPTID, value: String(sh) } }, { label: "VaultWithdraw after default" }));
  M("Final VaultDelete", await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "Final VaultDelete" }));
}

console.log("\n════ SUMMARY ════");
log.forEach((l) => console.log("  " + l));
console.log(`\nIDs: vault ${V}\n      broker ${B}\n      loan ${L}`);
await c.disconnect();
