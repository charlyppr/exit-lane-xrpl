// Comment un emprunteur EN RETARD solde-t-il son prêt ?
// tfLoanFullPayment seul → tecEXPIRED. Les flags se combinent-ils ?
// Nettoie au passage le vault 4275B537… (5 XRP de spare immobilisés).
import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts, readEntry } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
const V = "4275B5371C9258031696F2C3273A83C53B4936B7E14EA7509030C8E21C875157";
const B = "8EBB8008B18C3E1F393559E4C7EB61BAC81D6CCFEA500EBB3FF68C989A1717FD";
const L = "3B5940A46FCF52B4860AFA7B82C4F56630E03214A4BD5A2DFD6F6B9FF5FC7F1E";
const LATE = 262144, FULL = 131072;

async function submitUnvalidated(client, seed, tx, label) {
  const w = Wallet.fromSeed(seed);
  const prepared = await client.autofill({ Account: w.address, ...tx });
  prepared.SigningPubKey = w.publicKey;
  prepared.TxnSignature = kpSign(encodeForSigning(prepared), w.privateKey);
  try {
    const res = await client.submitAndWait(encode(prepared));
    const code = res.result.meta?.TransactionResult ?? "?";
    console.log(`${label.padEnd(40)} ${code}  ${res.result.hash}`);
    return { code, hash: res.result.hash, ok: code === "tesSUCCESS" };
  } catch (e) { console.log(`${label.padEnd(40)} REJET: ${e.message}`); return { code: "rejet", err: e.message }; }
}

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const spareW = Wallet.fromSeed(spare.seed);
const st = async () => { const n = await readEntry(c, L); return { n,
  exact: Math.ceil(Number(n.PeriodicPayment)) + Number(n.LoanServiceFee ?? 0),
  late: Math.ceil(Number(n.PeriodicPayment)) + Number(n.LoanServiceFee ?? 0) + Number(n.LatePaymentFee ?? 0),
  tot: Number(n.TotalValueOutstanding ?? 0) }; };

let s = await st();
console.log(`prêt : PaymentRemaining ${s.n.PaymentRemaining} · échéance dépassée de ${rippleNow() - s.n.NextPaymentDueDate} s · solde ${s.tot} · Flags ${s.n.Flags}`);

console.log("\n1) tfLoanLatePayment | tfLoanFullPayment (393216) — les flags se combinent-ils ?");
console.log("   (le validateur du SDK refuse en local : « Only one of tfLoanLatePayment,");
console.log("    tfLoanFullPayment, or tfLoanOverpayment flags can be set » — on demande au ledger)");
await submitUnvalidated(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L,
  Amount: String(s.tot + 500000), Flags: LATE | FULL }, "LATE|FULL (raw, solde total)");
s = await st();
console.log(`   PaymentRemaining ${s.n.PaymentRemaining} · solde ${s.tot}`);

if (s.n.PaymentRemaining > 0) {
  console.log("\n2) une échéance en retard avec tfLoanLatePayment, puis on regarde l'échéance");
  await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(s.late), Flags: LATE },
    { label: "LATE, une échéance" });
  s = await st();
  const d = s.n.NextPaymentDueDate - rippleNow();
  console.log(`   PaymentRemaining ${s.n.PaymentRemaining} · échéance ${d > 0 ? "DANS LE FUTUR (+" + d + " s)" : "encore dépassée de " + -d + " s"}`);
  if (s.n.PaymentRemaining > 0 && d > 0) {
    console.log("\n3) prêt redevenu « à jour » → tfLoanFullPayment doit passer");
    await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(s.tot + 500000), Flags: FULL },
      { label: "FULL sur prêt à jour" });
  } else if (s.n.PaymentRemaining > 0) {
    console.log("\n3) toujours en retard → on paie échéance par échéance avec LATE");
    for (let i = 0; i < 4 && (await st()).n.PaymentRemaining > 0; i++) {
      const x = await st();
      const r = await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(x.late), Flags: LATE },
        { label: `LATE échéance ${i + 1}` });
      if (!r.ok) break;
    }
  }
}

const fin = await readEntry(c, L).catch(() => null);
console.log(`\n   prêt : ${fin ? `PaymentRemaining ${fin.PaymentRemaining} · solde ${fin.TotalValueOutstanding} · Flags ${fin.Flags}` : "SUPPRIMÉ"}`);
if (fin && Number(fin.PaymentRemaining) === 0) {
  console.log("\n4) LoanPay sur un prêt intégralement payé (doc : tecKILLED)");
  await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: "100000" }, { label: "LoanPay prêt soldé" });
}
console.log("\n── démontage ──");
await submitRaw(c, broker.seed, { TransactionType: "LoanDelete", LoanID: L }, { label: "LoanDelete" });
const bn = await readEntry(c, B).catch(() => null);
if (bn && BigInt(bn.CoverAvailable ?? 0) > 0n) await submitRaw(c, broker.seed,
  { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: String(bn.CoverAvailable) }, { label: "CoverWithdraw" });
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: B }, { label: "LoanBrokerDelete" });
const sf = await vaultSnapshot(c, V);
console.log(`   vault : AssetsTotal ${fmt(sf.assetsTotal)} · dispo ${fmt(sf.assetsAvailable)} · LossUnrealized ${sf.raw.LossUnrealized ?? "ABSENT"} · part ${sf.navPerShare.toFixed(9)}`);
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === sf.shareMPTID)?.MPTAmount ?? 0); })();
if (sh > 0n) await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: sf.shareMPTID, value: String(sh) } }, { label: `VaultWithdraw ${sh} parts` });
await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete" });
await c.disconnect();
