// Control: can a depositor tell a NORMAL vault from a non-transferable one?
// Where is the difference written?
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot } from "../../scripts/lib/nav.mjs";
const XRP = (n) => String(Math.round(n * 1_000_000));
const createdNode = (r, t) => (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare, borrower } = loadAccounts();
const borrowerW = Wallet.fromSeed(borrower.seed);
const safe = async (seed, tx, label) => { try { return await submitRaw(c, seed, tx, { label }); }
  catch (e) { const m = String(e.message).match(/(tem[A-Z_]+|tec[A-Z_]+)/); console.log(`${label.padEnd(34)} ${m ? m[1] : e.message.slice(0,60)}`); return { code: m ? m[1] : "throw" }; } };

for (const [label, flags] of [["NORMAL (no flag)", undefined], ["NON-TRANSFERABLE (131072)", 131072]]) {
  console.log(`\n════ vault ${label} ════`);
  const v = await safe(broker.seed, { TransactionType: "VaultCreate", Asset: { currency: "XRP" },
    AssetsMaximum: XRP(50), WithdrawalPolicy: 1, ...(flags ? { Flags: flags } : {}) }, "VaultCreate");
  const V = createdNode(v.result, "Vault").LedgerIndex;
  await safe(spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(2) }, "VaultDeposit 2 XRP");
  const s = await vaultSnapshot(c, V);
  const vnode = (await c.request({ command: "ledger_entry", index: V, ledger_index: "validated" })).result.node;
  const iss = (await c.request({ command: "ledger_entry", mpt_issuance: s.shareMPTID, ledger_index: "validated" })).result.node;
  console.log(`   Vault.Flags            = ${vnode.Flags}`);
  console.log(`   MPTokenIssuance.Flags  = ${iss.Flags}   (lsfMPTCanTransfer = 32)`);
  console.log(`   → transferable according to the flag: ${(iss.Flags & 32) ? "YES" : "NO"}`);
  console.log(`   issuance fields: ${Object.keys(iss).filter(k => k !== "index").join(", ")}`);
  await safe(borrower.seed, { TransactionType: "MPTokenAuthorize", MPTokenIssuanceID: s.shareMPTID }, "MPTokenAuthorize dest.");
  await safe(spare.seed, { TransactionType: "Payment", Destination: borrowerW.address,
    Amount: { mpt_issuance_id: s.shareMPTID, value: "500000" } }, "Payment of shares");
  const r = await c.request({ command: "account_objects", account: borrowerW.address, type: "mptoken", ledger_index: "validated" });
  const got = BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === s.shareMPTID)?.MPTAmount ?? 0);
  console.log(`   shares received by the destination: ${got}`);
  // cleanup
  const back = got;
  if (back > 0n) await safe(borrower.seed, { TransactionType: "VaultWithdraw", VaultID: V,
    Amount: { mpt_issuance_id: s.shareMPTID, value: String(back) } }, "VaultWithdraw destination");
  const sp = await c.request({ command: "account_objects", account: Wallet.fromSeed(spare.seed).address, type: "mptoken", ledger_index: "validated" });
  const rest = BigInt(sp.result.account_objects.find((o) => o.MPTokenIssuanceID === s.shareMPTID)?.MPTAmount ?? 0);
  if (rest > 0n) await safe(spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
    Amount: { mpt_issuance_id: s.shareMPTID, value: String(rest) } }, "VaultWithdraw spare");
  await safe(broker.seed, { TransactionType: "VaultDelete", VaultID: V }, "VaultDelete");
}
await c.disconnect();
