// Truth audit of the deliverables: for each 64-hex identifier cited in the
// files passed as arguments, decide whether it is a transaction or a ledger
// object, then check that it exists. Read-only.
//
//   node bonus/scripts/_probe-audit-hashes.mjs FEEDBACK.md bonus/notes/FEEDBACK-RAW.md README.md
//
// Output: a hash cited as a transaction must be found AND validated; an object
// identifier (VaultID / LoanBrokerID / LoanID) is legitimately absent from
// `tx` and must be looked up via `ledger_entry`. A deleted object is normal
// when the journal documents its full lifecycle.
import { Client } from "xrpl";
import { readFileSync, writeFileSync } from "node:fs";
import { NET } from "../../scripts/config.mjs";

const OUT = process.env.OUT ?? "/tmp/audit-hashes.json";
const files = process.argv.slice(2);
if (!files.length) { console.error("usage: _probe-audit-hashes.mjs <file.md> ..."); process.exit(1); }

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();

// An identifier preceded by "VaultID", "LoanID", "LoanBrokerID" or
// "ShareMPTID" on the same line is an object, not a transaction.
const OBJ_HINT = /(VaultID|LoanID|LoanBrokerID|BrokerID|ShareMPTID|issuance)/i;
const seen = new Map();
for (const f of files) {
  for (const line of readFileSync(f, "utf8").split("\n")) {
    for (const m of line.matchAll(/\b([0-9A-F]{64})\b/g)) {
      const prev = seen.get(m[1]) ?? { sources: [], isObject: false };
      if (!prev.sources.includes(f)) prev.sources.push(f);
      if (OBJ_HINT.test(line)) prev.isObject = true;
      seen.set(m[1], prev);
    }
  }
}
const txs = [...seen].filter(([, v]) => !v.isObject);
const objs = [...seen].filter(([, v]) => v.isObject);
console.log(`${seen.size} identifiers: ${txs.length} transactions, ${objs.length} ledger objects\n`);

const out = {};
let ok = 0, bad = 0;
console.log("──── TRANSACTIONS ────");
for (const [h, meta] of txs) {
  try {
    const r = await c.request({ command: "tx", transaction: h });
    const t = r.result.tx_json ?? r.result;
    const code = r.result.meta?.TransactionResult ?? "?";
    if (r.result.validated !== true) { console.log(`  ⚠️ NOT VALIDATED ${h.slice(0, 12)}…`); bad++; continue; }
    out[h] = { kind: "tx", sources: meta.sources, result: code, type: t.TransactionType, flags: t.Flags ?? 0, ledger: r.result.ledger_index };
    console.log(`  ✓ ${String(t.TransactionType).padEnd(24)} ${code.padEnd(22)} ${h.slice(0, 12)}…`);
    ok++;
  } catch (e) {
    out[h] = { kind: "tx", sources: meta.sources, error: e.data?.error ?? e.message };
    console.log(`  ❌ NOT FOUND ${h} [${meta.sources.join(",")}] (${e.data?.error ?? e.message})`);
    bad++;
  }
}
let live = 0, gone = 0;
console.log("\n──── LEDGER OBJECTS ────");
for (const [i, meta] of objs) {
  try {
    const r = await c.request({ command: "ledger_entry", index: i, ledger_index: "validated" });
    out[i] = { kind: "object", sources: meta.sources, entry: r.result.node.LedgerEntryType, state: "live" };
    console.log(`  ✓ live     ${String(r.result.node.LedgerEntryType).padEnd(12)} ${i.slice(0, 12)}…`);
    live++;
  } catch (e) {
    out[i] = { kind: "object", sources: meta.sources, state: "deleted", error: e.data?.error ?? e.message };
    console.log(`  ○ deleted (lifecycle closed)       ${i.slice(0, 12)}…`);
    gone++;
  }
}
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\n${bad === 0 ? "✅" : "⚠️"} transactions: ${ok}/${ok + bad} found and validated`);
console.log(`   objects     : ${live} live, ${gone} deleted (expected when the journal documents the deletion)`);
console.log(`   dump: ${OUT}`);
await c.disconnect();
