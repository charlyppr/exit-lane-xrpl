// DECISIVE TEST: LendingProtocolV1_1 is active on this devnet (see FEEDBACK-RAW [13:05]).
// Question to settle: does a LoanSet go through on an OPEN-ENDED vault, or does V1.1
// restrict loans to closed vaults? The whole premise of Track 1 depends on it.
//
// Covers steps 1 to 3 of the minimum bar. Every failure is a result, not a bug:
// we capture the code and the hash, and keep going as far as possible.

import { Client, Wallet } from "xrpl";
import { NET, txUrl, pctToRate } from "../../scripts/config.mjs";
import { loadAccounts, submitRaw, signLoanSetCounterparty } from "../../scripts/raw-submit.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000)); // in drops

const log = (...a) => console.log(...a);
const step = (n, t) => log(`\n─── ${n}. ${t} ${"─".repeat(Math.max(0, 46 - t.length))}`);

// Finds a created node in the metadata, by ledger entry type.
function createdNode(result, entryType) {
  const nodes = result?.meta?.AffectedNodes ?? [];
  for (const n of nodes) {
    if (n.CreatedNode?.LedgerEntryType === entryType) return n.CreatedNode;
  }
  return null;
}

const found = { vaultId: null, brokerId: null, loanId: null };
const timeline = [];
const mark = (label, res) => {
  timeline.push({ label, code: res.code, hash: res.hash });
  return res;
};

const client = new Client(NET.wss);

