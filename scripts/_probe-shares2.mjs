import xrpl from "xrpl";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { NET, txUrl } from "./config.mjs";

const accts = JSON.parse(readFileSync(new URL("../.accounts.json", import.meta.url)));
const list = Array.isArray(accts) ? accts : accts.accounts ?? Object.values(accts);
const by = (r) => list.find((a) => a.role === r);
const SHARE_MPT = "000000017636DBBC2AA4229410F36FC1FD941F7F332DE063";

const c = new xrpl.Client(NET.wss);
await c.connect();
const lender = xrpl.Wallet.fromSeed(by("lender").seed);
const buyer = xrpl.Wallet.fromSeed(by("spare").seed);

const go = async (label, tx, wallet) => {
  console.log(`\n--- ${label} ---`);
  try {
    const r = await c.submitAndWait(tx, { wallet, autofill: true });
    const code = r.result.meta?.TransactionResult;
    console.log("code:", code, "\nhash:", r.result.hash, "\n", txUrl(r.result.hash));
    return { code, hash: r.result.hash };
  } catch (e) {
    console.log("REJET:", (e.message ?? "").slice(0, 300));
    return { code: "local-reject", err: e.message };
  }
};

// TEST 2 — transfert simple de parts (lsfMPTCanTransfer)
await go("TEST 2 : Payment de 1 000 000 parts lender -> spare", {
  TransactionType: "Payment",
  Account: lender.address,
  Destination: buyer.address,
  Amount: { mpt_issuance_id: SHARE_MPT, value: "1000000" },
}, lender);

// TEST 3 — escrow conditionnel de parts (lsfMPTCanEscrow) = jambe d'un swap atomique
const preimage = randomBytes(32);
const cond = createHash("sha256").update(preimage).digest("toString" in preimage ? undefined : undefined);
const condHex = createHash("sha256").update(preimage).digest("hex").toUpperCase();
const CONDITION = `A0258020${condHex}810120`;
const now = Math.floor(Date.now() / 1000) - 946684800;
await go("TEST 3 : EscrowCreate de parts avec Condition (jambe HTLC)", {
  TransactionType: "EscrowCreate",
  Account: lender.address,
  Destination: buyer.address,
  Amount: { mpt_issuance_id: SHARE_MPT, value: "1000000" },
  Condition: CONDITION,
  CancelAfter: now + 3600,
}, lender);

console.log("\npreimage(hex):", preimage.toString("hex").toUpperCase());
await c.disconnect();
