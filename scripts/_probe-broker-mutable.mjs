// H8, suite : quels champs d'un LoanBroker sont modifiables à chaud, et le
// broker peut-il baisser son CoverRateMinimum pour libérer sa couverture ?
// Banc : broker 26D54F6AB992… (dette 4 XRP, cover 0,4 XRP, min 10 %).
// + LoanBrokerCoverClawback, 7e et dernier type jamais soumis.
import { Client, Wallet } from "xrpl";
import { NET, txUrl, pctToRate } from "./config.mjs";
import { loadAccounts, readEntry } from "./raw-submit.mjs";
import { vaultSnapshot, fmt } from "./lib/nav.mjs";

const B = "26D54F6AB992"; // préfixe, on résout l'index complet
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const brokerW = Wallet.fromSeed(broker.seed), spareW = Wallet.fromSeed(spare.seed);

// submitRaw LÈVE sur tem (submitAndWait throw) : on encapsule.
const { submitRaw } = await import("./raw-submit.mjs");
const safe = async (seed, tx, label) => {
  try { return await submitRaw(c, seed, tx, { label }); }
  catch (e) {
    const m = String(e.message).match(/(tem[A-Z_]+|tef[A-Z_]+|tel[A-Z_]+)/);
    console.log(`${label.padEnd(28)} ${m ? m[1] + " (levé, aucune trace on-chain)" : "ERREUR: " + e.message}`);
    return { code: m ? m[1] : "throw", err: e.message };
  }
};

const objs = await c.request({ command: "account_objects", account: brokerW.address, ledger_index: "validated" });
const bnode = objs.result.account_objects.find((o) => o.LedgerEntryType === "LoanBroker" && o.index.startsWith(B));
const BID = bnode.index, V = bnode.VaultID;
const lr = await c.request({ command: "account_objects", account: Wallet.fromSeed(borrower.seed).address, type: "loan", ledger_index: "validated" });
const L = lr.result.account_objects.find((o) => o.LoanBrokerID === BID)?.index;
let b = await readEntry(c, BID);
console.log(`broker ${BID}\nvault  ${V}\nloan   ${L}`);
console.log(`dette ${fmt(b.DebtTotal ?? 0)} · cover ${fmt(b.CoverAvailable ?? 0)} · min ${b.CoverRateMinimum} · liq ${b.CoverRateLiquidation} · DebtMaximum ${b.DebtMaximum}`);
const plancher = (x) => fmt(BigInt(x.DebtTotal ?? 0) * BigInt(x.CoverRateMinimum ?? 0) / 100000n);
console.log(`plancher de couverture ${plancher(b)}`);

console.log("\n════ Quels champs sont modifiables sur un broker avec un prêt vivant ? ════");
for (const [label, fields] of [
  ["CoverRateMinimum 10 %→1 % (+liq)", { CoverRateMinimum: pctToRate(1), CoverRateLiquidation: pctToRate(1) }],
  ["CoverRateMinimum seul",            { CoverRateMinimum: pctToRate(1) }],
  ["ManagementFeeRate 2 %→9 %",        { ManagementFeeRate: pctToRate(9) }],
  ["DebtMaximum → 1 drop",             { DebtMaximum: "1" }],
  ["DebtMaximum → 80 XRP",             { DebtMaximum: "80000000" }],
  ["Data seul",                        { Data: Buffer.from("modifie").toString("hex").toUpperCase() }],
]) {
  await safe(broker.seed, { TransactionType: "LoanBrokerSet", VaultID: V, LoanBrokerID: BID, ...fields }, label);
  b = await readEntry(c, BID);
  console.log(`   → min ${b.CoverRateMinimum} · liq ${b.CoverRateLiquidation} · fee ${b.ManagementFeeRate} · DebtMaximum ${b.DebtMaximum} · plancher ${plancher(b)}`);
}
console.log("\n   LoanBrokerSet sur ce broker par un TIERS :");
await safe(spare.seed, { TransactionType: "LoanBrokerSet", VaultID: V, LoanBrokerID: BID, Data: "AA" }, "par spare (tiers)");

console.log("\n════ LoanBrokerCoverClawback — 7e et dernier type jamais soumis ════");
await safe(broker.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: BID }, "Clawback par le broker");
await safe(spare.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: BID }, "Clawback par un déposant");
await safe(borrower.seed, { TransactionType: "LoanBrokerCoverClawback", LoanBrokerID: BID }, "Clawback par l'emprunteur");
b = await readEntry(c, BID);
console.log(`   cover après les clawbacks : ${fmt(b.CoverAvailable ?? 0)}`);

console.log("\n════ démontage du banc ════");
const n = await readEntry(c, L);
await safe(borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(Number(n.TotalValueOutstanding) + 300000) }, "LoanPay solde total");
await safe(broker.seed, { TransactionType: "LoanDelete", LoanID: L }, "LoanDelete");
const bn = await readEntry(c, BID).catch(() => null);
if (bn && BigInt(bn.CoverAvailable ?? 0) > 0n)
  await safe(broker.seed, { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: BID, Amount: String(bn.CoverAvailable) }, "CoverWithdraw final");
await safe(broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: BID }, "LoanBrokerDelete");
const sf = await vaultSnapshot(c, V);
console.log(`   vault : total ${fmt(sf.assetsTotal)} · dispo ${fmt(sf.assetsAvailable)}`);
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === sf.shareMPTID)?.MPTAmount ?? 0); })();
if (sh > 0n) await safe(spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: sf.shareMPTID, value: String(sh) } }, `VaultWithdraw ${sh}`);
await safe(broker.seed, { TransactionType: "VaultDelete", VaultID: V }, "VaultDelete");
await c.disconnect();
