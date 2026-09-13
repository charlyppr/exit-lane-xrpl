// Step 1 of "Before you write code": fund lender, borrower, broker and a
// spare account.
//
// Usage: node scripts/setup-accounts.mjs
// Writes .accounts.json (gitignored: it contains seeds).
//
// Record in bonus/notes/FEEDBACK-RAW.md: how many accounts were funded on the
// first try, the delay per account, and any silent failure (faucet answering
// 200 with an unexpected body, account not yet funded when read, etc.).

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
    throw new Error(`faucet ${r.status} for ${role}: ${await r.text()}`);
  }

  const j = await r.json();
  const acc = j.account ?? j;
  const address = acc.classicAddress ?? acc.address ?? acc.Account;
  const seed = acc.secret ?? acc.seed ?? j.seed;

  if (!address || !seed) {
    console.error(`Unexpected faucet response for ${role}:`);
    console.error(JSON.stringify(j, null, 2));
    throw new Error("unrecognized faucet response format");
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
    console.log(".accounts.json already exists.");
    console.log("Delete it first if you want to start from scratch.");
    process.exit(0);
  }

  console.log("Faucet:", NET.faucet);
  console.log("");

  const accounts = {};
  const failures = [];

  // Deliberately sequential: a rate-limited faucet misbehaves in parallel,
  // and we want to attribute each failure to a specific role.
  for (const role of ROLES) {
    try {
      const a = await fundOne(role);
      accounts[role] = a;
      console.log(`${role.padEnd(9)} ${a.address}  (${a.ms}ms)`);
    } catch (e) {
      failures.push({ role, error: e.message });
      console.error(`${role.padEnd(9)} FAILED: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (Object.keys(accounts).length) {
    writeFileSync(OUT, JSON.stringify(accounts, null, 2));
    console.log("\nWritten to .accounts.json");
    console.log("\nExplorer:");
    for (const a of Object.values(accounts)) {
      console.log(`  ${a.role.padEnd(9)} ${acctUrl(a.address)}`);
    }
  }

  if (failures.length) {
    console.log("\n--- For bonus/notes/FEEDBACK-RAW.md ---");
    console.log(`Accounts funded on the first try: ${ROLES.length - failures.length}/${ROLES.length}`);
    for (const f of failures) console.log(`  ${f.role}: ${f.error}`);
    process.exit(1);
  }

  console.log(`\n${ROLES.length}/${ROLES.length} accounts funded on the first try.`);
  console.log("→ record the count and the delays in bonus/notes/FEEDBACK-RAW.md.");
};

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
