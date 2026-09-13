// Exact (ledger) close times of the cited transactions. Read-only.
import { Client } from "xrpl";
import { NET } from "../../scripts/config.mjs";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
for (const h of process.argv.slice(2)) {
  const r = await c.request({ command: "tx", transaction: h });
  const t = r.result.tx_json ?? r.result;
  const iso = r.result.close_time_iso ?? new Date((t.date + 946684800) * 1000).toISOString();
  console.log(`${String(t.TransactionType).padEnd(24)} ${r.result.meta.TransactionResult.padEnd(20)} ledger ${r.result.ledger_index}  ${iso}  ${h.slice(0, 8)}`);
}
await c.disconnect();
