import xrpl from "xrpl";
import { readFileSync } from "node:fs";
import { NET, txUrl } from "./config.mjs";

const accts = JSON.parse(readFileSync(new URL("../.accounts.json", import.meta.url)));
const list = Array.isArray(accts) ? accts : accts.accounts ?? Object.values(accts);
const by = (r) => list.find((a) => a.role === r);
const SHARE_MPT = "000000017636DBBC2AA4229410F36FC1FD941F7F332DE063";
const ESCROW_TX = "0838560261724B922E2FF98B9EC6DE0F6F6CB145A265D26980B48E395569D988";
const PREIMAGE = "98B3EA0AED15B3A083C9D47BA3FFC479AA3B443A77FE3D6F750764DE53ACDC99";

const c = new xrpl.Client(NET.wss);
await c.connect();
const lender = xrpl.Wallet.fromSeed(by("lender").seed);
const buyer = xrpl.Wallet.fromSeed(by("spare").seed);

const go = async (label, tx, wallet) => {
  console.log(`\n--- ${label} ---`);
  try {
    const r = await c.submitAndWait(tx, { wallet, autofill: true });
    console.log("code:", r.result.meta?.TransactionResult, "| hash:", r.result.hash);
    return r.result;
  } catch (e) { console.log("REJET:", (e.message ?? "").slice(0, 300)); return null; }
};

// TEST 4 — opt-in du destinataire, puis re-tenter le transfert
await go("TEST 4a : MPTokenAuthorize par l'acheteur", {
  TransactionType: "MPTokenAuthorize", Account: buyer.address, MPTokenIssuanceID: SHARE_MPT,
}, buyer);

await go("TEST 4b : Payment de parts, 2e tentative", {
  TransactionType: "Payment", Account: lender.address, Destination: buyer.address,
  Amount: { mpt_issuance_id: SHARE_MPT, value: "1000000" },
}, lender);

// TEST 5 — dénouement de l'escrow de parts
const esc = await c.request({ command: "tx", transaction: ESCROW_TX });
const seq = esc.result.tx_json?.Sequence ?? esc.result.Sequence;
console.log("\nOfferSequence de l'escrow:", seq);
await go("TEST 5 : EscrowFinish avec le preimage", {
  TransactionType: "EscrowFinish", Account: buyer.address, Owner: lender.address,
  OfferSequence: seq, Condition: `A0258020${(await import("node:crypto")).createHash("sha256").update(Buffer.from(PREIMAGE,"hex")).digest("hex").toUpperCase()}810120`,
  Fulfillment: `A0228020${PREIMAGE}`,
}, buyer);

const bal = await c.request({ command: "account_objects", account: buyer.address, type: "mptoken", ledger_index: "validated" });
console.log("\nParts détenues par l'acheteur :", bal.result.account_objects.find(o=>o.MPTokenIssuanceID===SHARE_MPT)?.MPTAmount);
await c.disconnect();
