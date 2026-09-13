// Vault created with tfVaultShareNonTransferable: can the shares still
// circulate? Payment vs EscrowCreate (we know since [13:46] that Escrow
// ignores the MPToken opt-in, unlike Payment).
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
    console.log(`${label.padEnd(38)} ${m ? m[1] + " (thrown)" : "ERROR " + e.message.slice(0, 70)}`);
    return { code: m ? m[1] : "throw" }; }
};
const bal = async (addr, id) => { const r = await c.request({ command: "account_objects", account: addr, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === id)?.MPTAmount ?? 0); };

console.log("VaultCreate with tfVaultShareNonTransferable (131072)");
const v = await safe(broker.seed, { TransactionType: "VaultCreate", Asset: { currency: "XRP" },
  AssetsMaximum: XRP(50), WithdrawalPolicy: 1, Flags: 131072 }, "VaultCreate non-transferable");
if (!v.ok) { await c.disconnect(); process.exit(1); }
const V = createdNode(v.result, "Vault").LedgerIndex;
const vn = createdNode(v.result, "Vault").NewFields;
console.log(`   VaultID ${V}, node Flags ${vn.Flags ?? 0}`);
await safe(spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(3) }, "VaultDeposit spare 3 XRP");
const s = await vaultSnapshot(c, V);
const ID = s.shareMPTID;
console.log(`   spare's shares: ${await bal(spareW.address, ID)}, MPTID ${ID}`);
const iss = await c.request({ command: "ledger_entry", mpt_issuance: ID, ledger_index: "validated" }).catch(() => null);
if (iss) console.log(`   MPTokenIssuance Flags ${iss.result.node.Flags} (lsfMPTCanTransfer = 32 if transferable)`);

console.log("\n1) MPTokenAuthorize by the recipient on non-transferable shares");
await safe(borrower.seed, { TransactionType: "MPTokenAuthorize", MPTokenIssuanceID: ID }, "MPTokenAuthorize borrower");

console.log("\n2) Payment of shares (expected: rejected)");
await safe(spare.seed, { TransactionType: "Payment", Destination: borrowerW.address,
  Amount: { mpt_issuance_id: ID, value: "1000000" } }, "Payment of shares");

console.log("\n3) EscrowCreate of shares: Escrow ignores the opt-in, does it also ignore the flag?");
const pre = randomBytes(32);
const COND = `A0258020${createHash("sha256").update(pre).digest("hex").toUpperCase()}810120`;
const FUL = `A0228020${pre.toString("hex").toUpperCase()}`;
const esc = await safe(spare.seed, { TransactionType: "EscrowCreate", Destination: borrowerW.address,
  Amount: { mpt_issuance_id: ID, value: "1000000" }, Condition: COND, CancelAfter: rippleNow() + 1800 },
  "EscrowCreate of shares");
if (esc.ok) {
  console.log("   EscrowCreate ACCEPTED on non-transferable shares, trying to settle it");
  const fin = await safe(borrower.seed, { TransactionType: "EscrowFinish", Owner: spareW.address,
    OfferSequence: seqOf(esc.result), Condition: COND, Fulfillment: FUL }, "EscrowFinish");
  console.log(`   spare shares ${await bal(spareW.address, ID)}, borrower shares ${await bal(borrowerW.address, ID)}`);
  if (!fin.ok) {
    await safe(spare.seed, { TransactionType: "EscrowCancel", Owner: spareW.address, OfferSequence: seqOf(esc.result) }, "EscrowCancel");
  }
}

console.log("\n4) can the holder at least withdraw from the vault?");
const sh = await bal(spareW.address, ID);
await safe(spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: ID, value: String(sh) } }, `VaultWithdraw ${sh} shares`);
const bsh = await bal(borrowerW.address, ID);
if (bsh > 0n) {
  console.log(`   borrower holds ${bsh} shares, can it return them to the vault?`);
  await safe(borrower.seed, { TransactionType: "VaultWithdraw", VaultID: V,
    Amount: { mpt_issuance_id: ID, value: String(bsh) } }, "VaultWithdraw by borrower");
}
const sf = await vaultSnapshot(c, V);
console.log(`   vault: total ${fmt(sf.assetsTotal)}, shares outstanding ${sf.sharesOutstanding}`);
await safe(broker.seed, { TransactionType: "VaultDelete", VaultID: V }, "VaultDelete");
await c.disconnect();
