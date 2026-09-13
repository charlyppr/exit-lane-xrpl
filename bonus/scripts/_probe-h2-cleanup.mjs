// Teardown of the H2 bench: 3 remaining installments, late → LATE + large amount.
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts, readEntry } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";
const L = "9AE30FB7A1615928CD6CB7C5591EAE2F8D607D078CF122E013205FA88DD3AB8F";
const V = "7D2AA666FC3C27816E79063A4F3FB674622C205B1A5728ADB60FDA7709CB0361";
const B = "F3BE7F21EE48100394C5C058738F834FF7E3B8EAF7C962A88CB2A2F226AC5F76";
const LATE = 262144;
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const spareW = Wallet.fromSeed(spare.seed);
const safe = async (seed, tx, label) => { try { return await submitRaw(c, seed, tx, { label }); }
  catch (e) { const m = String(e.message).match(/(tem[A-Z_]+|tec[A-Z_]+)/); console.log(`${label.padEnd(34)} ${m ? m[1] : e.message.slice(0,60)}`); return { code: m ? m[1] : "throw" }; } };
let n = await readEntry(c, L).catch(() => null);
let guard = 0;
while (n && Number(n.PaymentRemaining ?? 0) > 0 && guard++ < 6) {
  const large = Math.ceil(Number(n.PeriodicPayment)) + Number(n.LoanServiceFee ?? 0) + Number(n.LatePaymentFee ?? 0) + 500_000;
  const r = await safe(borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(large), Flags: LATE },
    `LoanPay large (remaining ${n.PaymentRemaining})`);
  if (!r.ok) break;
  n = await readEntry(c, L).catch(() => null);
}
console.log(`   loan : ${n ? `PaymentRemaining ${n.PaymentRemaining ?? 0}` : "deleted"}`);
await safe(broker.seed, { TransactionType: "LoanDelete", LoanID: L }, "LoanDelete");
const bn = await readEntry(c, B).catch(() => null);
if (bn && BigInt(bn.CoverAvailable ?? 0) > 0n) await safe(broker.seed,
  { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: String(bn.CoverAvailable) }, "CoverWithdraw");
await safe(broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: B }, "LoanBrokerDelete");
const sf = await vaultSnapshot(c, V);
console.log(`   vault : total ${fmt(sf.assetsTotal)} · available ${fmt(sf.assetsAvailable)} · share ${sf.navPerShare.toFixed(9)}`);
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === sf.shareMPTID)?.MPTAmount ?? 0); })();
if (sh > 0n) await safe(spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: sf.shareMPTID, value: String(sh) } }, `VaultWithdraw ${sh}`);
await safe(broker.seed, { TransactionType: "VaultDelete", VaultID: V }, "VaultDelete");
await c.disconnect();
