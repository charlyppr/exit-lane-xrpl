// Helper to submit a transaction type the stable SDK may not know about
// (VaultCreate, LoanBrokerSet, LoanSet, LoanPay...).
//
// The brief asks: "Did the SDK support the needed transaction types, or did
// you construct raw JSON?" Each use of this helper instead of a native type is
// a feedback item in the `client libraries` category (hypothesis H5).
//
// Usage:
//   import { submitRaw, submitMultiSigned, loadAccounts } from "./raw-submit.mjs";
//   const { lender } = loadAccounts();
//   await submitRaw(client, lender.seed, { TransactionType: "VaultDeposit", ... });

import { Wallet, multisign } from "xrpl";
import { encode, decode, encodeForSigningCounterparty } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { readFileSync } from "node:fs";
import { txUrl } from "./config.mjs";

export function loadAccounts() {
  try {
    return JSON.parse(readFileSync(new URL("../.accounts.json", import.meta.url)));
  } catch {
    throw new Error("Run first: node scripts/setup-accounts.mjs");
  }
}

/**
 * Autofill + sign + submit of an arbitrary transaction, typed or not.
 * Does not throw on a `tec` / `tem` failure: those failures are often the
 * expected result (step 7 of the minimum bar, hypotheses H2, H3, H10).
 */
export async function submitRaw(client, seed, tx, { label = "" } = {}) {
  const wallet = Wallet.fromSeed(seed);
  const payload = { Account: wallet.address, ...tx };

  let prepared;
  try {
    prepared = await client.autofill(payload);
  } catch (e) {
    // An autofill that breaks on an unknown type is a feedback item in itself.
    console.error(`[autofill failed] ${label || tx.TransactionType}: ${e.message}`);
    throw e;
  }

  const signed = wallet.sign(prepared);
  const res = await client.submitAndWait(signed.tx_blob);

  const code = res.result.meta?.TransactionResult ?? "?";
  const hash = res.result.hash;

  console.log(`${(label || tx.TransactionType).padEnd(28)} ${code}`);
  console.log(`  ${txUrl(hash)}`);

  return { code, hash, result: res.result, ok: code === "tesSUCCESS" };
}

/**
 * Classic XRPL multisign (requires a configured SignerList). Not used by
 * LoanSet: the borrower signs in the `CounterpartySignature` field, see
 * signLoanSetCounterparty below and hypothesis H4.
 */
export async function submitMultiSigned(client, tx, seeds, { label = "" } = {}) {
  const wallets = seeds.map((s) => Wallet.fromSeed(s));
  const prepared = await client.autofill({ ...tx }, seeds.length);

  const blobs = wallets.map((w) => w.sign(prepared, true).tx_blob);
  const combined = multisign(blobs);

  const res = await client.submitAndWait(combined);
  const code = res.result.meta?.TransactionResult ?? "?";
  const hash = res.result.hash;

  console.log(`${(label || tx.TransactionType).padEnd(28)} ${code} (multisig)`);
  console.log(`  ${txUrl(hash)}`);

  return { code, hash, result: res.result, ok: code === "tesSUCCESS" };
}

/**
 * Reads a ledger entry by its index. Useful to re-read Vault, LoanBroker and
 * Loan after each step, and to check whether the derived fields
 * (utilization, liquidity, yield) are readable or must be recomputed by
 * hand. See hypothesis H9.
 */
export async function readEntry(client, index) {
  const res = await client.request({
    command: "ledger_entry",
    index,
    ledger_index: "validated",
  });
  return res.result.node;
}

/**
 * `Counterparty` signature of a LoanSet (the borrower countersigns the loan).
 *
 * Do not use `signLoanSetByCounterparty` from xrpl@4.6.0: that helper
 * signs with `encodeForSigning` (generic STX prefix) while rippled expects
 * `encodeForSigningCounterparty`. Result: local rejection
 * "fails local checks: Counterparty: Invalid signature." Verified on 12/09,
 * see FEEDBACK-RAW [13:31]. The correct encoding is exposed by
 * ripple-binary-codec 2.11.0, which the SDK already bundles.
 *
 * @param {string} signedBlob  tx_blob of the LoanSet already signed by the broker
 * @param {string} seed        seed of the counterparty (borrower)
 * @returns {string} complete tx_blob, ready to submit
 */
export function signLoanSetCounterparty(signedBlob, seed) {
  const w = Wallet.fromSeed(seed);
  const tx = decode(signedBlob);
  if (tx.TransactionType !== "LoanSet") throw new Error("LoanSet expected.");
  const forSigning = encodeForSigningCounterparty({
    ...tx,
    CounterpartySignature: { SigningPubKey: w.publicKey },
  });
  tx.CounterpartySignature = {
    SigningPubKey: w.publicKey,
    TxnSignature: kpSign(forSigning, w.privateKey),
  };
  return encode(tx);
}
