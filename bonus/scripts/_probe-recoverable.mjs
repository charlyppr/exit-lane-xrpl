// Combien de capital est récupérable dans les 13 vaults résiduels, et par qui ?
// Lecture seule. Sert le budget de la démo, pas la chasse aux bugs.
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";
import { fmt } from "../../scripts/lib/nav.mjs";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const a = loadAccounts();
const addrs = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.address]));
const holdings = {};
for (const [k, addr] of Object.entries(addrs)) {
  const r = await c.request({ command: "account_objects", account: addr, type: "mptoken", ledger_index: "validated" });
  for (const o of r.result.account_objects) {
    holdings[o.MPTokenIssuanceID] ??= {};
    holdings[o.MPTokenIssuanceID][k] = BigInt(o.MPTAmount ?? 0);
  }
}
const objs = await c.request({ command: "account_objects", account: addrs.broker, ledger_index: "validated" });
const vaults = objs.result.account_objects.filter((o) => o.LedgerEntryType === "Vault");
const rec = {};
console.log("VAULT           total        dispo        perte    | porteurs de parts → récupérable maintenant");
for (const v of vaults) {
  const total = BigInt(v.AssetsTotal ?? 0), avail = BigInt(v.AssetsAvailable ?? 0), loss = BigInt(v.LossUnrealized ?? 0);
  const iss = (await c.request({ command: "ledger_entry", mpt_issuance: v.ShareMPTID, ledger_index: "validated" })).result.node;
  const out = BigInt(iss.OutstandingAmount ?? 0);
  const h = holdings[v.ShareMPTID] ?? {};
  const parts = [];
  for (const [who, sh] of Object.entries(h)) {
    if (sh === 0n) continue;
    const valeur = out === 0n ? 0n : (sh * (total - loss)) / out;
    const sortie = valeur < avail ? valeur : avail;
    rec[who] = (rec[who] ?? 0n) + sortie;
    parts.push(`${who} ${sh} parts = ${fmt(valeur)} → sortie ${fmt(sortie)}`);
  }
  console.log(`${v.index.slice(0, 10)}… ${fmt(total).padStart(14)} ${fmt(avail).padStart(14)} ${fmt(loss).padStart(12)} | ${parts.join(" · ") || "aucun de nos comptes"}`);
}
console.log("\n════ RÉCUPÉRABLE IMMÉDIATEMENT, par compte ════");
for (const [who, x] of Object.entries(rec)) console.log(`   ${who.padEnd(9)} ${fmt(x)}`);
console.log("\n(« sortie » = min(valeur de la position, AssetsAvailable du vault) : ce qu'un");
console.log(" VaultWithdraw rendrait maintenant, prêts en cours non remboursés compris.)");
await c.disconnect();
