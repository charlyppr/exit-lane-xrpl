// Shape of the vault_info response on a live vault. Read-only.
import { Client } from "xrpl";
import { NET } from "../../scripts/config.mjs";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const r = await c.request({ command: "vault_info", vault_id: process.argv[2], ledger_index: "validated" });
const v = r.result.vault;
console.log("vault fields:", Object.keys(v).join(", "));
console.log("shares:", JSON.stringify(v.shares));
await c.disconnect();
