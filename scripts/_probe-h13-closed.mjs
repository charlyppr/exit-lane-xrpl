// TEST DÉCISIF H13 + H14 — les vaults closed-ended existent-ils sur ce build ?
//
// H13 dit : la doc V1.1 interdit LoanBrokerSet sur un vault open-ended, le
// ledger l'autorise (tesSUCCESS, deux runs). Trois explications restaient en
// concurrence : (a) restriction pas branchée, (b) conditionnée à autre chose,
// (c) doc en avance sur le build. Pour départager, il faut l'AUTRE branche :
// créer un vault closed-ended (VaultKind: 1) et voir ce que le ledger en fait.
//
// H14 dit : ripple-binary-codec 2.11.0 sérialise VaultKind / SubscriptionDate /
// RedemptionDate, mais l'interface TS de xrpl@4.6.0 ne les expose pas. Ici on
// mesure ce que ça coûte vraiment : validate() lève-t-il ? les champs
// survivent-ils à l'encodage ? le ledger les stocke-t-il ?
//
// Tout échec est un résultat. On capture le code et le hash, on continue.
//
// Propriétaire des vaults de test : `spare`, pour ne pas polluer l'état démo.

import { Client, Wallet, validate } from "xrpl";
import { encode, encodeForSigning, decode } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl } from "./config.mjs";
import { loadAccounts } from "./raw-submit.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const nowRipple = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;

const log = (...a) => console.log(...a);
const step = (t) => log(`\n─── ${t} ${"─".repeat(Math.max(0, 56 - t.length))}`);

const timeline = [];
const mark = (label, code, hash) => {
  timeline.push({ label, code, hash });
  log(`  → ${code}`);
  if (hash) log(`    ${txUrl(hash)}`);
};

function createdNode(result, entryType) {
  for (const n of result?.meta?.AffectedNodes ?? []) {
    if (n.CreatedNode?.LedgerEntryType === entryType) return n.CreatedNode;
  }
  return null;
}

// Signature manuelle : contourne le validate() que Wallet.sign appelle en
// interne (xrpl/dist/npm/Wallet/index.js:133). C'est exactement le
// contournement que H14 prédit nécessaire.
function signBypassingValidation(tx, wallet) {
  const t = { ...tx, SigningPubKey: wallet.publicKey };
  t.TxnSignature = kpSign(encodeForSigning(t), wallet.privateKey);
  return encode(t);
}

async function submit(client, wallet, tx, label) {
  const payload = { Account: wallet.address, ...tx };
  const prepared = await client.autofill(payload);
  const blob = signBypassingValidation(prepared, wallet);
  const res = await client.submitAndWait(blob);
  const code = res.result.meta?.TransactionResult ?? "?";
  mark(label, code, res.result.hash);
  return { code, hash: res.result.hash, result: res.result, ok: code === "tesSUCCESS" };
}

const client = new Client(NET.wss, { connectionTimeout: 20000 });
const found = { vaultA: null, vaultB: null, brokerId: null };

