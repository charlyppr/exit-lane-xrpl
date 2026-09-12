// H13 — les trois phases d'un vault closed-ended, testées dans les trois phases.
//
// Track 1, Custom Hackathon Devnet, xrpl@4.6.0. Le compte propriétaire est
// `spare` pour ne pas toucher l'état de la démo.
//
// La doc V1.1 (updated-transactions) promet :
//   phase SOUSCRIPTION   : dépôt OK, retrait non contraint
//   phase INVESTISSEMENT : dépôt → tecEXPIRED · retrait → tecTOO_SOON
//   phase RACHAT         : retrait OK
// et impose RedemptionDate - SubscriptionDate >= 180 s. On prend 200 s, la
// fenêtre la plus courte possible, pour traverser les trois phases en ~4 min.
//
// On se cale sur le close_time du ledger validé, pas sur l'horloge locale :
// c'est le ledger qui arbitre les phases.

import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl } from "./config.mjs";
import { loadAccounts } from "./raw-submit.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const log = (...a) => console.log(...a);

const signRaw = (tx, w) => {
  const t = { ...tx, SigningPubKey: w.publicKey };
  t.TxnSignature = kpSign(encodeForSigning(t), w.privateKey);
  return encode(t);
};

const client = new Client(NET.wss, { connectionTimeout: 20000 });
await client.connect();
const { spare, lender } = loadAccounts();
const spareW = Wallet.fromSeed(spare.seed);
const lenderW = Wallet.fromSeed(lender.seed);

const closeTime = async () =>
  (await client.request({ command: "ledger", ledger_index: "validated" })).result.ledger.close_time;

const submit = async (wallet, tx, label, expected) => {
  try {
    const prepared = await client.autofill({ Account: wallet.address, ...tx });
    const res = await client.submitAndWait(signRaw(prepared, wallet));
    const code = res.result.meta.TransactionResult;
    const verdict = expected ? (code === expected ? "✓ conforme" : `✗ DIVERGENCE (doc: ${expected})`) : "";
    log(`  ${label.padEnd(32)} ${code.padEnd(20)} ${verdict}`);
    log(`    ${txUrl(res.result.hash)}`);
    return { code, hash: res.result.hash, result: res.result, ok: code === "tesSUCCESS" };
  } catch (e) {
    const m = String(e.message);
    log(`  ${label.padEnd(32)} rejet: ${m}`);
    return { code: m.match(/tem[A-Z_]+/)?.[0] ?? "throw", hash: null, ok: false };
  }
};

const waitUntil = async (target, what) => {
  let t = await closeTime();
  log(`\n  ⏳ attente de ${what} : close_time ${t} → ${target} (${target - t} s)`);
  while (t <= target) {
    await new Promise((r) => setTimeout(r, 5000));
    t = await closeTime();
  }
  log(`  ⏱  close_time ${t} — phase franchie.`);
};

const found = { vault: null, mpt: null };
const timeline = [];
const rec = (label, r) => { timeline.push({ label, code: r.code, hash: r.hash }); return r; };

try {
  const t0 = await closeTime();
  const SUB = t0 + 30;
  const RED = SUB + 200;   // 200 s > minimum documenté de 180 s
  log(`close_time ${t0} · SubscriptionDate ${SUB} (+30 s) · RedemptionDate ${RED} (+230 s)`);

  log("\n─── PHASE 1 · SOUSCRIPTION");
  const v = rec("VaultCreate closed C", await submit(spareW, {
    TransactionType: "VaultCreate",
    Asset: { currency: "XRP" },
    AssetsMaximum: XRP(1_000),
    WithdrawalPolicy: 1,
    VaultKind: 1,
    SubscriptionDate: SUB,
    RedemptionDate: RED,
    Data: Buffer.from("H13 phases C").toString("hex").toUpperCase(),
  }, "VaultCreate closed C", "tesSUCCESS"));
  if (!v.ok) throw new Error(`VaultCreate refusé (${v.code}) — pas de test de phases possible.`);

  const node = v.result.meta.AffectedNodes.find((n) => n.CreatedNode?.LedgerEntryType === "Vault")?.CreatedNode;
  found.vault = node.LedgerIndex;
  found.mpt = node.NewFields.ShareMPTID;
  log(`    VaultID ${found.vault}`);

  rec("VaultDeposit souscription", await submit(lenderW, {
    TransactionType: "VaultDeposit", VaultID: found.vault, Amount: XRP(20),
  }, "VaultDeposit (souscription)", "tesSUCCESS"));

  await waitUntil(SUB, "la fin de la souscription");

  log("\n─── PHASE 2 · INVESTISSEMENT (le test qui compte)");
  const dep = rec("VaultDeposit investissement", await submit(lenderW, {
    TransactionType: "VaultDeposit", VaultID: found.vault, Amount: XRP(10),
  }, "VaultDeposit (investissement)", "tecEXPIRED"));

  const wit = rec("VaultWithdraw investissement", await submit(lenderW, {
    TransactionType: "VaultWithdraw", VaultID: found.vault, Amount: XRP(5),
  }, "VaultWithdraw (investissement)", "tecTOO_SOON"));

  await waitUntil(RED, "la date de rachat");

  log("\n─── PHASE 3 · RACHAT");
  const cur = (await client.request({ command: "ledger_entry", index: found.vault, ledger_index: "validated" })).result.node;
  const reste = cur.AssetsTotal ?? "0";
  log(`  AssetsTotal restant : ${Number(reste) / 1e6} XRP`);
  rec("VaultWithdraw rachat", await submit(lenderW, {
    TransactionType: "VaultWithdraw", VaultID: found.vault, Amount: reste,
  }, "VaultWithdraw (rachat)", "tesSUCCESS"));

  log("\n═══ VERDICT");
  log(`  dépôt en investissement  : ${dep.code}  ${dep.code === "tecEXPIRED" ? "conforme" : "DIVERGENCE"}`);
  log(`  retrait en investissement: ${wit.code}  ${wit.code === "tecTOO_SOON" ? "conforme" : "DIVERGENCE"}`);
  if (dep.ok || wit.ok) {
    log("\n  ⚠️  Une opération que la doc V1.1 interdit a RÉUSSI en phase d'investissement.");
    log("      Règle n°5 de CLAUDE.md → mentor en privé AVANT toute publication.");
  } else {
    log("\n  Les verrous de phase du closed-ended sont appliqués sur ce build.");
  }
} catch (e) {
  log(`\n💥 ARRÊT : ${e.message}`);
} finally {
  log("\n─── Récapitulatif (FEEDBACK-RAW.md)");
  for (const t of timeline) log(`  ${t.label.padEnd(30)} ${String(t.code).padEnd(14)} ${t.hash ?? ""}`);
  log(`  VaultID : ${found.vault ?? "—"}`);
  await client.disconnect();
}
