// Le flag tfLoanLatePayment débloque-t-il le paiement en retard ?
// Prêt 3B5940A4… : en retard, déprécié, vault 4275B537… encore vivant.
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
console.log("── Nœud Vault BRUT (le champ LossUnrealized que nav.mjs ne lit pas) ──");
console.log(JSON.stringify(vnode.result.node, null, 2));

let n = await readEntry(c, L);
const now = rippleNow();
console.log(`\n── Prêt : déprécié ${!!(n.Flags & 131072)} · échéance dépassée de ${now - n.NextPaymentDueDate} s · terme ${n.StartDate + n.PaymentInterval * 4 - now > 0 ? "dans " + (n.StartDate + n.PaymentInterval * 4 - now) : "dépassé de " + (now - n.StartDate - n.PaymentInterval * 4)} s`);
const exact = Math.ceil(Number(n.PeriodicPayment)) + Number(n.LoanServiceFee ?? 0);
const late = exact + Number(n.LatePaymentFee ?? 0);
console.log(`   échéance ${exact} drops · avec LatePaymentFee ${late} · solde ${n.TotalValueOutstanding}`);

console.log("\n── LoanPay AVEC tfLoanLatePayment ──");
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(late),
  Flags: PAY.tfLoanLatePayment }, { label: "tfLoanLatePayment + LatePaymentFee" });
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(exact),
  Flags: PAY.tfLoanLatePayment }, { label: "tfLoanLatePayment, échéance seule" });
console.log("\n── LoanPay avec tfLoanFullPayment (solde total) ──");
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L,
  Amount: String(Number(n.TotalValueOutstanding) + 500000), Flags: PAY.tfLoanFullPayment },
  { label: "tfLoanFullPayment" });
console.log("\n── et sans flag, pour mémoire ──");
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(late) },
  { label: "sans flag (rappel)" });

n = await readEntry(c, L).catch(() => null);
if (n) {
  console.log(`\n   Prêt après : PaymentRemaining ${n.PaymentRemaining} · principal ${n.PrincipalOutstanding} · Flags ${n.Flags} · échéance ${n.NextPaymentDueDate}`);
} else console.log("\n   prêt supprimé (soldé)");
const v2 = await c.request({ command: "ledger_entry", index: V, ledger_index: "validated" }).catch(() => null);
if (v2) { const x = v2.result.node;
  console.log(`   Vault : AssetsTotal ${fmt(x.AssetsTotal ?? 0)} · dispo ${fmt(x.AssetsAvailable ?? 0)} · LossUnrealized ${x.LossUnrealized ?? "ABSENT"}`); }
const b2 = await readEntry(c, B).catch(() => null);
if (b2) console.log(`   Broker : DebtTotal ${fmt(b2.DebtTotal ?? 0)} · CoverAvailable ${fmt(b2.CoverAvailable ?? 0)}`);
await c.disconnect();