try {
  await client.connect();
  const { spare, lender } = loadAccounts();
  const spareW = Wallet.fromSeed(spare.seed);

  const si = await client.request({ command: "server_info" });
  log(`build ${si.result.info.build_version} · network ${si.result.info.network_id}`);
  const feat = await client.request({ command: "feature", feature: "LendingProtocolV1_1" });
  const entry = Object.values(feat.result)[0];
  log(`LendingProtocolV1_1 : enabled=${entry?.enabled} supported=${entry?.supported}`);
  log(`spare (propriétaire des vaults de test) : ${spareW.address}`);
  log(`horloge Ripple : ${nowRipple()}`);

  // ═══ H14 — le SDK typé accepte-t-il les champs V1.1 ? ══════════════════
  step("H14.a — validate() de xrpl@4.6.0 sur VaultKind");
  const closedTx = {
    TransactionType: "VaultCreate",
    Account: spareW.address,
    Asset: { currency: "XRP" },
    AssetsMaximum: XRP(1_000),
    WithdrawalPolicy: 1,
    VaultKind: 1,                            // closed-ended
    SubscriptionDate: nowRipple() + 600,     // fenêtre ouverte 10 min
    RedemptionDate: nowRipple() + 7_200,     // rachat dans 2 h
  };
  try {
    validate({ ...closedTx });
    log("  validate() : PASSE — les champs inconnus ne sont pas rejetés.");
    timeline.push({ label: "validate() VaultKind", code: "pass (no throw)", hash: null });
  } catch (e) {
    log(`  validate() : LÈVE — ${e.message}`);
    timeline.push({ label: "validate() VaultKind", code: `throw: ${e.message}`, hash: null });
  }

  step("H14.b — les champs survivent-ils à l'encodage binaire ?");
  try {
    const roundTrip = decode(encode({
      ...closedTx,
      Fee: "10", Sequence: 1, SigningPubKey: spareW.publicKey,
    }));
    const kept = ["VaultKind", "SubscriptionDate", "RedemptionDate"]
      .filter((f) => roundTrip[f] !== undefined);
    log(`  champs conservés : ${kept.length ? kept.join(", ") : "AUCUN"}`);
    log(`  VaultKind=${roundTrip.VaultKind} SubscriptionDate=${roundTrip.SubscriptionDate} RedemptionDate=${roundTrip.RedemptionDate}`);
    timeline.push({ label: "encode/decode round-trip", code: `${kept.length}/3 conservés`, hash: null });
  } catch (e) {
    log(`  encode() LÈVE — ${e.message}`);
    timeline.push({ label: "encode/decode round-trip", code: `throw: ${e.message}`, hash: null });
  }

  // ═══ H13 — le ledger connaît-il les vaults closed-ended ? ══════════════
  step("H13.a — VaultCreate closed-ended (fenêtre de souscription OUVERTE)");
  const { VaultKind, SubscriptionDate, RedemptionDate, ...base } = closedTx;
  const vA = await submit(client, spareW, {
    ...base, VaultKind, SubscriptionDate, RedemptionDate,
    Data: Buffer.from("H13 closed-ended A").toString("hex").toUpperCase(),
  }, "VaultCreate closed A");

  if (vA.ok) {
    const node = createdNode(vA.result, "Vault");
    found.vaultA = node?.LedgerIndex ?? null;
    log(`  VaultID : ${found.vaultA}`);
    const f = node?.NewFields ?? {};
    log(`  champs stockés : ${Object.keys(f).join(", ")}`);
    log(`  VaultKind=${f.VaultKind} SubscriptionDate=${f.SubscriptionDate} RedemptionDate=${f.RedemptionDate} LEVersion=${f.LEVersion}`);
    const persisted = ["VaultKind", "SubscriptionDate", "RedemptionDate"].filter((k) => f[k] !== undefined);
    log(`  VERDICT stockage : ${persisted.length}/3 champs V1.1 persistés`);
  }

  // ═══ Le test qui départage (a)/(b)/(c) ════════════════════════════════
  if (found.vaultA) {
    step("H13.b — LoanBrokerSet sur le vault CLOSED-ended (doc V1.1 : autorisé)");
    const brk = await submit(client, spareW, {
      TransactionType: "LoanBrokerSet",
      VaultID: found.vaultA,
      ManagementFeeRate: 2_000,
      DebtMaximum: XRP(200),
      CoverRateMinimum: 10_000,
      CoverRateLiquidation: 5_000,
    }, "LoanBrokerSet sur closed");
    if (brk.ok) {
      found.brokerId = createdNode(brk.result, "LoanBroker")?.LedgerIndex ?? null;
      log(`  LoanBrokerID : ${found.brokerId}`);
    }

    step("H13.c — VaultDeposit pendant la fenêtre de souscription (attendu : OK)");
    await submit(client, Wallet.fromSeed(lender.seed), {
      TransactionType: "VaultDeposit", VaultID: found.vaultA, Amount: XRP(20),
    }, "VaultDeposit (fenêtre ouverte)");

    step("H13.d — VaultWithdraw avant RedemptionDate (doc V1.1 : à refuser)");
    await submit(client, Wallet.fromSeed(lender.seed), {
      TransactionType: "VaultWithdraw", VaultID: found.vaultA, Amount: XRP(5),
    }, "VaultWithdraw avant redemption");
  }

  // ═══ Second vault : fenêtre de souscription DÉJÀ FERMÉE ═══════════════
  step("H13.e — VaultCreate closed-ended, souscription déjà CLOSE");
  const vB = await submit(client, spareW, {
    ...base,
    VaultKind: 1,
    SubscriptionDate: nowRipple() - 3_600,  // fermée il y a 1 h
    RedemptionDate: nowRipple() + 7_200,
    Data: Buffer.from("H13 closed-ended B").toString("hex").toUpperCase(),
  }, "VaultCreate closed B (passée)");

  if (vB.ok) {
    found.vaultB = createdNode(vB.result, "Vault")?.LedgerIndex ?? null;
    log(`  VaultID : ${found.vaultB}`);
    step("H13.f — VaultDeposit hors fenêtre de souscription (doc V1.1 : à refuser)");
    await submit(client, Wallet.fromSeed(lender.seed), {
      TransactionType: "VaultDeposit", VaultID: found.vaultB, Amount: XRP(20),
    }, "VaultDeposit (fenêtre close)");
  }

  // Date incohérente : redemption AVANT subscription. Aucune contrainte
  // d'ordre n'est documentée — si le ledger accepte, c'est un item.
  step("H13.g — VaultCreate avec RedemptionDate < SubscriptionDate");
  await submit(client, spareW, {
    ...base,
    VaultKind: 1,
    SubscriptionDate: nowRipple() + 7_200,
    RedemptionDate: nowRipple() + 600,
    Data: Buffer.from("H13 dates inversees").toString("hex").toUpperCase(),
  }, "VaultCreate dates inversées");
} catch (e) {
  log(`\n💥 ARRÊT : ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 900));
} finally {
  log("\n─── Récapitulatif (à coller dans FEEDBACK-RAW.md) ───");
  for (const t of timeline) {
    log(`  ${t.label.padEnd(30)} ${String(t.code).padEnd(22)} ${t.hash ?? ""}`);
  }
  log(`  vaultA (souscription ouverte) : ${found.vaultA ?? "—"}`);
  log(`  vaultB (souscription close)   : ${found.vaultB ?? "—"}`);
  log(`  LoanBrokerID sur closed       : ${found.brokerId ?? "—"}`);
  await client.disconnect();
}
