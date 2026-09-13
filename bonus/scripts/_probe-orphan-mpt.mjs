// Vault 0F8196BF… has just been deleted. Its shares (MPTID 0000000143CE19F9265FA64343508B0E6130D5792A4B2780)
// were held by spare and borrower with a zero balance. What happened to those objects?
import { Client } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";

const MPTID = "0000000143CE19F9265FA64343508B0E6130D5792A4B2780";
const VAULTID = "0F8196BF20FA6EE8EC09890F78429FD0F096A7F6FC33F44B4F39A8D7448CE1AC";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const a = loadAccounts();

for (const n of ["spare", "borrower", "broker"]) {
  const r = await c.request({ command: "account_objects", account: a[n].address, ledger_index: "validated" });
  const mpts = r.result.account_objects.filter((o) => o.LedgerEntryType === "MPToken");
  const orphan = mpts.find((o) => o.MPTokenIssuanceID === MPTID);
  const info = await c.request({ command: "account_info", account: a[n].address, ledger_index: "validated" });
  console.log(`${n.padEnd(9)} OwnerCount ${String(info.result.account_data.OwnerCount).padStart(3)} · objects ${String(r.result.account_objects.length).padStart(3)} · MPToken ${String(mpts.length).padStart(3)} · orphan from the deleted vault: ${orphan ? "YES ⚠️ " + JSON.stringify({ idx: orphan.index, amt: orphan.MPTAmount ?? 0, flags: orphan.Flags }) : "no"}`);
}

console.log("\n--- Does the share issuance still exist? ---");
for (const [cmd, arg] of [["vault_info", { vault_id: VAULTID }], ["mpt_holders", { mpt_issuance_id: MPTID }]]) {
  try {
    const r = await c.request({ command: cmd, ...arg, ledger_index: "validated" });
    console.log(`${cmd} → ${JSON.stringify(r.result).slice(0, 300)}`);
  } catch (e) { console.log(`${cmd} → ERROR ${e.message} ${JSON.stringify(e.data ?? {}).slice(0, 200)}`); }
}
console.log("\n--- ledger_entry on the MPTokenIssuance object ---");
try {
  const r = await c.request({ command: "ledger_entry", mpt_issuance: MPTID, ledger_index: "validated" });
  console.log("MPTokenIssuance STILL PRESENT:", JSON.stringify(r.result.node));
} catch (e) { console.log("MPTokenIssuance → ", e.message, JSON.stringify(e.data ?? {}).slice(0, 200)); }
await c.disconnect();
