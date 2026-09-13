// H10 (cover cliff) + H7 (owner != broker) + WithdrawalPolicy != 1
// + two concurrent loans on the same vault. All without waiting.
import { Client, Wallet } from "xrpl";
import { NET, pctToRate } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts, signLoanSetCounterparty, readEntry } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const createdNode = (r, t) => (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower, lender } = loadAccounts();
const brokerW = Wallet.fromSeed(broker.seed), spareW = Wallet.fromSeed(spare.seed), borrowerW = Wallet.fromSeed(borrower.seed);
const safe = async (seed, tx, label) => {
  try { return await submitRaw(c, seed, tx, { label }); }
  catch (e) { const m = String(e.message).match(/(tem[A-Z_]+|tef[A-Z_]+|tel[A-Z_]+)/);
    console.log(`${label.padEnd(34)} ${m ? m[1] + " (thrown)" : "ERROR " + e.message.slice(0, 80)}`);
    return { code: m ? m[1] : "throw", err: e.message }; }
};
const loanSet = async (B, principal, label) => {
  const prep = await c.autofill({ TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: B,
    Counterparty: borrowerW.address, PrincipalRequested: XRP(principal), InterestRate: pctToRate(8),
    PaymentInterval: 2_592_000, PaymentTotal: 4, GracePeriod: 86_400, LoanOriginationFee: XRP(0.02),
    LoanServiceFee: XRP(0.005), LatePaymentFee: XRP(0.01), ClosePaymentFee: XRP(0.01) });
  try {
    const r = await c.submitAndWait(signLoanSetCounterparty(brokerW.sign(prep).tx_blob, borrower.seed));
    const code = r.result.meta?.TransactionResult;
    console.log(`${label.padEnd(34)} ${code}  ${r.result.hash}`);
    return { code, hash: r.result.hash, ok: code === "tesSUCCESS", id: createdNode(r.result, "Loan")?.LedgerIndex };
  } catch (e) { const m = String(e.message).match(/(tem[A-Z_]+|tec[A-Z_]+)/);
    console.log(`${label.padEnd(34)} ${m ? m[1] + " (thrown)" : e.message.slice(0, 80)}`); return { code: m ? m[1] : "throw" }; }
};

console.log("==== WithdrawalPolicy != 1: the SDK only validates \"isNumber\" ====");
console.log("   (the SDK's VaultWithdrawalPolicy enum contains ONLY the value 1)");
const created = [];
for (const p of [0, 2, 3, 99, 255]) {
  const r = await safe(broker.seed, { TransactionType: "VaultCreate", Asset: { currency: "XRP" },
    AssetsMaximum: XRP(50), WithdrawalPolicy: p }, `VaultCreate WithdrawalPolicy=${p}`);
  if (r.ok) { const id = createdNode(r.result, "Vault")?.LedgerIndex;
    const n = await readEntry(c, id);
    console.log(`   ACCEPTED: WithdrawalPolicy read from the node: ${n.WithdrawalPolicy}`);
    created.push(id); }
}
const r0 = await safe(broker.seed, { TransactionType: "VaultCreate", Asset: { currency: "XRP" },
  AssetsMaximum: XRP(50) }, "VaultCreate without WithdrawalPolicy");
const V = createdNode(r0.result, "Vault").LedgerIndex;
console.log(`   default: WithdrawalPolicy = ${(await readEntry(c, V)).WithdrawalPolicy}`);
for (const id of created) await safe(broker.seed, { TransactionType: "VaultDelete", VaultID: id }, "  cleanup VaultDelete");

console.log("\n==== H7: LoanBrokerSet from an account that is NOT the vault owner ====");
await safe(spare.seed, { TransactionType: "LoanBrokerSet", VaultID: V, ManagementFeeRate: pctToRate(2),
  DebtMaximum: XRP(50), CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5) },
  "LoanBrokerSet by spare (not owner)");
await safe(lender.seed, { TransactionType: "LoanBrokerSet", VaultID: V, ManagementFeeRate: pctToRate(2),
  DebtMaximum: XRP(50), CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5) },
  "LoanBrokerSet by lender (not owner)");

console.log("\n==== H10: the two cliffs, isolated ====");
await safe(spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(10) }, "VaultDeposit spare 10 XRP");
const brk = await safe(broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V, ManagementFeeRate: pctToRate(2),
  DebtMaximum: XRP(50), CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5) }, "LoanBrokerSet (owner)");
const B = createdNode(brk.result, "LoanBroker").LedgerIndex;
await safe(broker.seed, { TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: B, Amount: XRP(0.2) }, "CoverDeposit 0.2 XRP");
const cap = async () => { const b = await readEntry(c, B); const s = await vaultSnapshot(c, V);
  console.log(`   debt ${fmt(b.DebtTotal ?? 0)}, cover ${fmt(b.CoverAvailable ?? 0)} -> debt capacity ${fmt(BigInt(b.CoverAvailable ?? 0) * 10n)}, vault liquidity ${fmt(s.assetsAvailable)}`); };
await cap();

console.log("\n1) loan within both limits");
const l1 = await loanSet(B, 1.5, "LoanSet 1.5 XRP");
await cap();
console.log("\n2) COVER CLIFF in isolation: ample liquidity (8.5), capacity exceeded (2)");
await loanSet(B, 1, "LoanSet 1 XRP (debt 2.5 > 2)");
console.log("\n3) top up the cover, then a SECOND concurrent loan");
await safe(broker.seed, { TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: B, Amount: XRP(5) }, "CoverDeposit +5 XRP");
const l2 = await loanSet(B, 1, "LoanSet #2 (concurrent)");
await cap();
if (l1.id && l2.id) {
  const n1 = await readEntry(c, l1.id), n2 = await readEntry(c, l2.id);
  console.log(`   loan 1 principal ${fmt(n1.PrincipalOutstanding)}, loan 2 principal ${fmt(n2.PrincipalOutstanding)}: two live loans on one vault`);
}
console.log("\n4) LIQUIDITY CLIFF in isolation: ample cover (5.2 -> capacity 52), liquidity 7.5");
await loanSet(B, 9, "LoanSet 9 XRP (> liquidity)");
await cap();

console.log("\n==== teardown ====");
for (const [i, id] of [l1.id, l2.id].entries()) {
  if (!id) continue;
  const n = await readEntry(c, id);
  await safe(borrower.seed, { TransactionType: "LoanPay", LoanID: id, Amount: String(Number(n.TotalValueOutstanding) + 200000) }, `LoanPay full balance loan ${i + 1}`);
  await safe(broker.seed, { TransactionType: "LoanDelete", LoanID: id }, `LoanDelete loan ${i + 1}`);
}
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
await c.disconnect();
