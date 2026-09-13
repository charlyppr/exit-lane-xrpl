// The use-case scenario, shared by two wrappers:
//   - bonus/scripts/step-8-secondary.mjs: proof mode, chained, to capture hashes.
//   - demo.mjs: pitch mode, with pauses and narration.
// Both run the same code, so the rehearsal matches the pitch.
//
// The `ui` object receives the events. demo.mjs implements a verbose one,
// bonus/scripts/step-8-secondary.mjs a quiet one.

import { Wallet } from "xrpl";
import { createHash, randomBytes } from "node:crypto";
import { pctToRate } from "../config.mjs";
import { submitRaw, signLoanSetCounterparty, readEntry } from "../raw-submit.mjs";
import { vaultSnapshot, sharesToDrops, shareBalance, render, fmt } from "./nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const rippleNow = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;

const createdNode = (result, type) =>
  (result?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === type)?.CreatedNode ?? null;
const seqOf = (res) => res.result?.tx_json?.Sequence ?? res.result?.Sequence;

// Amounts are small so the demo can be replayed about twenty times without
// refilling the accounts. In a fully lent open-ended vault, the shares the
// seller keeps stay locked until the loan is repaid: AssetsAvailable is zero
// and VaultWithdraw is refused. Each rehearsal therefore locks capital, plus
// 2 XRP of account reserve per vault created. With a 100 XRP deposit, six
// rehearsals drained the seller. See FEEDBACK-RAW [15:52].
export const CFG = {
  deposit: 25,           // XRP deposited by the seller, i.e. 25,000,000 shares
  cover: 5,              // XRP of first-loss capital (minimum required: 10 % of 25)
  sharesToSell: 7_500_000n,   // 30 % of her position
  discountPct: 97n,      // sale price, as a % of the value
  redeem: 2_500_000n,    // shares redeemed by the buyer at the end
};

/**
 * Plays the full scenario and returns { timeline, ids }.
 * @param {object} ui  { scene, step, line, beat, pause }
 */
