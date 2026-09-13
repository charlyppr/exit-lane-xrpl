// How does a LATE borrower pay off their loan?
// tfLoanFullPayment alone → tecEXPIRED. Do the flags combine?
// Also cleans up vault 4275B537… along the way (5 XRP of spare locked).
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
  } catch (e) { console.log(`${label.padEnd(40)} REJECTED: ${e.message}`); return { code: "rejected", err: e.message }; }
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
console.log(`loan : PaymentRemaining ${s.n.PaymentRemaining} · due date passed by ${rippleNow() - s.n.NextPaymentDueDate} s · balance ${s.tot} · Flags ${s.n.Flags}`);

console.log("\n1) tfLoanLatePayment | tfLoanFullPayment (393216): do the flags combine?");
console.log("   (the SDK validator refuses locally: \"Only one of tfLoanLatePayment,");
console.log("    tfLoanFullPayment, or tfLoanOverpayment flags can be set\"; we ask the ledger)");
await submitUnvalidated(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L,
  Amount: String(s.tot + 500000), Flags: LATE | FULL }, "LATE|FULL (raw, full balance)");
s = await st();
console.log(`   PaymentRemaining ${s.n.PaymentRemaining} · balance ${s.tot}`);

if (s.n.PaymentRemaining > 0) {
  console.log("\n2) one late installment with tfLoanLatePayment, then check the due date");
  await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(s.late), Flags: LATE },
    { label: "LATE, one installment" });
  s = await st();
  const d = s.n.NextPaymentDueDate - rippleNow();
  console.log(`   PaymentRemaining ${s.n.PaymentRemaining} · due date ${d > 0 ? "IN THE FUTURE (+" + d + " s)" : "still passed by " + -d + " s"}`);
  if (s.n.PaymentRemaining > 0 && d > 0) {
    console.log("\n3) loan is \"current\" again → tfLoanFullPayment should pass");
    await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(s.tot + 500000), Flags: FULL },
      { label: "FULL on current loan" });
  } else if (s.n.PaymentRemaining > 0) {
    console.log("\n3) still late → pay installment by installment with LATE");
    for (let i = 0; i < 4 && (await st()).n.PaymentRemaining > 0; i++) {
      const x = await st();
      const r = await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(x.late), Flags: LATE },
        { label: `LATE installment ${i + 1}` });
      if (!r.ok) break;
    }
  }
}

const finalLoan = await readEntry(c, L).catch(() => null);
console.log(`\n   loan : ${finalLoan ? `PaymentRemaining ${finalLoan.PaymentRemaining} · balance ${finalLoan.TotalValueOutstanding} · Flags ${finalLoan.Flags}` : "DELETED"}`);
if (finalLoan && Number(finalLoan.PaymentRemaining) === 0) {
  console.log("\n4) LoanPay on a fully paid loan (doc: tecKILLED)");
  await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: "100000" }, { label: "LoanPay paid-off loan" });
}
console.log("\n── teardown ──");
await submitRaw(c, broker.seed, { TransactionType: "LoanDelete", LoanID: L }, { label: "LoanDelete" });
const bn = await readEntry(c, B).catch(() => null);
if (bn && BigInt(bn.CoverAvailable ?? 0) > 0n) await submitRaw(c, broker.seed,
  { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B, Amount: String(bn.CoverAvailable) }, { label: "CoverWithdraw" });
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: B }, { label: "LoanBrokerDelete" });
const sf = await vaultSnapshot(c, V);
console.log(`   vault : AssetsTotal ${fmt(sf.assetsTotal)} · available ${fmt(sf.assetsAvailable)} · LossUnrealized ${sf.raw.LossUnrealized ?? "ABSENT"} · share ${sf.navPerShare.toFixed(9)}`);
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === sf.shareMPTID)?.MPTAmount ?? 0); })();
if (sh > 0n) await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: sf.shareMPTID, value: String(sh) } }, { label: `VaultWithdraw ${sh} shares` });
await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete" });
await c.disconnect();
