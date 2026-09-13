// PITCH DEMO: 4 minutes, live on the Custom Hackathon Devnet.
//
//   node scripts/demo.mjs           pauses between scenes (Enter to advance)
//   node scripts/demo.mjs --auto    chained, no pause, to rehearse and time it
//
// The scenario lives in lib/scenario.mjs, shared with bonus/scripts/step-8-secondary.mjs:
// you cannot rehearse with one script and present the other.
//
// Safety net: if the network drops during the pitch, the hashes of previous
// runs are in bonus/notes/FEEDBACK-RAW.md and the README. Open the explorer
// and walk through the same story on already validated transactions.

import { Client } from "xrpl";
import { NET, txUrl } from "./config.mjs";
import { loadAccounts } from "./raw-submit.mjs";
import { runScenario } from "./lib/scenario.mjs";

const AUTO = process.argv.includes("--auto");
const t0 = Date.now();
const clock = () => {
  const s = Math.round((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const W = 74;
const log = (...a) => console.log(...a);
const rule = (c = "─") => log(c.repeat(W));

const waitKey = () =>
  new Promise((resolve) => {
    if (AUTO || !process.stdin.isTTY) return resolve();
    process.stdout.write("\n      … press Enter to continue ");
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdout.write("\n");
      resolve();
    });
  });

// Narration: what the presenter says while the transactions go through.
const SPOKEN_SCRIPT = {
  1: [
    "An open vault, funded by corporate treasurers.",
    "A loan broker lends that money to SMEs, at a fixed term.",
    "Watch the available liquidity at the end of the scene.",
  ],
  2: [
    "An unexpected invoice lands. The treasurer wants out.",
    "The protocol refuses: her money is gone for four installments.",
    "The vault is called open-ended. In practice, it is closed.",
  ],
  3: [
    "Vault shares are MPTs. So she can sell them.",
    "Two escrows, one cryptographic condition.",
    "To take the shares, the buyer has to publish the secret",
    "that releases the payment. Stealing from the other side is impossible.",
  ],
  4: [
    "The borrower repays, liquidity comes back.",
    "And it is the buyer, who never deposited, who gets paid.",
    "The loans themselves did not move by a single drop.",
  ],
};

const ui = {
  async scene(n, title) {
    await waitKey();
    log("");
    rule("═");
    log(`  SCENE ${n}/4: ${title}`.padEnd(W - 8) + `[${clock()}]`);
    rule("═");
    for (const l of SPOKEN_SCRIPT[n] ?? []) log(`  » ${l}`);
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
  log("  EXIT LANE: a secondary market for vault shares");
  log("  Track 1 · Lending Protocol V1 · Custom Hackathon Devnet · xrpl@4.6.0");
  rule("═");
  log(`  ${NET.wss}`);

  await client.connect();
  const { timeline, ids } = await runScenario(client, loadAccounts(), ui);

  await waitKey();
  log("");
  rule("═");
  log(`  WHAT WE JUST PROVED, IN ${timeline.length} TRANSACTIONS   [${clock()}]`);
  rule("═");
  log("  1. A single loan can absorb 100 % of an open-ended vault,");
  log("     with no warning. The depositor is locked in.");
  log("  2. Vault shares can be sold over the counter, atomically,");
  log("     because they are MPTs and TokenEscrow accepts them.");
  log("  3. The secondary holder inherits the redemption right AND the yield.");
  log("");
  log("  What the protocol refused us along the way:");
  log("     · OfferCreate on an MPT → temDISABLED, even though the protocol");
  log("       itself sets the lsfMPTCanTrade flag on the shares.");
  log("     · Payment of shares → tecNO_AUTH, a cause missing from the five");
  log("       failure scenarios documented on the vault shares page.");
  log("");
  rule("─");
  log("  Transactions of this run:");
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
  log(`  Total duration: ${clock()}`);
} catch (e) {
  log(`\n💥 STOPPED: ${e.message}`);
  log("   → safety net: walk through the same story in the explorer");
  log("     on the already validated hashes (README + bonus/notes/FEEDBACK-RAW.md).");
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 500));
} finally {
  await client.disconnect();
  process.exit(0);
}
