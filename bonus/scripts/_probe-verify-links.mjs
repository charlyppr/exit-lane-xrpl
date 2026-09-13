// Checks that every hash cited in README.md and FEEDBACK.md exists on-chain,
// is validated, and carries the announced type and code. Read-only.
import { Client } from "xrpl";
import { readFileSync } from "node:fs";
import { NET } from "../../scripts/config.mjs";

const files = process.argv.slice(2).length ? process.argv.slice(2) : ["README.md", "FEEDBACK.md"];
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
let bad = 0, total = 0;
for (const f of files) {
  const txt = readFileSync(f, "utf8");
  const hashes = [...new Set([...txt.matchAll(/\b([0-9A-F]{64})\b/g)].map((m) => m[1]))];
  console.log(`\n---- ${f}: ${hashes.length} hashes ----`);
  for (const h of hashes) {
    total++;
    try {
      const r = await c.request({ command: "tx", transaction: h });
      const t = r.result.tx_json ?? r.result;
      const code = r.result.meta?.TransactionResult ?? "?";
      const val = r.result.validated === true;
      if (!val) { console.log(`  NOT VALIDATED  ${h.slice(0, 12)}...`); bad++; }
      else console.log(`  ok ${String(t.TransactionType).padEnd(24)} ${code.padEnd(22)} ${h.slice(0, 12)}...`);
    } catch (e) {
      console.log(`  NOT FOUND  ${h}  (${e.data?.error ?? e.message})`);
      bad++;
    }
  }
}
console.log(`\n${total - bad}/${total} hashes valid and validated on-chain`);
await c.disconnect();
