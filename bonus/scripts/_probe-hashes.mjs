// Récupère les hashes des N dernières transactions d'un compte (type, code, heure).
import { Client } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";
const [who, n] = [process.argv[2] ?? "broker", Number(process.argv[3] ?? 20)];
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const a = loadAccounts()[who];
const r = await c.request({ command: "account_tx", account: a.address, limit: n, ledger_index_max: -1, ledger_index_min: -1, binary: false });
for (const e of r.result.transactions.reverse()) {
  const t = e.tx_json ?? e.tx;
  const flags = t.Flags ? ` Flags=${t.Flags}` : "";
  const amt = typeof t.Amount === "string" ? ` Amount=${t.Amount}` : "";
  console.log(`${String(t.TransactionType).padEnd(26)} ${String(e.meta?.TransactionResult).padEnd(22)}${flags}${amt}  ${e.hash ?? t.hash}`);
}
await c.disconnect();