export async function runScenario(client, accounts, ui, cfg = CFG) {
  const { lender, borrower, broker, spare } = accounts;
  const sellerW = Wallet.fromSeed(lender.seed);
  const buyerW = Wallet.fromSeed(spare.seed);
  const brokerW = Wallet.fromSeed(broker.seed);
  const borrowerW = Wallet.fromSeed(borrower.seed);

  const timeline = [];
  const mark = (label, r) => (timeline.push({ label, code: r.code, hash: r.hash }), r);
  const ids = { vaultId: null, brokerId: null, loanId: null, shareMPTID: null };

  ui.line(`Seller    ${sellerW.address}   depositor`);
  ui.line(`Buyer     ${buyerW.address}   never deposited`);
  ui.line(`Broker    ${brokerW.address}   = vault owner`);
  ui.line(`Borrower  ${borrowerW.address}`);

  // Scene 1
  await ui.scene(1, "An open-ended vault funds SME credit");

  ui.step("VaultCreate: no VaultKind, open-ended is the default");
  const vault = mark("VaultCreate", await submitRaw(client, broker.seed, {
    TransactionType: "VaultCreate",
    Asset: { currency: "XRP" },
    AssetsMaximum: XRP(10_000),
    WithdrawalPolicy: 1,
    Data: Buffer.from("CY-HACK PME credit fund").toString("hex").toUpperCase(),
  }, { label: "VaultCreate" }));
  if (!vault.ok) throw new Error(`VaultCreate: ${vault.code}`);
  ids.vaultId = createdNode(vault.result, "Vault")?.LedgerIndex;

  ui.step(`VaultDeposit: the treasurer places ${cfg.deposit} XRP`);
  if (!mark("VaultDeposit", await submitRaw(client, lender.seed, {
    TransactionType: "VaultDeposit", VaultID: ids.vaultId, Amount: XRP(cfg.deposit),
  }, { label: "VaultDeposit" })).ok) throw new Error("deposit refused");

  ui.step("LoanBrokerSet: the credit intermediary, then its first-loss capital");
  const brk = mark("LoanBrokerSet", await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerSet", VaultID: ids.vaultId,
    ManagementFeeRate: pctToRate(2), DebtMaximum: XRP(1_000),
    CoverRateMinimum: pctToRate(10), CoverRateLiquidation: pctToRate(5),
    Data: Buffer.from("CY-HACK broker").toString("hex").toUpperCase(),
  }, { label: "LoanBrokerSet" }));
  if (!brk.ok) throw new Error(`LoanBrokerSet: ${brk.code}`);
  ids.brokerId = createdNode(brk.result, "LoanBroker")?.LedgerIndex;

  mark("CoverDeposit", await submitRaw(client, broker.seed, {
    TransactionType: "LoanBrokerCoverDeposit", LoanBrokerID: ids.brokerId, Amount: XRP(cfg.cover),
  }, { label: "LoanBrokerCoverDeposit" }));

  ui.step("LoanSet: the broker lends ALL the available liquidity");
  let snap = await vaultSnapshot(client, ids.vaultId);
  for (const frac of [100n, 95n, 90n]) {
    const principal = (snap.assetsAvailable * frac) / 100n;
    ui.line(`  attempt at ${frac} % of the liquidity: ${fmt(principal)}`);
    const prepared = await client.autofill({
      TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: ids.brokerId,
      Counterparty: borrowerW.address, PrincipalRequested: String(principal),
      // 4 monthly installments lock the capital for about 4 months, which
      // justifies the discount. With 4 daily installments, waiting cost 0.055
      // XRP per 100 against 3 XRP for the sale: selling was 55x more expensive
      // than waiting.
      InterestRate: pctToRate(8), PaymentInterval: 2_592_000, PaymentTotal: 4,
      GracePeriod: 86_400, LoanOriginationFee: XRP(0.25), LoanServiceFee: XRP(0.125),
      LatePaymentFee: XRP(0.0625), ClosePaymentFee: XRP(0.0625),
    });
    // Home-made helper: the SDK's signLoanSetByCounterparty signs the wrong
    // payload and rippled rejects it locally. See FEEDBACK-RAW [13:31].
    const blob = signLoanSetCounterparty(brokerW.sign(prepared).tx_blob, borrower.seed);
    const res = await client.submitAndWait(blob);
    const code = res.result.meta?.TransactionResult;
    timeline.push({ label: `LoanSet ${frac}%`, code, hash: res.result.hash });
    ui.tx?.("LoanSet", code, res.result.hash);
    if (code === "tesSUCCESS") { ids.loanId = createdNode(res.result, "Loan")?.LedgerIndex; break; }
  }
  if (!ids.loanId) throw new Error("no LoanSet went through");

  snap = await vaultSnapshot(client, ids.vaultId);
  ids.shareMPTID = snap.shareMPTID;
  ui.line("\n" + render(snap));
  ui.beat("A single loan absorbed 100 % of the vault, with no warning.");

  // Scene 2
  await ui.scene(2, "The wall: the vault is open on paper, closed in practice");

  const sellerShares = await shareBalance(client, sellerW.address, snap.shareMPTID);
  ui.line(`  She holds ${sellerShares} shares, worth ${fmt(sharesToDrops(snap, sellerShares))}`);
  ui.line(`  The vault can only give back ${fmt(snap.assetsAvailable)}.`);

  ui.step("VaultWithdraw: the depositor tries to get her money back");
  const wall = mark("VaultWithdraw (refused)", await submitRaw(client, lender.seed, {
    TransactionType: "VaultWithdraw", VaultID: ids.vaultId,
    Amount: { mpt_issuance_id: snap.shareMPTID, value: String(cfg.sharesToSell) },
  }, { label: "VaultWithdraw (the wall)" }));
  ui.beat(wall.code === "tesSUCCESS"
    ? "Unexpected: the withdrawal went through, liquidity was not zero. Replay the scene."
    : `${wall.code}: she cannot exit before the loans mature.`);

  // Scene 3
  await ui.scene(3, "The sale: atomic swap, no trusted third party");

  const value = sharesToDrops(snap, cfg.sharesToSell);
  const price = (value * cfg.discountPct) / 100n;
  ui.line(`  ${cfg.sharesToSell} shares are worth ${fmt(value)} at the vault's price.`);
  ui.line(`  Sold at ${cfg.discountPct} %, for ${fmt(price)}.`);
  ui.line(`  The discount is the price of exiting 4 months early.`);

  ui.step("MPTokenAuthorize: the buyer declares they accept these shares");
  // Without this opt-in, any Payment of shares fails with tecNO_AUTH, a cause
  // missing from the five failure scenarios listed in the docs.
  mark("MPTokenAuthorize", await submitRaw(client, spare.seed, {
    TransactionType: "MPTokenAuthorize", MPTokenIssuanceID: snap.shareMPTID,
  }, { label: "MPTokenAuthorize (buyer)" }));

  const preimage = randomBytes(32);
  const digest = createHash("sha256").update(preimage).digest("hex").toUpperCase();
  const CONDITION = `A0258020${digest}810120`;
  const FULFILLMENT = `A0228020${preimage.toString("hex").toUpperCase()}`;
  ui.line(`\n  Secret drawn by the buyer, published fingerprint: ${digest.slice(0, 32)}...`);

  ui.step("EscrowCreate #1: the buyer locks their payment, expires at +2 h");
  // The buyer commits first: the seller only exposes her shares afterwards.
  const escBuyer = mark("Escrow payment", await submitRaw(client, spare.seed, {
    TransactionType: "EscrowCreate", Destination: sellerW.address,
    Amount: String(price), Condition: CONDITION, CancelAfter: rippleNow() + 7200,
  }, { label: "EscrowCreate (payment)" }));
  if (!escBuyer.ok) throw new Error(`payment escrow: ${escBuyer.code}`);

  ui.step("EscrowCreate #2: the seller locks her shares, expires at +1 h");
  // Shorter expiry on the seller's side: once the secret is revealed, she must
  // have time to collect. Swapping the durations breaks the security.
  const escSeller = mark("Escrow shares", await submitRaw(client, lender.seed, {
    TransactionType: "EscrowCreate", Destination: buyerW.address,
    Amount: { mpt_issuance_id: snap.shareMPTID, value: String(cfg.sharesToSell) },
    Condition: CONDITION, CancelAfter: rippleNow() + 3600,
  }, { label: "EscrowCreate (shares)" }));
  if (!escSeller.ok) throw new Error(`shares escrow: ${escSeller.code}`);

  ui.step("EscrowFinish #1: the buyer takes the shares and reveals the secret");
  const fin1 = mark("EscrowFinish (shares)", await submitRaw(client, spare.seed, {
    TransactionType: "EscrowFinish", Owner: sellerW.address, OfferSequence: seqOf(escSeller),
    Condition: CONDITION, Fulfillment: FULFILLMENT,
  }, { label: "EscrowFinish (shares to buyer)" }));
  if (!fin1.ok) throw new Error(`shares finish: ${fin1.code}`);

  ui.step("The secret is public: the seller reads it back from the ledger");
  // The local variable is not reused: the seller reads the Fulfillment
  // published on-chain, which is what makes the swap atomic.
  const onchain = await client.request({ command: "tx", transaction: fin1.hash });
  const readBack = onchain.result?.tx_json?.Fulfillment ?? onchain.result?.Fulfillment;
  ui.line(`  read back from ${fin1.hash.slice(0, 16)}...: ${String(readBack).slice(0, 26)}...`);
  ui.line(`  identical to the buyer's secret: ${readBack === FULFILLMENT ? "YES" : "NO"}`);

  ui.step("EscrowFinish #2: the seller collects with that read-back secret");
  const fin2 = mark("EscrowFinish (payment)", await submitRaw(client, lender.seed, {
    TransactionType: "EscrowFinish", Owner: buyerW.address, OfferSequence: seqOf(escBuyer),
    Condition: CONDITION, Fulfillment: readBack,
  }, { label: "EscrowFinish (XRP to seller)" }));
  ui.beat(fin2.ok
    ? "Swap complete, with no third party involved."
    : `Unexpected: ${fin2.code}`);

  // Scene 4
  await ui.scene(4, "Back to the vault: the new holder gets paid");

  ui.step("LoanPay: the borrower repays one installment");
  const loan = await readEntry(client, ids.loanId);
  // Amount due = ceil(PeriodicPayment) + LoanServiceFee. PeriodicPayment is
  // reported with fractional drops; ceil() alone returns tecINSUFFICIENT_PAYMENT.
  const toPay = String(Math.ceil(Number(loan.PeriodicPayment)) + Number(loan.LoanServiceFee));
  ui.line(`  PeriodicPayment ${loan.PeriodicPayment} + LoanServiceFee ${loan.LoanServiceFee}`);
  mark("LoanPay", await submitRaw(client, borrower.seed, {
    TransactionType: "LoanPay", LoanID: ids.loanId, Amount: toPay,
  }, { label: "LoanPay" }));

  snap = await vaultSnapshot(client, ids.vaultId);
  ui.line("\n" + render(snap));

  ui.step("VaultWithdraw: by the buyer, who never deposited here");
  const buyerShares = await shareBalance(client, buyerW.address, snap.shareMPTID);
  const redeem = buyerShares < cfg.redeem ? buyerShares : cfg.redeem;
  ui.line(`  They hold ${buyerShares} shares and redeem ${redeem}.`);
  const out = mark("VaultWithdraw (buyer)", await submitRaw(client, spare.seed, {
    TransactionType: "VaultWithdraw", VaultID: ids.vaultId,
    Amount: { mpt_issuance_id: snap.shareMPTID, value: String(redeem) },
  }, { label: "VaultWithdraw (secondary holder)" }));
  ui.beat(out.ok
    ? "The vault pays an account that never deposited in it: the redemption right follows the share."
    : `Unexpected: ${out.code}`);

  return { timeline, ids, snap };
}
