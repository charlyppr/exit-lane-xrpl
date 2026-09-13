// Vault créé avec tfVaultShareNonTransferable : les parts peuvent-elles quand
// même circuler ? Payment vs EscrowCreate (on sait depuis [13:46] qu'Escrow
// ignore l'opt-in MPToken, contrairement à Payment).
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";
import { createHash, randomBytes } from "node:crypto";

const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
const createdNode = (r, t) => (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;
const seqOf = (res) => res.result?.tx_json?.Sequence ?? res.result?.Sequence;
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const spareW = Wallet.fromSeed(spare.seed), borrowerW = Wallet.fromSeed(borrower.seed);
const safe = async (seed, tx, label) => {
  try { return await submitRaw(c, seed, tx, { label }); }
  catch (e) { const m = String(e.message).match(/(tem[A-Z_]+|tec[A-Z_]+|tef[A-Z_]+)/);
    console.log(`${label.padEnd(38)} ${m ? m[1] + " (levé)" : "ERREUR " + e.message.slice(0, 70)}`);
    return { code: m ? m[1] : "throw" }; }
};
const bal = async (addr, id) => { const r = await c.request({ command: "account_objects", account: addr, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === id)?.MPTAmount ?? 0); };

console.log("VaultCreate avec tfVaultShareNonTransferable (131072)");
const v = await safe(broker.seed, { TransactionType: "VaultCreate", Asset: { currency: "XRP" },
  AssetsMaximum: XRP(50), WithdrawalPolicy: 1, Flags: 131072 }, "VaultCreate non-transférable");
if (!v.ok) { await c.disconnect(); process.exit(1); }
const V = createdNode(v.result, "Vault").LedgerIndex;
const vn = createdNode(v.result, "Vault").NewFields;
console.log(`   VaultID ${V} · Flags du nœud ${vn.Flags ?? 0}`);
await safe(spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(3) }, "VaultDeposit spare 3 XRP");
const s = await vaultSnapshot(c, V);
const ID = s.shareMPTID;
console.log(`   parts de spare : ${await bal(spareW.address, ID)} · MPTID ${ID}`);
const iss = await c.request({ command: "ledger_entry", mpt_issuance: ID, ledger_index: "validated" }).catch(() => null);
if (iss) console.log(`   MPTokenIssuance Flags ${iss.result.node.Flags} (lsfMPTCanTransfer = 32 si transférable)`);

console.log("\n1) MPTokenAuthorize du destinataire sur des parts non transférables");
await safe(borrower.seed, { TransactionType: "MPTokenAuthorize", MPTokenIssuanceID: ID }, "MPTokenAuthorize borrower");

console.log("\n2) Payment de parts (attendu : refusé)");
await safe(spare.seed, { TransactionType: "Payment", Destination: borrowerW.address,
  Amount: { mpt_issuance_id: ID, value: "1000000" } }, "Payment de parts");

console.log("\n3) EscrowCreate de parts — Escrow ignore l'opt-in, ignore-t-il aussi le flag ?");
const pre = randomBytes(32);
const COND = `A0258020${createHash("sha256").update(pre).digest("hex").toUpperCase()}810120`;
const FUL = `A0228020${pre.toString("hex").toUpperCase()}`;
const esc = await safe(spare.seed, { TransactionType: "EscrowCreate", Destination: borrowerW.address,
  Amount: { mpt_issuance_id: ID, value: "1000000" }, Condition: COND, CancelAfter: rippleNow() + 1800 },
  "EscrowCreate de parts");
if (esc.ok) {
  console.log("   ⚠️ EscrowCreate ACCEPTÉ sur des parts non transférables — on tente le dénouement");
  const fin = await safe(borrower.seed, { TransactionType: "EscrowFinish", Owner: spareW.address,
    OfferSequence: seqOf(esc.result), Condition: COND, Fulfillment: FUL }, "EscrowFinish");
  console.log(`   parts spare ${await bal(spareW.address, ID)} · parts borrower ${await bal(borrowerW.address, ID)}`);
  if (!fin.ok) {
    await safe(spare.seed, { TransactionType: "EscrowCancel", Owner: spareW.address, OfferSequence: seqOf(esc.result) }, "EscrowCancel");
  }
}

console.log("\n4) le porteur peut-il au moins retirer du vault ?");
const sh = await bal(spareW.address, ID);
await safe(spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: ID, value: String(sh) } }, `VaultWithdraw ${sh} parts`);
const bsh = await bal(borrowerW.address, ID);
if (bsh > 0n) {
  console.log(`   borrower détient ${bsh} parts — peut-il les rendre au vault ?`);
  await safe(borrower.seed, { TransactionType: "VaultWithdraw", VaultID: V,
    Amount: { mpt_issuance_id: ID, value: String(bsh) } }, "VaultWithdraw par borrower");
}
const sf = await vaultSnapshot(c, V);
console.log(`   vault : total ${fmt(sf.assetsTotal)} · parts en circulation ${sf.sharesOutstanding}`);
await safe(broker.seed, { TransactionType: "VaultDelete", VaultID: V }, "VaultDelete");
await c.disconnect();
