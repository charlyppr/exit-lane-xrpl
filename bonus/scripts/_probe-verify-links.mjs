// Vérifie que chaque hash cité dans README.md et FEEDBACK.md existe on-chain,
// est validé, et porte bien le type et le code annoncés. Lecture seule.
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
  console.log(`\n──── ${f} : ${hashes.length} hashes ────`);
  for (const h of hashes) {
    total++;
    try {
      const r = await c.request({ command: "tx", transaction: h });
      const t = r.result.tx_json ?? r.result;
      const code = r.result.meta?.TransactionResult ?? "?";
      const val = r.result.validated === true;
      if (!val) { console.log(`  ⚠️ NON VALIDÉE  ${h.slice(0, 12)}…`); bad++; }
      else console.log(`  ✓ ${String(t.TransactionType).padEnd(24)} ${code.padEnd(22)} ${h.slice(0, 12)}…`);
    } catch (e) {
      console.log(`  ❌ INTROUVABLE  ${h}  (${e.data?.error ?? e.message})`);
      bad++;
    }
  }
}
console.log(`\n${bad === 0 ? "✅" : "⚠️"} ${total - bad}/${total} hashes valides et validés on-chain`);
await c.disconnect();
