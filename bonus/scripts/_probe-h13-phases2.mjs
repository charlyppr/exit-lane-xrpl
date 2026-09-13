// H13: the three phases of a closed-ended vault, tested in all three phases.
//
// Track 1, Custom Hackathon Devnet, xrpl@4.6.0. The owner account is
// `spare` so the demo state is left untouched.
//
// The V1.1 doc (updated-transactions) promises:
//   SUBSCRIPTION phase : deposit OK, withdrawal unconstrained
//   INVESTMENT phase   : deposit -> tecEXPIRED, withdrawal -> tecTOO_SOON
//   REDEMPTION phase   : withdrawal OK
// and requires RedemptionDate - SubscriptionDate >= 180 s. We take 200 s, the
// shortest possible window, to go through the three phases in ~4 min.
//
// We key off the close_time of the validated ledger, not the local clock:
// the ledger is what arbitrates the phases.

import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";

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
    const verdict = expected ? (code === expected ? "matches doc" : `DIVERGENCE (doc: ${expected})`) : "";
    log(`  ${label.padEnd(32)} ${code.padEnd(20)} ${verdict}`);
    log(`    ${txUrl(res.result.hash)}`);
    return { code, hash: res.result.hash, result: res.result, ok: code === "tesSUCCESS" };
  } catch (e) {
    const m = String(e.message);
    log(`  ${label.padEnd(32)} rejected: ${m}`);
    return { code: m.match(/tem[A-Z_]+/)?.[0] ?? "throw", hash: null, ok: false };
  }
};

const waitUntil = async (target, what) => {
  let t = await closeTime();
  log(`\n  waiting for ${what} : close_time ${t} -> ${target} (${target - t} s)`);
  while (t <= target) {
    await new Promise((r) => setTimeout(r, 5000));
    t = await closeTime();
  }
  log(`  close_time ${t}, phase crossed.`);
};

const found = { vault: null, mpt: null };
const timeline = [];
const rec = (label, r) => { timeline.push({ label, code: r.code, hash: r.hash }); return r; };

try {
  const t0 = await closeTime();
  const SUB = t0 + 30;
  const RED = SUB + 200;   // 200 s > documented minimum of 180 s
  log(`close_time ${t0}, SubscriptionDate ${SUB} (+30 s), RedemptionDate ${RED} (+230 s)`);

  log("\n--- PHASE 1: SUBSCRIPTION");
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
  if (!v.ok) throw new Error(`VaultCreate refused (${v.code}), no phase test possible.`);

  const node = v.result.meta.AffectedNodes.find((n) => n.CreatedNode?.LedgerEntryType === "Vault")?.CreatedNode;
  found.vault = node.LedgerIndex;
  found.mpt = node.NewFields.ShareMPTID;
  log(`    VaultID ${found.vault}`);

  rec("VaultDeposit subscription", await submit(lenderW, {
    TransactionType: "VaultDeposit", VaultID: found.vault, Amount: XRP(20),
  }, "VaultDeposit (subscription)", "tesSUCCESS"));

  await waitUntil(SUB, "the end of subscription");

  log("\n--- PHASE 2: INVESTMENT (the test that matters)");
  const dep = rec("VaultDeposit investment", await submit(lenderW, {
    TransactionType: "VaultDeposit", VaultID: found.vault, Amount: XRP(10),
  }, "VaultDeposit (investment)", "tecEXPIRED"));

  const wit = rec("VaultWithdraw investment", await submit(lenderW, {
    TransactionType: "VaultWithdraw", VaultID: found.vault, Amount: XRP(5),
  }, "VaultWithdraw (investment)", "tecTOO_SOON"));

  await waitUntil(RED, "the redemption date");

  log("\n--- PHASE 3: REDEMPTION");
  const cur = (await client.request({ command: "ledger_entry", index: found.vault, ledger_index: "validated" })).result.node;
  const remaining = cur.AssetsTotal ?? "0";
  log(`  AssetsTotal remaining : ${Number(remaining) / 1e6} XRP`);
  rec("VaultWithdraw redemption", await submit(lenderW, {
    TransactionType: "VaultWithdraw", VaultID: found.vault, Amount: remaining,
  }, "VaultWithdraw (redemption)", "tesSUCCESS"));

  log("\n=== VERDICT");
  log(`  deposit in investment    : ${dep.code}  ${dep.code === "tecEXPIRED" ? "matches doc" : "DIVERGENCE"}`);
  log(`  withdrawal in investment : ${wit.code}  ${wit.code === "tecTOO_SOON" ? "matches doc" : "DIVERGENCE"}`);
  if (dep.ok || wit.ok) {
    log("\n  An operation the V1.1 doc forbids SUCCEEDED in the investment phase.");
    log("      Rule 5 of CLAUDE.md -> mentor in private BEFORE any publication.");
  } else {
    log("\n  The closed-ended phase locks are enforced on this build.");
  }
} catch (e) {
  log(`\nABORT: ${e.message}`);
} finally {
  log("\n--- Summary (FEEDBACK-RAW.md)");
  for (const t of timeline) log(`  ${t.label.padEnd(30)} ${String(t.code).padEnd(14)} ${t.hash ?? ""}`);
  log(`  VaultID : ${found.vault ?? "-"}`);
  await client.disconnect();
}
