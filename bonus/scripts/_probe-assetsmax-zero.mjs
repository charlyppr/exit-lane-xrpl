// AssetsMaximum = 0: unlimited cap, or deposit freeze? The previous test did
// not settle it (the deposit stayed under the old cap). Here we exceed it.
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const createdNode = (r, t) => (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare } = loadAccounts();
const show = async (V, t) => { const s = await vaultSnapshot(c, V);
  console.log(`   ${t}: AssetsTotal ${fmt(s.assetsTotal)} · AssetsMaximum ${s.raw.AssetsMaximum ? fmt(s.raw.AssetsMaximum) : "ABSENT"}`); return s; };

const v = await submitRaw(c, broker.seed, { TransactionType: "VaultCreate", Asset: { currency: "XRP" },
  AssetsMaximum: XRP(5), WithdrawalPolicy: 1 }, { label: "VaultCreate(max=5)" });
const V = createdNode(v.result, "Vault").LedgerIndex;
await submitRaw(c, spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(3) }, { label: "Deposit 3 XRP" });
await show(V, "state");

console.log("\n1) VaultSet max = AssetsTotal exactly (3 XRP), the \"freeze\" move");
await submitRaw(c, broker.seed, { TransactionType: "VaultSet", VaultID: V, AssetsMaximum: XRP(3) }, { label: "VaultSet max=3 (=total)" });
await show(V, "after");
console.log("   1 XRP deposit into a frozen vault:");
await submitRaw(c, spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(1) }, { label: "Deposit 1 XRP (frozen)" });

console.log("\n2) VaultSet max = 0, then a deposit that EXCEEDS the old 5 XRP cap");
await submitRaw(c, broker.seed, { TransactionType: "VaultSet", VaultID: V, AssetsMaximum: "0" }, { label: "VaultSet max=0" });
await show(V, "after max=0");
const d = await submitRaw(c, spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(4) }, { label: "Deposit 4 XRP (total 7 > 5)" });
const s = await show(V, "after deposit");
console.log(`\n   VERDICT: AssetsMaximum = 0 means ${d.ok ? "UNLIMITED (the cap is DISABLED) ⚠️" : "FREEZE (deposits blocked)"}`);

console.log("\n3) Can a cap be set again after a 0?");
await submitRaw(c, broker.seed, { TransactionType: "VaultSet", VaultID: V, AssetsMaximum: XRP(5) }, { label: "VaultSet max=5 (< total 7)" });
await submitRaw(c, broker.seed, { TransactionType: "VaultSet", VaultID: V, AssetsMaximum: XRP(7) }, { label: "VaultSet max=7 (= total)" });
await show(V, "final");

console.log("\n4) Cleanup: full withdrawal then VaultDelete (recovers the 2 XRP reserve)");
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: Wallet.fromSeed(spare.seed).address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === s.shareMPTID)?.MPTAmount ?? 0); })();
await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: s.shareMPTID, value: String(sh) } }, { label: "Full withdrawal" });
await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete" });
await c.disconnect();
