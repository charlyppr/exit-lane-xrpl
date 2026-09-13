// Devnet amendments: the ones that touch lending, vaults and MPT. Read-only.
import { Client } from "xrpl";
import { NET } from "../../scripts/config.mjs";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const r = await c.request({ command: "feature" });
const all = Object.values(r.result.features ?? {}).map((f) => ({ name: f.name, enabled: f.enabled }));
for (const f of all.filter((f) => /Lend|Vault|MPT|Escrow|Batch|fixCleanup|Permission|Credential|DEX|AMM/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name)))
  console.log(`${f.name.padEnd(28)} ${f.enabled}`);
console.log(`total enabled: ${all.filter((f) => f.enabled).length} / ${all.length}`);
await c.disconnect();
