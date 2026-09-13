// How much capital is recoverable from the 13 leftover vaults, and by whom?
// Read-only. Serves the demo budget, not the bug hunt.
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";
import { fmt } from "../../scripts/lib/nav.mjs";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const a = loadAccounts();
const addrs = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.address]));
const holdings = {};
for (const [k, addr] of Object.entries(addrs)) {
  const r = await c.request({ command: "account_objects", account: addr, type: "mptoken", ledger_index: "validated" });
  for (const o of r.result.account_objects) {
    holdings[o.MPTokenIssuanceID] ??= {};
    holdings[o.MPTokenIssuanceID][k] = BigInt(o.MPTAmount ?? 0);
  }
}
const objs = await c.request({ command: "account_objects", account: addrs.broker, ledger_index: "validated" });
const vaults = objs.result.account_objects.filter((o) => o.LedgerEntryType === "Vault");
const rec = {};
console.log("VAULT           total    available         loss    | share holders → recoverable now");
for (const v of vaults) {
  const total = BigInt(v.AssetsTotal ?? 0), avail = BigInt(v.AssetsAvailable ?? 0), loss = BigInt(v.LossUnrealized ?? 0);
  const iss = (await c.request({ command: "ledger_entry", mpt_issuance: v.ShareMPTID, ledger_index: "validated" })).result.node;
  const out = BigInt(iss.OutstandingAmount ?? 0);
  const h = holdings[v.ShareMPTID] ?? {};
  const lines = [];
  for (const [who, sh] of Object.entries(h)) {
    if (sh === 0n) continue;
    const value = out === 0n ? 0n : (sh * (total - loss)) / out;
    const exit = value < avail ? value : avail;
    rec[who] = (rec[who] ?? 0n) + exit;
    lines.push(`${who} ${sh} shares = ${fmt(value)} → exit ${fmt(exit)}`);
  }
  console.log(`${v.index.slice(0, 10)}… ${fmt(total).padStart(14)} ${fmt(avail).padStart(14)} ${fmt(loss).padStart(12)} | ${lines.join(" · ") || "none of our accounts"}`);
}
console.log("\n════ RECOVERABLE IMMEDIATELY, per account ════");
for (const [who, x] of Object.entries(rec)) console.log(`   ${who.padEnd(9)} ${fmt(x)}`);
console.log("\n(\"exit\" = min(position value, vault AssetsAvailable): what a");
console.log(" VaultWithdraw would return right now, including outstanding unrepaid loans.)");
await c.disconnect();
