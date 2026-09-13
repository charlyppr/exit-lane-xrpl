// Step 4 of the brief's "Before you write code":
// confirm a basic transaction and an explorer link before building the
// full flow.
//
// Usage: node scripts/check-connection.mjs
//
// Times the "time to first transaction"; report it in bonus/notes/FEEDBACK-RAW.md.

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
    return "unknown";
  }
}

const main = async () => {
  console.log("--- Environment ---");
  console.log("Track      : 1 (open-ended vault, Lending Protocol V1)");
  console.log("WSS        :", NET.wss);
  console.log("Explorer   :", NET.explorer);
  console.log("xrpl       :", libVersion());
  console.log("node       :", process.version);

  // Guardrail: rule 2 of CLAUDE.md.
  if (NET.wss.includes("rippletest.net")) {
    console.error("\nSTOP: this URL is the public Devnet = Track 2.");
    console.error("Track 1 uses lending-hackathon.dev.ripplex.io.");
    process.exit(1);
  }

  const client = new Client(NET.wss);
  await client.connect();
  console.log("\n--- Connection OK ---");

  const info = await client.request({ command: "server_info" });
  const si = info.result.info;
  console.log("build_version   :", si.build_version);
  console.log("network_id      :", si.network_id ?? "n/a");
  console.log("server_state    :", si.server_state);
  console.log("validated_ledger:", si.validated_ledger?.seq);

  // Which amendments are enabled on THIS ledger?
  // Goal: confirm SingleAssetVault / LendingProtocol, and above all detect
  // LendingProtocolV1_1 (see rule 4 of CLAUDE.md), hence the preference for
  // `feature`, the only method that returns NAMES.
  //
  // Three fallback levels, from most readable to most raw:
  //   1. `feature`                        → names + status (often admin-only)
  //   2. `ledger_entry {amendments:true}` → documented shortcut, IDs only
  //   3. computed index sha512half(0x0066) → what the shortcut does
  // If we have to go down to level 3, that is a bonus/notes/FEEDBACK-RAW.md
  // item, category `documentation/tutorials`: there is no simple way to
  // answer "which version of the protocol runs here?".
  const AMENDMENTS_INDEX =
    "7DB0788C020F02780A673DC74757F23823FA3014C1866E72CC4CD8B226CD6EF4";

  let amendmentIds = null;
  try {
    const f = await client.request({ command: "feature" });
    const feats = f.result.features ?? {};
    const enabled = Object.entries(feats)
      .filter(([, v]) => v.enabled)
      .map(([, v]) => v.name);
    console.log("\nenabled amendments:", enabled.length, "(via `feature`)");
    for (const n of enabled.filter((n) => /lending|vault|loan/i.test(n))) {
      console.log("  →", n);
    }
    if (enabled.some((n) => /LendingProtocolV1_1|V1_1/i.test(n))) {
      console.log("\n⚠️  LendingProtocolV1_1 LOOKS ENABLED on this ledger.");
      console.log("   Rule 4 of CLAUDE.md: LoanSet on an open vault may fail.");
      console.log("   This is not our bug → talk to a mentor.");
    }
  } catch (e) {
    console.log("\n`feature` unavailable:", e.message);
    try {
      const a = await client.request({
        command: "ledger_entry",
        amendments: true,
        ledger_index: "validated",
      });
      amendmentIds = a.result.node?.Amendments ?? [];
      console.log("enabled amendments:", amendmentIds.length, "(via shortcut)");
    } catch (e2) {
      console.log("shortcut `amendments:true` failed:", e2.message);
      try {
        const a = await client.request({
          command: "ledger_entry",
          index: AMENDMENTS_INDEX,
          ledger_index: "validated",
        });
        amendmentIds = a.result.node?.Amendments ?? [];
        console.log("enabled amendments:", amendmentIds.length, "(via raw index)");
      } catch (e3) {
        console.log("Cannot read the amendments:", e3.message);
        console.log("→ candidate for bonus/notes/FEEDBACK-RAW.md if unexpected.");
      }
    }
    if (amendmentIds) {
      console.log("(IDs only; compare with xrpl.org/resources/known-amendments)");
      console.log("→ bonus/notes/FEEDBACK-RAW.md: no amendment name without an external table.");
    }
  }

  // Basic transaction: a Payment between two freshly funded accounts.
  console.log("\n--- First transaction ---");
  const a = await fundOne();
  const b = await fundOne();

  // The faucet answers 200 BEFORE the account is visible on a validated
  // ledger. Calling autofill right away produces a transaction that is never
  // applied and expires 60 s later with a misleading message
  // ("LastLedgerSequence", while the real cause is "the account did not exist
  // yet"). See bonus/notes/FEEDBACK-RAW.md entry [13:12]: failure reproduced
  // 2 times out of 2 without this wait.
  await waitVisible(client, a.address);

  const wallet = Wallet.fromSeed(a.seed);
  const prepared = await client.autofill({
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: b.address,
    Amount: "1000000", // 1 XRP in drops
  });
  const signed = wallet.sign(prepared);
  const res = await client.submitAndWait(signed.tx_blob);
  const code = res.result.meta?.TransactionResult;

  console.log("result   :", code);
  console.log("hash     :", res.result.hash);
  console.log("explorer :", `${NET.explorer}transactions/${res.result.hash}`);

  await client.disconnect();

  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\nTime to first transaction (this script): ${secs}s`);
  console.log("→ record the end-to-end value in bonus/notes/FEEDBACK-RAW.md.");

  if (code !== "tesSUCCESS") process.exit(1);
};

/**
 * Waits until the account is readable on the VALIDATED ledger.
 * Without it, autofill reads a sequence that does not exist yet.
 */
async function waitVisible(client, address, tries = 20, delayMs = 2000) {
  for (let i = 1; i <= tries; i++) {
    try {
      await client.request({
        command: "account_info",
        account: address,
        ledger_index: "validated",
      });
      if (i > 1) console.log(`(account visible after ${i} attempts)`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    `account ${address} still not visible after ${(tries * delayMs) / 1000}s`
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
    console.error("Unexpected faucet response:", JSON.stringify(j, null, 2));
    throw new Error("unrecognized faucet response format");
  }
  return { address, seed };
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  console.error("→ bonus/notes/FEEDBACK-RAW.md entry, onboarding phase.");
  process.exit(1);
});
