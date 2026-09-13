// SONDE A3 — partie 1 : finir le cycle de défaut sur le prêt de la sonde A2,
// et cerner tecEXPIRED sur LoanPay. Libère aussi le capital de spare.
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts, readEntry } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
const F = { tfLoanDefault: 65536, tfLoanImpair: 131072, tfLoanUnimpair: 262144 };
const V = "3AB13225CD5F3BD06C217A9798D82387E2169D49EB9E024D62B25FCFEA418CCB";
const B = "7655AC5D448C2DB6549D206D5AAF35E02F26E48EE9A48AE96B0F87358EEB2422";
const L = "07D9FB2CBE26A6FEBB3B7F5DECCC28226B9BD8C1775D97ADEBB4A65D02C05E64";

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const spareW = Wallet.fromSeed(spare.seed);

const n = await readEntry(c, L);
const now = rippleNow();
const graceEnd = n.NextPaymentDueDate + n.GracePeriod;
const termEnd = n.StartDate + n.PaymentInterval * 4;
console.log("── État du prêt ──");
console.log(`  Flags ${n.Flags} (déprécié ${!!(n.Flags & 131072)}, défaut ${!!(n.Flags & 65536)})`);
console.log(`  StartDate ${n.StartDate} · échéance ${n.NextPaymentDueDate} (dépassée de ${now - n.NextPaymentDueDate} s)`);
console.log(`  fin de grâce dépassée de ${now - graceEnd} s · fin de terme dépassée de ${now - termEnd} s`);
console.log(`  PaymentRemaining ${n.PaymentRemaining} · PeriodicPayment ${n.PeriodicPayment}`);
console.log(`  PrincipalOutstanding ${n.PrincipalOutstanding} · TotalValueOutstanding ${n.TotalValueOutstanding}`);
console.log(`  LoanServiceFee ${n.LoanServiceFee} · LatePaymentFee ${n.LatePaymentFee}`);

const exact = Math.ceil(Number(n.PeriodicPayment)) + Number(n.LoanServiceFee ?? 0);
const withLate = exact + Number(n.LatePaymentFee ?? 0);
console.log("\n── LoanPay, trois montants, sur un prêt DÉPRÉCIÉ et hors grâce ──");
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(exact) },
  { label: `LoanPay exact (${exact})` });
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(withLate) },
  { label: `LoanPay + LatePaymentFee (${withLate})` });
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(Number(n.TotalValueOutstanding) + 1_000_000) },
  { label: `LoanPay solde total + 1 XRP` });

console.log("\n── tfLoanDefault, cette fois HORS période de grâce ──");
const b0 = await readEntry(c, B), s0 = await vaultSnapshot(c, V);
const def = await submitRaw(c, broker.seed, { TransactionType: "LoanManage", LoanID: L, Flags: F.tfLoanDefault },
  { label: "tfLoanDefault (hors grâce)" });
const s1 = await vaultSnapshot(c, V);
let b1 = null; try { b1 = await readEntry(c, B); } catch { }
let l1 = null; try { l1 = await readEntry(c, L); } catch { }
console.log(`  Loan : ${l1 ? `Flags ${l1.Flags} (défaut ${!!(l1.Flags & 65536)}) · principal ${l1.PrincipalOutstanding}` : "NŒUD SUPPRIMÉ par le défaut"}`);
console.log(`  cover       ${fmt(b0.CoverAvailable ?? 0)} → ${fmt(b1?.CoverAvailable ?? 0)}   (ponction ${fmt(BigInt(b0.CoverAvailable ?? 0) - BigInt(b1?.CoverAvailable ?? 0))})`);
console.log(`  DebtTotal   ${fmt(b0.DebtTotal ?? 0)} → ${fmt(b1?.DebtTotal ?? 0)}`);
console.log(`  AssetsTotal ${fmt(s0.assetsTotal)} → ${fmt(s1.assetsTotal)}   (perte déposant ${fmt(s0.assetsTotal - s1.assetsTotal)})`);
console.log(`  dispo       ${fmt(s0.assetsAvailable)} → ${fmt(s1.assetsAvailable)}`);
console.log(`  part        ${s0.navPerShare.toFixed(9)} → ${s1.navPerShare.toFixed(9)}`);

console.log("\n── Après défaut : l'emprunteur peut-il encore payer ? le déposant sortir ? ──");
await submitRaw(c, borrower.seed, { TransactionType: "LoanPay", LoanID: L, Amount: String(exact) },
  { label: "LoanPay après défaut" });
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === s1.shareMPTID)?.MPTAmount ?? 0); })();
console.log(`  spare détient ${sh} parts · dispo dans le vault ${fmt(s1.assetsAvailable)}`);
await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: s1.shareMPTID, value: String(sh) } }, { label: "VaultWithdraw tout" });
const s2 = await vaultSnapshot(c, V);
const sh2 = await (async () => { const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === s2.shareMPTID)?.MPTAmount ?? 0); })();
console.log(`  après retrait : parts restantes ${sh2} · AssetsTotal ${fmt(s2.assetsTotal)} · dispo ${fmt(s2.assetsAvailable)}`);
if (sh2 > 0n) {
  const q = (sh2 * s2.assetsAvailable) / (s2.assetsTotal || 1n);
  console.log(`  retrait partiel possible ? on tente ${q} parts`);
  await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
    Amount: { mpt_issuance_id: s2.shareMPTID, value: String(q) } }, { label: "VaultWithdraw partiel" });
}
console.log("\n── Démontage : LoanDelete, LoanBrokerDelete, VaultDelete ──");
await submitRaw(c, broker.seed, { TransactionType: "LoanDelete", LoanID: L }, { label: "LoanDelete" });
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerCoverWithdraw", LoanBrokerID: B,
  Amount: String(b1?.CoverAvailable ?? 0) }, { label: "CoverWithdraw (reste)" });
await submitRaw(c, broker.seed, { TransactionType: "LoanBrokerDelete", LoanBrokerID: B }, { label: "LoanBrokerDelete" });
const s3 = await vaultSnapshot(c, V).catch(() => null);
if (s3) console.log(`  vault : AssetsTotal ${fmt(s3.assetsTotal)} · dispo ${fmt(s3.assetsAvailable)} · parts ${s3.sharesOutstanding}`);
if (s3 && s3.sharesOutstanding > 0n) {
  const r = await c.request({ command: "account_objects", account: spareW.address, type: "mptoken", ledger_index: "validated" });
  const rest = BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === s3.shareMPTID)?.MPTAmount ?? 0);
  console.log(`  spare a encore ${rest} parts, on retente le retrait total`);
  await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
    Amount: { mpt_issuance_id: s3.shareMPTID, value: String(rest) } }, { label: "VaultWithdraw après démontage" });
}
await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete" });
await c.disconnect();
