// STEP 8 OF THE MINIMUM BAR, proof mode: chained, no pause, to capture
// hashes to paste into FEEDBACK-RAW.md.
//
// The scenario itself lives in scripts/lib/scenario.mjs, shared with demo.mjs.
// For the narrated pitch version: node scripts/demo.mjs
//
// Thesis: an open-ended vault promises withdrawal at any time, but the loans
// it funds are fixed-term. As soon as the capital is fully lent out,
// AssetsAvailable drops to zero and the depositor can no longer exit. The
// shares are then sold over the counter through an atomic swap (two crossed
// escrows sharing the same PREIMAGE-SHA-256 Condition).
//
// What is sold is the DEPOSITOR'S SHARE, never the Loan: XLS-66 offers no
// assignment of receivables. The DEX is not an option: OfferCreate on an
// MPT returns temDISABLED (XLS-82 not deployed).

import { Client } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";
import { runScenario } from "../../scripts/lib/scenario.mjs";

const log = (...a) => console.log(...a);
const ui = {
  async scene(n, t) { log(`\n${"═".repeat(70)}\n  SCENE ${n}: ${t}\n${"═".repeat(70)}`); },
  step(t) { log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`); },
  line(t) { log(t); },
  beat(t) { log(`\n  ▸▸ ${t}\n`); },
};

const client = new Client(NET.wss);
let out = null;
try {
  await client.connect();
  log(`Network   ${NET.wss}`);
  out = await runScenario(client, loadAccounts(), ui);
} catch (e) {
  log(`\n💥 ABORTED: ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 600));
} finally {
  log("\n─── Summary (to paste into FEEDBACK-RAW.md) ───");
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
