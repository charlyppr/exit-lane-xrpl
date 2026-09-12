// Helper pour soumettre un type de transaction que le SDK stable ne connaît
// peut-être pas (VaultCreate, LoanBrokerSet, LoanSet, LoanPay...).
//
// Le brief demande explicitement : "Did the SDK support the needed transaction
// types, or did you construct raw JSON?" — donc chaque fois que ce helper est
// nécessaire au lieu d'un type natif, c'est un item de feedback catégorie
// `client libraries`. Remplir le tableau de l'hypothèse H5 au fur et à mesure.
//
// Usage :
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
    throw new Error("Lance d'abord : node scripts/setup-accounts.mjs");
  }
}

/**
 * Autofill + sign + submit d'une transaction arbitraire, typée ou non.
 * Ne lève pas sur un échec `tec` / `tem` : ces échecs sont souvent le
 * résultat recherché (étape 7 du minimum bar, hypothèses H2, H3, H10).
 */
export async function submitRaw(client, seed, tx, { label = "" } = {}) {
  const wallet = Wallet.fromSeed(seed);
  const payload = { Account: wallet.address, ...tx };

  let prepared;
  try {
    prepared = await client.autofill(payload);
  } catch (e) {
    // Un autofill qui casse sur un type inconnu est en soi un item de feedback.
    console.error(`[autofill KO] ${label || tx.TransactionType} : ${e.message}`);
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
 * LoanSet exige la signature du broker ET de l'emprunteur (cf. hypothèse H4).
 * Deux approches possibles selon ce que le protocole accepte :
 *   - multisign XRPL classique (nécessite une SignerList configurée)
 *   - un champ de signature dédié dans le corps de LoanSet
 * Tester les deux, chronométrer, et consigner ce qui a marché.
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
 * Lit une entrée de ledger par son index. Utile pour relire Vault,
 * LoanBroker et Loan après chaque étape, et vérifier si les champs dérivés
 * (utilisation, liquidité, rendement) sont lisibles ou doivent être
 * recalculés à la main — cf. hypothèse H9.
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
 * Signature `Counterparty` d'un LoanSet (l'emprunteur contresigne le prêt).
 *
 * ⚠️ NE PAS utiliser `signLoanSetByCounterparty` de xrpl@4.6.0 : ce helper
 * signe avec `encodeForSigning` (préfixe générique STX) alors que rippled
 * attend `encodeForSigningCounterparty`. Résultat : rejet local
 * « fails local checks: Counterparty: Invalid signature. » Vérifié le 12/09,
 * cf. FEEDBACK-RAW [13:31]. Le bon encodage est exposé par
 * ripple-binary-codec 2.11.0, que le SDK embarque déjà.
 *
 * @param {string} signedBlob  tx_blob du LoanSet DÉJÀ signé par le broker
 * @param {string} seed        seed de la counterparty (emprunteur)
 * @returns {string} tx_blob complet, prêt à soumettre
 */
export function signLoanSetCounterparty(signedBlob, seed) {
  const w = Wallet.fromSeed(seed);
  const tx = decode(signedBlob);
  if (tx.TransactionType !== "LoanSet") throw new Error("LoanSet attendu.");
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
