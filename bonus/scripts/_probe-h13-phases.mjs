// CORRECTION OF MY OWN TEST: the withdrawals in _probe-h13-closed.mjs took
// place BEFORE SubscriptionDate, so during the subscription phase. The V1.1
// doc only forbids withdrawal in the INVESTMENT phase (`tecTOO_SOON`) and
// deposit in the investment or redemption phase (`tecEXPIRED`). Vault A has
// since passed its SubscriptionDate: we retest in the right phase.
//
// Expected by the doc, on a closed-ended vault in the investment phase:
//   VaultDeposit  → tecEXPIRED
//   VaultWithdraw → tecTOO_SOON

import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";

const VAULT_A = "B6D108A2839F33EB5AC78144C7495C685866276E2C23B0180929631ADC4BF123";
const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const nowRipple = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
const log = (...a) => console.log(...a);

const signRaw = (tx, w) => {
  const t = { ...tx, SigningPubKey: w.publicKey };
  t.TxnSignature = kpSign(encodeForSigning(t), w.privateKey);
  return encode(t);
};

const client = new Client(NET.wss, { connectionTimeout: 20000 });
await client.connect();
const { lender } = loadAccounts();
const w = Wallet.fromSeed(lender.seed);

const submit = async (tx, label, expected) => {
  try {
    const prepared = await client.autofill({ Account: w.address, ...tx });
    const res = await client.submitAndWait(signRaw(prepared, w));
    const code = res.result.meta?.TransactionResult;
    log(`  ${label.padEnd(34)} ${code.padEnd(20)} expected ${expected} ${code === expected ? "✓" : "✗ DIVERGENCE"}`);
    log(`    ${txUrl(res.result.hash)}`);
    return { code, hash: res.result.hash };
  } catch (e) {
    log(`  ${label.padEnd(34)} LOCAL/tem REJECTION : ${e.message}`);
    return { code: "throw", hash: null };
  }
};

const v = (await client.request({ command: "ledger_entry", index: VAULT_A, ledger_index: "validated" })).result.node;
const now = nowRipple();
const phase = now < v.SubscriptionDate ? "SUBSCRIPTION"
  : now < v.RedemptionDate ? "INVESTMENT" : "REDEMPTION";

log(`vault A - VaultKind=${v.VaultKind}`);
log(`  SubscriptionDate ${v.SubscriptionDate} (${now - v.SubscriptionDate} s ago)`);
log(`  RedemptionDate   ${v.RedemptionDate} (in ${v.RedemptionDate - now} s)`);
log(`  now              ${now}`);
log(`  CURRENT PHASE    ${phase}\n`);

if (phase !== "INVESTMENT") {
  log(`⚠️  The vault is not in the investment phase: test inconclusive, stopping.`);
} else {
  log("─── What the V1.1 doc promises in the investment phase");
  const dep = await submit({ TransactionType: "VaultDeposit", VaultID: VAULT_A, Amount: XRP(10) },
    "VaultDeposit in investment", "tecEXPIRED");
  const wit = await submit({ TransactionType: "VaultWithdraw", VaultID: VAULT_A, Amount: XRP(5) },
    "VaultWithdraw in investment", "tecTOO_SOON");

  log("\n═══ VERDICT");
  log(`  deposit    : ${dep.code} ${dep.code === "tecEXPIRED" ? "(matches doc)" : "(DIVERGENCE)"}`);
  log(`  withdrawal : ${wit.code} ${wit.code === "tecTOO_SOON" ? "(matches doc)" : "(DIVERGENCE)"}`);
  if (dep.code === "tesSUCCESS" || wit.code === "tesSUCCESS") {
    log("  ⚠️  An operation forbidden by the doc SUCCEEDED in the investment phase.");
    log("      → rule 5 of CLAUDE.md: mentor in private before any publication.");
  }
}

await client.disconnect();
