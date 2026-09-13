// Recover the idle capital sitting in the leftover vaults, lender FIRST
// (WithdrawalPolicy 1 = first come first served, and lender carries the demo).
// Monotonic operation: a VaultWithdraw can only increase the holder's balance.
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts } from "../../scripts/raw-submit.mjs";
import { fmt } from "../../scripts/lib/nav.mjs";

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const a = loadAccounts();
const addr = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.address]));

const freeBalance = async (who) => {
  const r = await c.request({ command: "account_info", account: addr[who], ledger_index: "validated" });
  const si = await c.request({ command: "server_info" });
  const l = si.result.info.validated_ledger;
  return Number(r.result.account_data.Balance) / 1e6 - (l.reserve_base_xrp + r.result.account_data.OwnerCount * l.reserve_inc_xrp);
};
const before = { lender: await freeBalance("lender"), spare: await freeBalance("spare") };
console.log(`BEFORE  lender ${before.lender.toFixed(6)} free · spare ${before.spare.toFixed(6)} free\n`);

const objs = await c.request({ command: "account_objects", account: addr.broker, ledger_index: "validated" });
const vaults = objs.result.account_objects.filter((o) => o.LedgerEntryType === "Vault").map((o) => o.index);
const sharesOf = async (who, id) => {
  const r = await c.request({ command: "account_objects", account: addr[who], type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === id)?.MPTAmount ?? 0);
};

for (const who of ["lender", "spare"]) {            // lender first, on purpose
  console.log(`──────── ${who.toUpperCase()} ────────`);
  for (const V of vaults) {
    const vi = await c.request({ command: "vault_info", vault_id: V, ledger_index: "validated" }).catch(() => null);
    if (!vi) continue;
    const v = vi.result.vault;
    const total = BigInt(v.AssetsTotal ?? 0), avail = BigInt(v.AssetsAvailable ?? 0), loss = BigInt(v.LossUnrealized ?? 0);
    const out = BigInt(v.shares?.OutstandingAmount ?? 0);
    if (out === 0n || total === 0n || avail === 0n) continue;
    const sh = await sharesOf(who, v.ShareMPTID);
    if (sh === 0n) continue;
    const value = (sh * (total - loss)) / out;
    // If the position exceeds the liquidity, only withdraw what the vault can return.
    let take = sh;
    if (value > avail) {
      take = (avail * out) / (total - loss);
      if (take > 0n) take -= 1n;              // one-share rounding margin
    }
    if (take <= 0n) { console.log(`  ${V.slice(0, 10)}… liquidity too low, skipping`); continue; }
    const r = await submitRaw(c, a[who].seed, { TransactionType: "VaultWithdraw", VaultID: V,
      Amount: { mpt_issuance_id: v.ShareMPTID, value: String(take) } },
      { label: `${V.slice(0, 10)}… withdraw ${take}/${sh} shares (~${fmt(take * (total - loss) / out)})` }).catch((e) => ({ code: String(e.message).slice(0, 40) }));
    if (!r.ok && take < sh) {
      const r2 = await submitRaw(c, a[who].seed, { TransactionType: "VaultWithdraw", VaultID: V,
        Amount: { mpt_issuance_id: v.ShareMPTID, value: String(take / 2n) } },
        { label: `  2nd attempt at half` }).catch((e) => ({ code: "failed" }));
    }
  }
  console.log();
}
const after = { lender: await freeBalance("lender"), spare: await freeBalance("spare") };
console.log("════ SUMMARY ════");
for (const who of ["lender", "spare"])
  console.log(`  ${who.padEnd(7)} ${before[who].toFixed(6)} → ${after[who].toFixed(6)} free   (+${(after[who] - before[who]).toFixed(6)} XRP)`);
console.log(`\n  lender: ${Math.floor(after.lender / 27)} demos possible (27 XRP per demo), floor 150 ${after.lender > 150 ? "✅" : "⛔"}`);
await c.disconnect();