try {
  await client.connect();
  const { lender, borrower, broker } = loadAccounts();

  log(`Network  : ${NET.wss}`);
  log(`broker   : ${broker.address}  (vault owner, a protocol constraint)`);
  log(`lender   : ${lender.address}  (depositor)`);
  log(`borrower : ${borrower.address}`);

  // ─────────────────────────────────────────────────────────────────────────
  step(1, "VaultCreate: single asset, open-ended, XRP");
  // There is NO duration/closing field in VaultCreate (xrpl 4.6.0):
  // open-ended is the default behaviour, not an option to request.
  // The vault is created by the BROKER: `tecNO_PERMISSION` confirms that only
  // the vault owner can attach a LoanBroker to it (see FEEDBACK-RAW [13:2x]).
  const vault = mark("VaultCreate", await submitRaw(client, broker.seed, {
    TransactionType: "VaultCreate",
    Asset: { currency: "XRP" },
    AssetsMaximum: XRP(10_000),
    WithdrawalPolicy: 1, // vaultStrategyFirstComeFirstServe
    Data: Buffer.from("CY-HACK track1 open-ended").toString("hex").toUpperCase(),
  }, { label: "VaultCreate" }));

  if (!vault.ok) throw new Error(`VaultCreate failed: ${vault.code}, cannot continue.`);

  const vaultNode = createdNode(vault.result, "Vault");
  found.vaultId = vaultNode?.LedgerIndex ?? null;
  log(`  VaultID : ${found.vaultId ?? "NOT FOUND in the metadata"}`);
  if (vaultNode?.NewFields) {
    const f = vaultNode.NewFields;
    log(`  fields  : ${Object.keys(f).join(", ")}`);
  }
  if (!found.vaultId) throw new Error("VaultID not found, feedback item (metadata).");

  // ─────────────────────────────────────────────────────────────────────────
  step(2, "VaultDeposit: the lender brings 300 XRP");
  const dep = mark("VaultDeposit", await submitRaw(client, lender.seed, {
    TransactionType: "VaultDeposit",
    VaultID: found.vaultId,
    Amount: XRP(300),
  }, { label: "VaultDeposit" }));
  if (!dep.ok) log(`  ⚠️  deposit refused (${dep.code}), trying the rest anyway.`);

  // ─────────────────────────────────────────────────────────────────────────
  step(3, "LoanBrokerSet: creating the broker on this vault");
  const brk = mark("LoanBrokerSet", await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerSet",
    VaultID: found.vaultId,
    ManagementFeeRate: pctToRate(2),      // 2 %
    DebtMaximum: XRP(1_000),
    CoverRateMinimum: pctToRate(10),      // first-loss cover: 10 %
    CoverRateLiquidation: pctToRate(5),
    Data: Buffer.from("CY-HACK broker").toString("hex").toUpperCase(),
  }, { label: "LoanBrokerSet" }));

  if (!brk.ok) throw new Error(`LoanBrokerSet failed: ${brk.code}`);

  const brkNode = createdNode(brk.result, "LoanBroker");
  found.brokerId = brkNode?.LedgerIndex ?? null;
  log(`  LoanBrokerID : ${found.brokerId ?? "NOT FOUND"}`);
  if (!found.brokerId) throw new Error("LoanBrokerID not found, feedback item (metadata).");

  // ─────────────────────────────────────────────────────────────────────────
  step(4, "LoanBrokerCoverDeposit: first-loss cover");
  // CoverRateMinimum at 10 %: without any cover deposited, a LoanSet should be refused.
  // We deposit enough to cover 100 XRP of principal.
  const cov = mark("LoanBrokerCoverDeposit", await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverDeposit",
    LoanBrokerID: found.brokerId,
    Amount: XRP(50),
  }, { label: "LoanBrokerCoverDeposit" }));
  if (!cov.ok) log(`  ⚠️  cover refused (${cov.code}), the next LoanSet may fail because of it.`);

  // ─────────────────────────────────────────────────────────────────────────
  step(5, "LoanSet, THE TEST: a loan on an OPEN-ENDED vault");
  const brokerWallet = Wallet.fromSeed(broker.seed);
  const borrowerWallet = Wallet.fromSeed(borrower.seed);

  const loanSet = {
    TransactionType: "LoanSet",
    Account: brokerWallet.address,
    LoanBrokerID: found.brokerId,
    Counterparty: borrowerWallet.address,
    PrincipalRequested: XRP(100),
    InterestRate: pctToRate(8),   // 8 %
    PaymentInterval: 86_400,      // 1 day
    PaymentTotal: 4,              // 4 installments
    GracePeriod: 3_600,
    LoanOriginationFee: XRP(1),
    LoanServiceFee: XRP(0.5),
    LatePaymentFee: XRP(0.25),
    ClosePaymentFee: XRP(0.25),
  };

  log("  autofill…");
  const prepared = await client.autofill(loanSet);

  log("  broker signature (first party)…");
  const signedByBroker = brokerWallet.sign(prepared);

  // ⚠️ NOT the SDK's `signLoanSetByCounterparty`: it signs the wrong payload
  // and rippled rejects it locally. See FEEDBACK-RAW [13:31].
  log("  borrower signature (in-house workaround, SDK bug [13:31])…");
  const fullyBlob = signLoanSetCounterparty(signedByBroker.tx_blob, borrower.seed);

  log("  submitting…");
  const res = await client.submitAndWait(fullyBlob);
  const code = res.result.meta?.TransactionResult ?? "?";
  const hash = res.result.hash;
  timeline.push({ label: "LoanSet", code, hash });

  log(`\n  LoanSet → ${code}`);
  log(`  ${txUrl(hash)}`);

  const loanNode = createdNode(res.result, "Loan");
  found.loanId = loanNode?.LedgerIndex ?? null;

  log("\n" + "═".repeat(64));
  if (code === "tesSUCCESS") {
    log("✅ VERDICT: LoanSet GOES THROUGH on an open-ended vault.");
    log("   LendingProtocolV1_1 being active does NOT forbid Track 1.");
    log(`   LoanID : ${found.loanId}`);
    log("   → Rule #4 of CLAUDE.md does not trigger. We build.");
  } else {
    log(`❌ VERDICT: LoanSet REFUSED, code ${code}`);
    log("   If the code points to a non-closed vault, V1.1 really does block Track 1.");
    log("   → Capture this hash and go see a mentor BEFORE continuing.");
  }
  log("═".repeat(64));
} catch (e) {
  log(`\n💥 ABORTED: ${e.message}`);
  if (e.data) log(JSON.stringify(e.data, null, 2).slice(0, 800));
} finally {
  log("\n─── Summary (to paste into FEEDBACK-RAW.md) ───");
  for (const t of timeline) log(`  ${t.label.padEnd(24)} ${String(t.code).padEnd(18)} ${t.hash ?? ""}`);
  log(`  VaultID       : ${found.vaultId ?? "-"}`);
  log(`  LoanBrokerID  : ${found.brokerId ?? "-"}`);
  log(`  LoanID        : ${found.loanId ?? "-"}`);
  await client.disconnect();
}
