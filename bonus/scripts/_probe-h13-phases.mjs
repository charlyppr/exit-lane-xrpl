// CORRECTION DE MON PROPRE TEST — les retraits de _probe-h13-closed.mjs ont eu
// lieu AVANT SubscriptionDate, donc en phase de souscription. La doc V1.1
// n'interdit le retrait qu'en phase d'INVESTISSEMENT (`tecTOO_SOON`) et le
// dépôt en investissement ou rachat (`tecEXPIRED`). Le vault A a franchi sa
// SubscriptionDate depuis : on reteste dans la bonne phase.
//
// Attendu par la doc, sur un vault closed-ended en phase d'investissement :
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
    log(`  ${label.padEnd(34)} ${code.padEnd(20)} attendu ${expected} ${code === expected ? "✓" : "✗ DIVERGENCE"}`);
    log(`    ${txUrl(res.result.hash)}`);
    return { code, hash: res.result.hash };
  } catch (e) {
    log(`  ${label.padEnd(34)} REJET LOCAL/tem : ${e.message}`);
    return { code: "throw", hash: null };
  }
};

const v = (await client.request({ command: "ledger_entry", index: VAULT_A, ledger_index: "validated" })).result.node;
const now = nowRipple();
const phase = now < v.SubscriptionDate ? "SOUSCRIPTION"
  : now < v.RedemptionDate ? "INVESTISSEMENT" : "RACHAT";

log(`vault A — VaultKind=${v.VaultKind}`);
log(`  SubscriptionDate ${v.SubscriptionDate} (il y a ${now - v.SubscriptionDate} s)`);
log(`  RedemptionDate   ${v.RedemptionDate} (dans ${v.RedemptionDate - now} s)`);
log(`  maintenant       ${now}`);
log(`  PHASE ACTUELLE   ${phase}\n`);

if (phase !== "INVESTISSEMENT") {
  log(`⚠️  Le vault n'est pas en phase d'investissement — test non concluant, arrêt.`);
} else {
  log("─── Ce que la doc V1.1 promet en phase d'investissement");
  const dep = await submit({ TransactionType: "VaultDeposit", VaultID: VAULT_A, Amount: XRP(10) },
    "VaultDeposit en investissement", "tecEXPIRED");
  const wit = await submit({ TransactionType: "VaultWithdraw", VaultID: VAULT_A, Amount: XRP(5) },
    "VaultWithdraw en investissement", "tecTOO_SOON");

  log("\n═══ VERDICT");
  log(`  dépôt    : ${dep.code} ${dep.code === "tecEXPIRED" ? "— conforme à la doc" : "— DIVERGENCE"}`);
  log(`  retrait  : ${wit.code} ${wit.code === "tecTOO_SOON" ? "— conforme à la doc" : "— DIVERGENCE"}`);
  if (dep.code === "tesSUCCESS" || wit.code === "tesSUCCESS") {
    log("  ⚠️  Une opération interdite par la doc a RÉUSSI en phase d'investissement.");
    log("      → règle n°5 de CLAUDE.md : mentor en privé avant toute publication.");
  }
}

await client.disconnect();
