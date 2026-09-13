// Does the tfLoanLatePayment flag unblock a late payment?
// Loan 3B5940A4…: late, impaired, vault 4275B537… still alive.
import { Client } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts, readEntry } from "../../scripts/raw-submit.mjs";
import { fmt } from "../../scripts/lib/nav.mjs";

const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
const V = "4275B5371C9258031696F2C3273A83C53B4936B7E14EA7509030C8E21C875157";
const B = "8EBB8008B18C3E1F393559E4C7EB61BAC81D6CCFEA500EBB3FF68C989A1717FD";
const L = "3B5940A46FCF52B4860AFA7B82C4F56630E03214A4BD5A2DFD6F6B9FF5FC7F1E";
const PAY = { tfLoanOverpayment: 65536, tfLoanFullPayment: 131072, tfLoanLatePayment: 262144 };

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, borrower } = loadAccounts();

const vnode = await c.request({ command: "ledger_entry", index: V, ledger_index: "validated" });
console.log("── RAW Vault node (the LossUnrealized field that nav.mjs does not read) ──");
console.log(JSON.stringify(vnode.result.node, null, 2));

let n = await readEntry(c, L);
const now = rippleNow();
console.log(`\n── Loan: impaired ${!!(n.Flags & 131072)} · due date overdue by ${now - n.NextPaymentDueDate} s · term ${n.StartDate + n.PaymentInterval * 4 - now > 0 ? "ends in " + (n.StartDate + n.PaymentInterval * 4 - now) : "ended " + (now - n.StartDate - n.PaymentInterval * 4) + " s ago"} s`);
const exact = Math.ceil(Number(n.PeriodicPayment)) + Number(n.LoanServiceFee ?? 0);
const late = exact + Number(n.LatePaymentFee ?? 0);
console.log(`   installment ${exact} drops · with LatePaymentFee ${late} · outstanding ${n.TotalValueOutstanding}`);

console.log("\n── LoanPay WITH tfLoanLatePayment ──");
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(late),
  Flags: PAY.tfLoanLatePayment }, { label: "tfLoanLatePayment + LatePaymentFee" });
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(exact),
  Flags: PAY.tfLoanLatePayment }, { label: "tfLoanLatePayment, installment only" });
console.log("\n── LoanPay with tfLoanFullPayment (full outstanding balance) ──");
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L,
  Amount: String(Number(n.TotalValueOutstanding) + 500000), Flags: PAY.tfLoanFullPayment },
  { label: "tfLoanFullPayment" });
console.log("\n── and without any flag, for the record ──");
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(late) },
  { label: "no flag (reminder)" });

n = await readEntry(c, L).catch(() => null);
if (n) {
  console.log(`\n   Loan after: PaymentRemaining ${n.PaymentRemaining} · principal ${n.PrincipalOutstanding} · Flags ${n.Flags} · due date ${n.NextPaymentDueDate}`);
} else console.log("\n   loan deleted (paid off)");
const v2 = await c.request({ command: "ledger_entry", index: V, ledger_index: "validated" }).catch(() => null);
if (v2) { const x = v2.result.node;
  console.log(`   Vault: AssetsTotal ${fmt(x.AssetsTotal ?? 0)} · available ${fmt(x.AssetsAvailable ?? 0)} · LossUnrealized ${x.LossUnrealized ?? "ABSENT"}`); }
const b2 = await readEntry(c, B).catch(() => null);
if (b2) console.log(`   Broker: DebtTotal ${fmt(b2.DebtTotal ?? 0)} · CoverAvailable ${fmt(b2.CoverAvailable ?? 0)}`);
await c.disconnect();
