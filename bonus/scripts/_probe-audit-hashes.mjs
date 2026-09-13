// Audit de vérité des livrables : pour chaque identifiant 64-hex cité dans les
// fichiers passés en argument, décide s'il s'agit d'une transaction ou d'un
// objet de ledger, puis vérifie son existence. Lecture seule.
//
//   node bonus/scripts/_probe-audit-hashes.mjs FEEDBACK.md bonus/notes/FEEDBACK-RAW.md README.md
//
// Sortie : un hash cité comme transaction doit être trouvé ET validé ; un
// identifiant d'objet (VaultID / LoanBrokerID / LoanID) est légitimement
// absent du `tx` et doit être cherché via `ledger_entry`. Un objet supprimé
// est normal quand le journal documente son cycle complet.
import { Client } from "xrpl";
import { readFileSync, writeFileSync } from "node:fs";
import { NET } from "../../scripts/config.mjs";

const OUT = process.env.OUT ?? "/tmp/audit-hashes.json";
const files = process.argv.slice(2);
if (!files.length) { console.error("usage: _probe-audit-hashes.mjs <fichier.md> ..."); process.exit(1); }

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();

// Un identifiant précédé de « VaultID », « LoanID », « LoanBrokerID » ou
// « ShareMPTID » sur la même ligne est un objet, pas une transaction.
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
console.log(`${seen.size} identifiants : ${txs.length} transactions, ${objs.length} objets de ledger\n`);

const out = {};
let ok = 0, bad = 0;
console.log("──── TRANSACTIONS ────");
for (const [h, meta] of txs) {
  try {
    const r = await c.request({ command: "tx", transaction: h });
    const t = r.result.tx_json ?? r.result;
    const code = r.result.meta?.TransactionResult ?? "?";
    if (r.result.validated !== true) { console.log(`  ⚠️ NON VALIDÉE ${h.slice(0, 12)}…`); bad++; continue; }
    out[h] = { kind: "tx", sources: meta.sources, result: code, type: t.TransactionType, flags: t.Flags ?? 0, ledger: r.result.ledger_index };
    console.log(`  ✓ ${String(t.TransactionType).padEnd(24)} ${code.padEnd(22)} ${h.slice(0, 12)}…`);
    ok++;
  } catch (e) {
    out[h] = { kind: "tx", sources: meta.sources, error: e.data?.error ?? e.message };
    console.log(`  ❌ INTROUVABLE ${h} [${meta.sources.join(",")}] (${e.data?.error ?? e.message})`);
    bad++;
  }
}
let live = 0, gone = 0;
console.log("\n──── OBJETS DE LEDGER ────");
for (const [i, meta] of objs) {
  try {
    const r = await c.request({ command: "ledger_entry", index: i, ledger_index: "validated" });
    out[i] = { kind: "object", sources: meta.sources, entry: r.result.node.LedgerEntryType, state: "live" };
    console.log(`  ✓ vivant   ${String(r.result.node.LedgerEntryType).padEnd(12)} ${i.slice(0, 12)}…`);
    live++;
  } catch (e) {
    out[i] = { kind: "object", sources: meta.sources, state: "deleted", error: e.data?.error ?? e.message };
    console.log(`  ○ supprimé (cycle bouclé)          ${i.slice(0, 12)}…`);
    gone++;
  }
}
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\n${bad === 0 ? "✅" : "⚠️"} transactions : ${ok}/${ok + bad} trouvées et validées`);
console.log(`   objets       : ${live} vivants, ${gone} supprimés (attendu quand le journal documente la suppression)`);
console.log(`   dump : ${OUT}`);
await c.disconnect();
