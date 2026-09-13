// H2 — le montant exact d'un paiement en retard bouge-t-il pendant qu'on le lit ?
// Prêt avec LateInterestRate élevé pour rendre la dérive visible.
import { Client, Wallet } from "xrpl";
import { NET, pctToRate } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts, signLoanSetCounterparty, readEntry } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
const createdNode = (r, t) => (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LATE = 262144;
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const brokerW = Wallet.fromSeed(broker.seed), spareW = Wallet.fromSeed(spare.seed), borrowerW = Wallet.fromSeed(borrower.seed);
const safe = async (seed, tx, label) => { try { return await submitRaw(c, seed, tx, { label }); }
  catch (e) { const m = String(e.message).match(/(tem[A-Z_]+|tec[A-Z_]+)/); console.log(`${label.padEnd(40)} ${m ? m[1] + " (levé)" : e.message.slice(0,70)}`); return { code: m ? m[1] : "throw" }; } };

console.log("── existe-t-il une commande RPC pour lire un prêt ? ──");
for (const cmd of ["loan_info", "loan_broker_info", "vault_info"]) {
  try { await c.request({ command: cmd, ledger_index: "validated" }); console.log(`   ${cmd} → existe`); }
  catch (e) { console.log(`   ${cmd} → ${e.data?.error ?? e.message}`.slice(0, 90)); }
}

const v = await safe(broker.seed, { TransactionType: "VaultCreate", Asset: { currency: "XRP" },
  AssetsMaximum: XRP(50), WithdrawalPolicy: 1 }, "VaultCreate");
const V = createdNode(v.result, "Vault").LedgerIndex;
await safe(spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(5) }, "VaultDeposit spare 5");
const brk = await safe(broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V, ManagementFeeRate: pctToRate(2),
  DebtMaximum: XRP(50), CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5) }, "LoanBrokerSet");
const B = createdNode(brk.result, "LoanBroker").LedgerIndex;
await safe(broker.seed, { TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: B, Amount: XRP(1) }, "CoverDeposit 1");

console.log("\n── LoanSet avec LateInterestRate 30 % (InterestRate 8 %) ──");
const prep = await c.autofill({ TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: B,
  Counterparty: borrowerW.address, PrincipalRequested: XRP(3), InterestRate: pctToRate(8),
  LateInterestRate: pctToRate(30), PaymentInterval: 90, PaymentTotal: 4, GracePeriod: 60,
  LoanOriginationFee: XRP(0.02), LoanServiceFee: XRP(0.005), LatePaymentFee: XRP(0.01), ClosePaymentFee: XRP(0.01) });
const r0 = await c.submitAndWait(signLoanSetCounterparty(brokerW.sign(prep).tx_blob, borrower.seed));
console.log(`LoanSet ${r0.result.meta?.TransactionResult}  ${r0.result.hash}`);
const L = createdNode(r0.result, "Loan")?.LedgerIndex;
let n = await readEntry(c, L);
console.log(`   LateInterestRate enregistré : ${n.LateInterestRate ?? "ABSENT ⚠️"} · InterestRate ${n.InterestRate}`);
console.log(`   échéance dans ${n.NextPaymentDueDate - rippleNow()} s · PeriodicPayment ${n.PeriodicPayment}`);

const due = (x) => Math.ceil(Number(x.PeriodicPayment)) + Number(x.LoanServiceFee ?? 0) + Number(x.LatePaymentFee ?? 0);
console.log("\n── attente du dépassement d'échéance ──");
while (rippleNow() <= n.NextPaymentDueDate + 8) { await sleep(10000); n = await readEntry(c, L);
  console.log(`   échéance dans ${n.NextPaymentDueDate - rippleNow()} s`); }

console.log("\n════ H2 — le montant dû dérive-t-il avec le temps ? ════");
const obs = [];
for (let i = 0; i < 5; i++) {
  n = await readEntry(c, L);
  const t = rippleNow() - n.NextPaymentDueDate;
  obs.push({ t, periodic: n.PeriodicPayment, total: n.TotalValueOutstanding, due: due(n), principal: n.PrincipalOutstanding });
  console.log(`   retard ${String(t).padStart(4)} s · PeriodicPayment ${n.PeriodicPayment} · TotalValueOutstanding ${n.TotalValueOutstanding} · dû calculé ${due(n)}`);
  if (i < 4) await sleep(20000);
}
const drift = obs[obs.length - 1].due - obs[0].due;
console.log(`\n   dérive du montant dû sur ${obs[obs.length - 1].t - obs[0].t} s : ${drift} drops`);

console.log("\n── test décisif : payer un montant PÉRIMÉ de 60 s ──");
const stale = obs[0].due;
console.log(`   montant lu il y a ${obs[obs.length - 1].t - obs[0].t} s : ${stale} drops`);
const p1 = await safe(borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(stale), Flags: LATE },
  `LoanPay montant périmé (${stale})`);
if (!p1.ok) {
  n = await readEntry(c, L);
  console.log(`   → rejeté. Montant frais : ${due(n)} drops`);
  await safe(borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(due(n)), Flags: LATE },
    `LoanPay montant frais (${due(n)})`);
}
console.log("\n── et un surpaiement en retard : l'excédent est-il ignoré ? ──");
n = await readEntry(c, L).catch(() => null);
if (n && Number(n.PaymentRemaining ?? 0) > 0) {
  const before = { p: n.PrincipalOutstanding, r: n.PaymentRemaining };
  await safe(borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(due(n) + 2_000_000), Flags: LATE },
    `LoanPay en retard + 2 XRP d'excédent`);
  const a = await readEntry(c, L).catch(() => null);
  console.log(`   principal ${before.p} → ${a?.PrincipalOutstanding ?? "soldé"} · échéances ${before.r} → ${a?.PaymentRemaining ?? 0}`);
}

console.log("\n── démontage ──");
n = await readEntry(c, L).catch(() => null);
while (n && Number(n.PaymentRemaining ?? 0) > 0) {
  const late = rippleNow() > n.NextPaymentDueDate;
  const r = await safe(borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(due(n)), ...(late ? { Flags: LATE } : {}) },
    `LoanPay reste (${n.PaymentRemaining})`);
  if (!r.ok) break;
  n = await readEntry(c, L).catch(() => null);
}
await safe(broker.seed, { TransactionType: "LoanDelete", LoanID: L }, "LoanDelete");
const bn = await readEntry(c, B).catch(() => null);
if (bn && BigInt(bn.CoverAvailable ?? 0) > 0n) await safe(broker.seed,
  { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: String(bn.CoverAvailable) }, "CoverWithdraw");
await safe(broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: B }, "LoanBrokerDelete");
const sf = await vaultSnapshot(c, V);
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === sf.shareMPTID)?.MPTAmount ?? 0); })();
if (sh > 0n) await safe(spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: sf.shareMPTID, value: String(sh) } }, "VaultWithdraw spare");
await safe(broker.seed, { TransactionType: "VaultDelete", VaultID: V }, "VaultDelete");
console.log(`\nIDs : vault ${V} · broker ${B} · loan ${L}`);
await c.disconnect();
