// Étape 1 du "Before you write code" : financer lender, borrower, broker
// et un compte de réserve.
//
// Usage : node scripts/setup-accounts.mjs
// Écrit .accounts.json (gitignored — il contient des seeds).
//
// Relever dans bonus/notes/FEEDBACK-RAW.md : combien de comptes financés du premier coup,
// le délai par compte, et tout échec silencieux (faucet qui répond 200 avec
// un corps inattendu, compte non encore financé au moment de la lecture, etc.).

import { writeFileSync, existsSync } from "node:fs";
import { NET, acctUrl } from "./config.mjs";

const ROLES = ["lender", "borrower", "broker", "spare"];
const OUT = new URL("../.accounts.json", import.meta.url);

async function fundOne(role) {
  const t = Date.now();
  const r = await fetch(NET.faucet, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!r.ok) {
    throw new Error(`faucet ${r.status} pour ${role}: ${await r.text()}`);
  }

  const j = await r.json();
  const acc = j.account ?? j;
  const address = acc.classicAddress ?? acc.address ?? acc.Account;
  const seed = acc.secret ?? acc.seed ?? j.seed;

  if (!address || !seed) {
    console.error(`Réponse faucet inattendue pour ${role} :`);
    console.error(JSON.stringify(j, null, 2));
    throw new Error("format de réponse faucet non reconnu");
  }

  return {
    role,
    address,
    seed,
    balance: j.balance ?? acc.balance ?? null,
    ms: Date.now() - t,
  };
}

const main = async () => {
  if (existsSync(OUT)) {
    console.log(".accounts.json existe déjà.");
    console.log("Le supprimer d'abord si tu veux repartir de zéro.");
    process.exit(0);
  }

  console.log("Faucet :", NET.faucet);
  console.log("");

  const accounts = {};
  const failures = [];

  // Séquentiel volontairement : un faucet sous rate limit répond mal en
  // parallèle, et on veut pouvoir attribuer chaque échec à un rôle précis.
  for (const role of ROLES) {
    try {
      const a = await fundOne(role);
      accounts[role] = a;
      console.log(`${role.padEnd(9)} ${a.address}  (${a.ms}ms)`);
    } catch (e) {
      failures.push({ role, error: e.message });
      console.error(`${role.padEnd(9)} ÉCHEC — ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (Object.keys(accounts).length) {
    writeFileSync(OUT, JSON.stringify(accounts, null, 2));
    console.log("\nÉcrit dans .accounts.json");
    console.log("\nExplorer :");
    for (const a of Object.values(accounts)) {
      console.log(`  ${a.role.padEnd(9)} ${acctUrl(a.address)}`);
    }
  }

  if (failures.length) {
    console.log("\n--- Pour bonus/notes/FEEDBACK-RAW.md ---");
    console.log(`Comptes financés du premier coup : ${ROLES.length - failures.length}/${ROLES.length}`);
    for (const f of failures) console.log(`  ${f.role} : ${f.error}`);
    process.exit(1);
  }

  console.log(`\n${ROLES.length}/${ROLES.length} comptes financés du premier coup.`);
  console.log("→ noter le chiffre et les délais dans bonus/notes/FEEDBACK-RAW.md.");
};

main().catch((e) => {
  console.error("\nÉCHEC :", e.message);
  process.exit(1);
});
