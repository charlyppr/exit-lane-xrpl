// ÉTAPE 8 DU MINIMUM BAR — mode preuve : enchaîné, sans pause, pour capturer
// des hashes à coller dans FEEDBACK-RAW.md.
//
// Le scénario lui-même est dans lib/scenario.mjs, partagé avec demo.mjs.
// Pour la version narrée du pitch : node scripts/demo.mjs
//
// Thèse : un vault open-ended promet le retrait à tout moment, mais les prêts
// qu'il finance sont à terme fixe. Dès que le capital est intégralement prêté,
// AssetsAvailable tombe à zéro et le déposant ne peut plus sortir. On cède alors
// ses parts de gré à gré par échange atomique (deux escrows croisés partageant
// une même Condition PREIMAGE-SHA-256).
//
// Ce qui est cédé est la PART DU DÉPOSANT, jamais le Loan : XLS-66 n'offre
// aucune cession de créance. Le DEX n'est pas une option : OfferCreate sur un
// MPT renvoie temDISABLED (XLS-82 non déployé).

import { Client } from "xrpl";
import { NET } from "./config.mjs";
import { loadAccounts } from "./raw-submit.mjs";
import { runScenario } from "./lib/scenario.mjs";

const log = (...a) => console.log(...a);
const ui = {
  async scene(n, t) { log(`\n${"═".repeat(70)}\n  SCÈNE ${n} — ${t}\n${"═".repeat(70)}`); },
  step(t) { log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`); },
  line(t) { log(t); },
  beat(t) { log(`\n  ▸▸ ${t}\n`); },
};

const client = new Client(NET.wss);
let out = null;
try {
  await client.connect();
  log(`Réseau    ${NET.wss}`);
  out = await runScenario(client, loadAccounts(), ui);
} catch (e) {
  log(`\n💥 ARRÊT : ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 600));
} finally {
  log("\n─── Récapitulatif (à coller dans FEEDBACK-RAW.md) ───");
  for (const t of out?.timeline ?? []) {
    log(`  ${String(t.label).padEnd(26)} ${String(t.code).padEnd(22)} ${t.hash ?? ""}`);
  }
  if (out?.ids) {
    log(`  VaultID    ${out.ids.vaultId}`);
    log(`  BrokerID   ${out.ids.brokerId}`);
    log(`  LoanID     ${out.ids.loanId}`);
    log(`  ShareMPTID ${out.ids.shareMPTID}`);
  }
  await client.disconnect();
}
