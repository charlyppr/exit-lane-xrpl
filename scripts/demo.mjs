// DÉMO DU PITCH — 4 minutes, live sur le Custom Hackathon Devnet.
//
//   node scripts/demo.mjs           pauses entre les scènes (Entrée pour avancer)
//   node scripts/demo.mjs --auto    enchaîné, sans pause — pour répéter et chronométrer
//
// Le scénario vit dans lib/scenario.mjs, partagé avec bonus/scripts/step-8-secondary.mjs :
// on ne peut pas répéter avec un script et présenter l'autre.
//
// Filet de sécurité : en cas de coupure réseau pendant le pitch, les hashes
// des runs précédents sont dans bonus/notes/FEEDBACK-RAW.md et le README. Ouvrir l'explorer
// et dérouler la même histoire sur des transactions déjà validées.

import { Client } from "xrpl";
import { NET, txUrl } from "./config.mjs";
import { loadAccounts } from "./raw-submit.mjs";
import { runScenario } from "./lib/scenario.mjs";

const AUTO = process.argv.includes("--auto");
const t0 = Date.now();
const chrono = () => {
  const s = Math.round((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const W = 74;
const log = (...a) => console.log(...a);
const rule = (c = "─") => log(c.repeat(W));

const waitKey = () =>
  new Promise((resolve) => {
    if (AUTO || !process.stdin.isTTY) return resolve();
    process.stdout.write("\n      … Entrée pour continuer ");
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdout.write("\n");
      resolve();
    });
  });

// Narration : ce que le présentateur dit pendant que les transactions passent.
const SCRIPT_ORAL = {
  1: [
    "Un vault ouvert, alimenté par des trésoriers d'entreprise.",
    "Un loan broker prête cet argent à des PME, à terme fixe.",
    "Regardez la liquidité disponible à la fin de la scène.",
  ],
  2: [
    "Une facture imprévue tombe. La trésorière veut sortir.",
    "Le protocole refuse : son argent est parti pour quatre échéances.",
    "Le vault est dit open-ended. En pratique, il est fermé.",
  ],
  3: [
    "Les parts de vault sont des MPT. Elle peut donc les céder.",
    "Deux escrows, une seule condition cryptographique.",
    "Pour prendre les parts, l'acheteur doit publier le secret",
    "qui libère le paiement. Voler l'autre est impossible.",
  ],
  4: [
    "L'emprunteur rembourse, la liquidité revient.",
    "Et c'est l'acheteur — qui n'a jamais déposé — qui est payé.",
    "Les prêts, eux, n'ont pas bougé d'un centime.",
  ],
};

const ui = {
  async scene(n, title) {
    await waitKey();
    log("");
    rule("═");
    log(`  SCÈNE ${n}/4 — ${title}`.padEnd(W - 8) + `[${chrono()}]`);
    rule("═");
    for (const l of SCRIPT_ORAL[n] ?? []) log(`  » ${l}`);
    log("");
  },
  step(t) { log(`\n── ${t} ${"─".repeat(Math.max(0, W - 5 - t.length))}`); },
  line(t) { log(t); },
  beat(t) { log(`\n  ▸▸ ${t}\n`); },
  tx(label, code, hash) { log(`${label.padEnd(28)} ${code}\n  ${txUrl(hash)}`); },
};

const client = new Client(NET.wss);

try {
  rule("═");
  log("  PORTE DE SORTIE — marché secondaire de parts de vault");
  log("  Track 1 · Lending Protocol V1 · Custom Hackathon Devnet · xrpl@4.6.0");
  rule("═");
  log(`  ${NET.wss}`);

  await client.connect();
  const { timeline, ids } = await runScenario(client, loadAccounts(), ui);

  await waitKey();
  log("");
  rule("═");
  log(`  CE QU'ON VIENT DE PROUVER, EN ${timeline.length} TRANSACTIONS   [${chrono()}]`);
  rule("═");
  log("  1. Un seul prêt peut absorber 100 % d'un vault open-ended,");
  log("     sans avertissement. Le déposant est enfermé.");
  log("  2. Les parts de vault se cèdent de gré à gré, atomiquement,");
  log("     parce que ce sont des MPT et que TokenEscrow les accepte.");
  log("  3. Le porteur secondaire hérite du droit de tirage ET du rendement.");
  log("");
  log("  Ce que le protocole nous a refusé en chemin :");
  log("     · OfferCreate sur un MPT → temDISABLED, alors que le flag");
  log("       lsfMPTCanTrade est posé sur les parts par le protocole lui-même.");
  log("     · Payment de parts → tecNO_AUTH, cause absente des cinq");
  log("       scénarios d'échec que documente la page des vault shares.");
  log("");
  rule("─");
  log("  Transactions de ce run :");
  for (const t of timeline) {
    const flag = t.code === "tesSUCCESS" ? " " : t.code?.startsWith("tec") ? "⛔" : "⚠️";
    log(`  ${flag} ${String(t.label).padEnd(26)} ${String(t.code).padEnd(22)} ${t.hash ?? ""}`);
  }
  rule("─");
  log(`  VaultID    ${ids.vaultId}`);
  log(`  BrokerID   ${ids.brokerId}`);
  log(`  LoanID     ${ids.loanId}`);
  log(`  ShareMPTID ${ids.shareMPTID}`);
  rule("═");
  log(`  Durée totale : ${chrono()}`);
} catch (e) {
  log(`\n💥 ARRÊT : ${e.message}`);
  log("   → filet de sécurité : dérouler la même histoire dans l'explorer");
  log("     sur les hashes déjà validés (README + bonus/notes/FEEDBACK-RAW.md).");
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 500));
} finally {
  await client.disconnect();
  process.exit(0);
}
