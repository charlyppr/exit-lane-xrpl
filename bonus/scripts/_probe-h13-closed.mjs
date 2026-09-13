// DECISIVE TEST H13 + H14: do closed-ended vaults exist on this build?
//
// H13 says: the V1.1 doc forbids LoanBrokerSet on an open-ended vault, the
// ledger allows it (tesSUCCESS, two runs). Three explanations were still
// competing: (a) restriction not wired in, (b) conditioned on something else,
// (c) doc ahead of the build. To settle it, we need the OTHER branch:
// create a closed-ended vault (VaultKind: 1) and see what the ledger does with it.
//
// H14 says: ripple-binary-codec 2.11.0 serializes VaultKind / SubscriptionDate /
// RedemptionDate, but the TS interface of xrpl@4.6.0 does not expose them. Here
// we measure what that really costs: does validate() throw? do the fields
// survive encoding? does the ledger store them?
//
// Every failure is a result. We capture the code and the hash, and keep going.
//
// Owner of the test vaults: `spare`, so the demo state is not polluted.

import { Client, Wallet, validate } from "xrpl";
import { encode, encodeForSigning, decode } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";

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

// Manual signature: bypasses the validate() that Wallet.sign calls
// internally (xrpl/dist/npm/Wallet/index.js:133). This is exactly the
// workaround H14 predicts is necessary.
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
  log(`spare (owner of the test vaults) : ${spareW.address}`);
  log(`Ripple clock : ${nowRipple()}`);

  // ═══ H14: does the typed SDK accept the V1.1 fields? ═══════════════════
  step("H14.a - validate() of xrpl@4.6.0 on VaultKind");
  const closedTx = {
    TransactionType: "VaultCreate",
    Account: spareW.address,
    Asset: { currency: "XRP" },
    AssetsMaximum: XRP(1_000),
    WithdrawalPolicy: 1,
    VaultKind: 1,                            // closed-ended
    SubscriptionDate: nowRipple() + 600,     // window open for 10 min
    RedemptionDate: nowRipple() + 7_200,     // redemption in 2 h
  };
  try {
    validate({ ...closedTx });
    log("  validate() : PASSES, unknown fields are not rejected.");
    timeline.push({ label: "validate() VaultKind", code: "pass (no throw)", hash: null });
  } catch (e) {
    log(`  validate() : THROWS, ${e.message}`);
    timeline.push({ label: "validate() VaultKind", code: `throw: ${e.message}`, hash: null });
  }

  step("H14.b - do the fields survive binary encoding?");
  try {
    const roundTrip = decode(encode({
      ...closedTx,
      Fee: "10", Sequence: 1, SigningPubKey: spareW.publicKey,
    }));
    const kept = ["VaultKind", "SubscriptionDate", "RedemptionDate"]
      .filter((f) => roundTrip[f] !== undefined);
    log(`  fields kept : ${kept.length ? kept.join(", ") : "NONE"}`);
    log(`  VaultKind=${roundTrip.VaultKind} SubscriptionDate=${roundTrip.SubscriptionDate} RedemptionDate=${roundTrip.RedemptionDate}`);
    timeline.push({ label: "encode/decode round-trip", code: `${kept.length}/3 kept`, hash: null });
  } catch (e) {
    log(`  encode() THROWS, ${e.message}`);
    timeline.push({ label: "encode/decode round-trip", code: `throw: ${e.message}`, hash: null });
  }

  // ═══ H13: does the ledger know about closed-ended vaults? ══════════════
  step("H13.a - closed-ended VaultCreate (subscription window OPEN)");
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
    log(`  stored fields : ${Object.keys(f).join(", ")}`);
    log(`  VaultKind=${f.VaultKind} SubscriptionDate=${f.SubscriptionDate} RedemptionDate=${f.RedemptionDate} LEVersion=${f.LEVersion}`);
    const persisted = ["VaultKind", "SubscriptionDate", "RedemptionDate"].filter((k) => f[k] !== undefined);
    log(`  STORAGE VERDICT : ${persisted.length}/3 V1.1 fields persisted`);
  }

  // ═══ The test that settles (a)/(b)/(c) ═════════════════════════════════
  if (found.vaultA) {
    step("H13.b - LoanBrokerSet on the CLOSED-ended vault (V1.1 doc: allowed)");
    const brk = await submit(client, spareW, {
      TransactionType: "LoanBrokerSet",
      VaultID: found.vaultA,
      ManagementFeeRate: 2_000,
      DebtMaximum: XRP(200),
      CoverRateMinimum: 10_000,
      CoverRateLiquidation: 5_000,
    }, "LoanBrokerSet on closed");
    if (brk.ok) {
      found.brokerId = createdNode(brk.result, "LoanBroker")?.LedgerIndex ?? null;
      log(`  LoanBrokerID : ${found.brokerId}`);
    }

    step("H13.c - VaultDeposit during the subscription window (expected: OK)");
    await submit(client, Wallet.fromSeed(lender.seed), {
      TransactionType: "VaultDeposit", VaultID: found.vaultA, Amount: XRP(20),
    }, "VaultDeposit (window open)");

    step("H13.d - VaultWithdraw before RedemptionDate (V1.1 doc: must be refused)");
    await submit(client, Wallet.fromSeed(lender.seed), {
      TransactionType: "VaultWithdraw", VaultID: found.vaultA, Amount: XRP(5),
    }, "VaultWithdraw before redemption");
  }

  // ═══ Second vault: subscription window ALREADY CLOSED ═══════════════════
  step("H13.e - closed-ended VaultCreate, subscription already CLOSED");
  const vB = await submit(client, spareW, {
    ...base,
    VaultKind: 1,
    SubscriptionDate: nowRipple() - 3_600,  // closed 1 h ago
    RedemptionDate: nowRipple() + 7_200,
    Data: Buffer.from("H13 closed-ended B").toString("hex").toUpperCase(),
  }, "VaultCreate closed B (past)");

  if (vB.ok) {
    found.vaultB = createdNode(vB.result, "Vault")?.LedgerIndex ?? null;
    log(`  VaultID : ${found.vaultB}`);
    step("H13.f - VaultDeposit outside the subscription window (V1.1 doc: must be refused)");
    await submit(client, Wallet.fromSeed(lender.seed), {
      TransactionType: "VaultDeposit", VaultID: found.vaultB, Amount: XRP(20),
    }, "VaultDeposit (window closed)");
  }

  // Inconsistent dates: redemption BEFORE subscription. No ordering
  // constraint is documented; if the ledger accepts it, that is an item.
  step("H13.g - VaultCreate with RedemptionDate < SubscriptionDate");
  await submit(client, spareW, {
    ...base,
    VaultKind: 1,
    SubscriptionDate: nowRipple() + 7_200,
    RedemptionDate: nowRipple() + 600,
    Data: Buffer.from("H13 inverted dates").toString("hex").toUpperCase(),
  }, "VaultCreate inverted dates");
} catch (e) {
  log(`\n💥 ABORT : ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 900));
} finally {
  log("\n─── Summary (paste into FEEDBACK-RAW.md) ───");
  for (const t of timeline) {
    log(`  ${t.label.padEnd(30)} ${String(t.code).padEnd(22)} ${t.hash ?? ""}`);
  }
  log(`  vaultA (subscription open)    : ${found.vaultA ?? "-"}`);
  log(`  vaultB (subscription closed)  : ${found.vaultB ?? "-"}`);
  log(`  LoanBrokerID on closed        : ${found.brokerId ?? "-"}`);
  await client.disconnect();
}
