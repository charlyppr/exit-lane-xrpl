// Budget des 4 comptes : libre = balance - réserve. Plancher dur : lender >= 150 XRP libres.
import { Client } from "xrpl";
import { NET } from "./config.mjs";
import { loadAccounts } from "./raw-submit.mjs";

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const sr = await c.request({ command: "server_info" });
const res = sr.result.info.validated_ledger;
const baseR = res.reserve_base_xrp, incR = res.reserve_inc_xrp;
console.log(`rippled ${sr.result.info.build_version} · ledger ${res.seq} · reserve base ${baseR} inc ${incR}`);

const accts = loadAccounts();
for (const [name, a] of Object.entries(accts)) {
  const r = await c.request({ command: "account_info", account: a.address, ledger_index: "validated" });
  const bal = Number(r.result.account_data.Balance) / 1e6;
  const oc = r.result.account_data.OwnerCount;
  const reserve = baseR + oc * incR;
  const free = bal - reserve;
  const flag = name === "lender" ? (free < 150 ? "  ⛔ SOUS LE PLANCHER" : "  ✅ > 150") : "";
  console.log(`${name.padEnd(9)} balance ${bal.toFixed(6).padStart(12)} · OwnerCount ${String(oc).padStart(3)} · réservé ${String(reserve).padStart(4)} · libre ${free.toFixed(6).padStart(12)}${flag}`);
}
await c.disconnect();
