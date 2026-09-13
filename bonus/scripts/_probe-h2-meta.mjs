// Where does the excess of an overpaid late payment go? Reading the metadata.
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { loadAccounts, readEntry } from "../../scripts/raw-submit.mjs";
import { fmt } from "../../scripts/lib/nav.mjs";
const L = "9AE30FB7A1615928CD6CB7C5591EAE2F8D607D078CF122E013205FA88DD3AB8F";
const V = "7D2AA666FC3C27816E79063A4F3FB674622C205B1A5728ADB60FDA7709CB0361";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const a = loadAccounts();
const bw = Wallet.fromSeed(a.borrower.seed);
const r = await c.request({ command: "account_tx", account: bw.address, limit: 8, ledger_index_max: -1, ledger_index_min: -1 });
const pay = r.result.transactions.find((e) => (e.tx_json ?? e.tx).TransactionType === "LoanPay" && e.meta?.TransactionResult === "tesSUCCESS");
const t = pay.tx_json ?? pay.tx;
console.log(`LoanPay ${pay.hash}\n  Amount sent : ${t.Amount} drops (${fmt(t.Amount)})  Flags ${t.Flags}`);
console.log(`  Fee : ${t.Fee} drops`);
console.log("\n-- balance movements in the metadata --");
for (const n of pay.meta.AffectedNodes) {
  const k = n.ModifiedNode ?? n.CreatedNode ?? n.DeletedNode;
  const type = k.LedgerEntryType;
  if (type === "AccountRoot") {
    const before = k.PreviousFields?.Balance, after = k.FinalFields?.Balance ?? k.NewFields?.Balance;
    if (before && after) {
      const d = BigInt(after) - BigInt(before);
      const who = Object.entries(a).find(([, v]) => v.address === (k.FinalFields?.Account ?? k.NewFields?.Account))?.[0];
      console.log(`  ${type.padEnd(16)} ${(who ?? (k.FinalFields?.Account ?? "").slice(0, 12) + "...").padEnd(12)} ${d > 0n ? "+" : ""}${fmt(d)}`);
    }
  } else if (type === "Vault") {
    console.log(`  Vault            AssetsTotal ${fmt(k.PreviousFields?.AssetsTotal ?? 0)} -> ${fmt(k.FinalFields?.AssetsTotal ?? 0)}, available ${fmt(k.PreviousFields?.AssetsAvailable ?? 0)} -> ${fmt(k.FinalFields?.AssetsAvailable ?? 0)}`);
  } else if (type === "Loan") {
    const p = k.PreviousFields ?? {}, f = k.FinalFields ?? {};
    console.log(`  Loan             principal ${fmt(p.PrincipalOutstanding ?? 0)} -> ${fmt(f.PrincipalOutstanding ?? 0)}, total ${fmt(p.TotalValueOutstanding ?? 0)} -> ${fmt(f.TotalValueOutstanding ?? 0)}, installments ${p.PaymentRemaining ?? "?"} -> ${f.PaymentRemaining ?? "?"}`);
    console.log(`                   NextPaymentDueDate ${p.NextPaymentDueDate ?? "?"} -> ${f.NextPaymentDueDate ?? "?"}`);
  } else if (type === "LoanBroker") {
    console.log(`  LoanBroker       cover ${fmt(k.PreviousFields?.CoverAvailable ?? 0)} -> ${fmt(k.FinalFields?.CoverAvailable ?? 0)}, debt ${fmt(k.PreviousFields?.DebtTotal ?? 0)} -> ${fmt(k.FinalFields?.DebtTotal ?? 0)}`);
  }
}
const n = await readEntry(c, L).catch(() => null);
if (n) {
  const due = Math.ceil(Number(n.PeriodicPayment)) + Number(n.LoanServiceFee ?? 0) + Number(n.LatePaymentFee ?? 0);
  console.log(`\n-- loan state now --`);
  console.log(`  PeriodicPayment ${n.PeriodicPayment}, LoanServiceFee ${n.LoanServiceFee}, LatePaymentFee ${n.LatePaymentFee}`);
  console.log(`  LateInterestRate ${n.LateInterestRate}, node formula -> ${due} drops`);
  console.log(`  PaymentRemaining ${n.PaymentRemaining}, TotalValueOutstanding ${n.TotalValueOutstanding}`);
}
await c.disconnect();
