// Étape 4 du "Before you write code" du brief :
// confirmer une transaction basique et un lien explorer avant de construire
// le flux complet.
//
// Usage : node scripts/check-connection.mjs
//
// Chronomètre le "time to first transaction" et reporte-le dans bonus/notes/FEEDBACK-RAW.md.

import { Client, Wallet } from "xrpl";
import { readFileSync } from "node:fs";
import { NET } from "./config.mjs";

const t0 = Date.now();

function libVersion() {
  try {
    const p = JSON.parse(
      readFileSync(new URL("../node_modules/xrpl/package.json", import.meta.url))
    );
    return p.version;
  } catch {
    return "inconnue";
  }
}

const main = async () => {
  console.log("--- Environnement ---");
  console.log("Track      : 1 (open-ended vault, Lending Protocol V1)");
  console.log("WSS        :", NET.wss);
  console.log("Explorer   :", NET.explorer);
  console.log("xrpl       :", libVersion());
  console.log("node       :", process.version);

  // Garde-fou : la règle n°2 de CLAUDE.md.
  if (NET.wss.includes("rippletest.net")) {
    console.error("\nSTOP : cette URL est le Devnet public = Track 2.");
    console.error("Track 1 utilise lending-hackathon.dev.ripplex.io.");
    process.exit(1);
  }

  const client = new Client(NET.wss);
  await client.connect();
  console.log("\n--- Connexion OK ---");

  const info = await client.request({ command: "server_info" });
  const si = info.result.info;
  console.log("build_version   :", si.build_version);
  console.log("network_id      :", si.network_id ?? "n/a");
  console.log("server_state    :", si.server_state);
  console.log("validated_ledger:", si.validated_ledger?.seq);

  // Quels amendments sont actifs sur CE ledger ?
  // Objectif : confirmer SingleAssetVault / LendingProtocol, et surtout
  // détecter LendingProtocolV1_1 (cf. règle n°4 de CLAUDE.md) — d'où la
  // préférence pour `feature`, seule méthode qui renvoie des NOMS.
  //
  // Trois niveaux de repli, du plus lisible au plus brut :
  //   1. `feature`                      → noms + statut (souvent admin-only)
  //   2. `ledger_entry {amendments:true}` → raccourci documenté, IDs seuls
  //   3. index calculé sha512half(0x0066) → ce que fait le raccourci
  // Si on doit descendre au niveau 3, c'est un item bonus/notes/FEEDBACK-RAW.md
  // catégorie `documentation/tutorials` : il n'existe aucun moyen simple
  // de répondre à « quelle version du protocole tourne ici ? ».
  const AMENDMENTS_INDEX =
    "7DB0788C020F02780A673DC74757F23823FA3014C1866E72CC4CD8B226CD6EF4";

  let amendmentIds = null;
  try {
    const f = await client.request({ command: "feature" });
    const feats = f.result.features ?? {};
    const enabled = Object.entries(feats)
      .filter(([, v]) => v.enabled)
      .map(([, v]) => v.name);
    console.log("\namendments actifs :", enabled.length, "(via `feature`)");
    for (const n of enabled.filter((n) => /lending|vault|loan/i.test(n))) {
      console.log("  →", n);
    }
    if (enabled.some((n) => /LendingProtocolV1_1|V1_1/i.test(n))) {
      console.log("\n⚠️  LendingProtocolV1_1 SEMBLE ACTIF sur ce ledger.");
      console.log("   Règle n°4 de CLAUDE.md : les LoanSet sur vault ouvert");
      console.log("   peuvent échouer. Ce n'est pas notre bug → voir un mentor.");
    }
  } catch (e) {
    console.log("\n`feature` indisponible :", e.message);
    try {
      const a = await client.request({
        command: "ledger_entry",
        amendments: true,
        ledger_index: "validated",
      });
      amendmentIds = a.result.node?.Amendments ?? [];
      console.log("amendments actifs :", amendmentIds.length, "(via raccourci)");
    } catch (e2) {
      console.log("raccourci `amendments:true` KO :", e2.message);
      try {
        const a = await client.request({
          command: "ledger_entry",
          index: AMENDMENTS_INDEX,
          ledger_index: "validated",
        });
        amendmentIds = a.result.node?.Amendments ?? [];
        console.log("amendments actifs :", amendmentIds.length, "(via index brut)");
      } catch (e3) {
        console.log("Lecture des amendments impossible :", e3.message);
        console.log("→ candidat pour bonus/notes/FEEDBACK-RAW.md si c'est inattendu.");
      }
    }
    if (amendmentIds) {
      console.log("(IDs seuls — comparer avec xrpl.org/resources/known-amendments)");
      console.log("→ bonus/notes/FEEDBACK-RAW.md : pas de nom d'amendment sans table externe.");
    }
  }

  // Transaction basique : un Payment entre deux comptes fraîchement financés.
  console.log("\n--- Première transaction ---");
  const a = await fundOne();
  const b = await fundOne();

  // Le faucet répond 200 AVANT que le compte soit visible sur un ledger
  // validé. Appeler autofill tout de suite produit une transaction qui
  // n'est jamais appliquée et qui expire 60 s plus tard sur un message
  // trompeur (« LastLedgerSequence », alors que la cause est « le compte
  // n'existait pas encore »). Cf. bonus/notes/FEEDBACK-RAW.md entrée [13:12] — échec
  // reproduit 2 fois sur 2 sans cette attente.
  await waitVisible(client, a.address);

  const wallet = Wallet.fromSeed(a.seed);
  const prepared = await client.autofill({
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: b.address,
    Amount: "1000000", // 1 XRP en drops
  });
  const signed = wallet.sign(prepared);
  const res = await client.submitAndWait(signed.tx_blob);
  const code = res.result.meta?.TransactionResult;

  console.log("résultat :", code);
  console.log("hash     :", res.result.hash);
  console.log("explorer :", `${NET.explorer}transactions/${res.result.hash}`);

  await client.disconnect();

  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\nTime to first transaction (ce script) : ${secs}s`);
  console.log("→ noter la valeur bout-en-bout dans bonus/notes/FEEDBACK-RAW.md.");

  if (code !== "tesSUCCESS") process.exit(1);
};

/**
 * Attend que le compte soit lisible sur le ledger VALIDÉ.
 * Sans ça, autofill lit une séquence qui n'existe pas encore.
 */
async function waitVisible(client, address, tries = 20, delayMs = 2000) {
  for (let i = 1; i <= tries; i++) {
    try {
      await client.request({
        command: "account_info",
        account: address,
        ledger_index: "validated",
      });
      if (i > 1) console.log(`(compte visible après ${i} tentatives)`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    `compte ${address} toujours invisible après ${(tries * delayMs) / 1000}s`
  );
}

async function fundOne() {
  const r = await fetch(NET.faucet, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!r.ok) throw new Error(`faucet ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const acc = j.account ?? j;
  const seed = acc.secret ?? acc.seed ?? j.seed;
  const address = acc.classicAddress ?? acc.address ?? acc.Account;
  if (!seed || !address) {
    console.error("Réponse faucet inattendue :", JSON.stringify(j, null, 2));
    throw new Error("format de réponse faucet non reconnu");
  }
  return { address, seed };
}

main().catch((e) => {
  console.error("\nÉCHEC :", e.message);
  console.error("→ entrée bonus/notes/FEEDBACK-RAW.md, phase onboarding.");
  process.exit(1);
});
