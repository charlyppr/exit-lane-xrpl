// PROBE: are vault shares really a "first-class asset"?
// Observed issuance Flags = 56 = CanEscrow|CanTrade|CanTransfer.
// We test what these flags actually allow.
import xrpl from "xrpl";
import { readFileSync } from "node:fs";
import { NET } from "../../scripts/config.mjs";

const accts = JSON.parse(readFileSync(new URL("../../.accounts.json", import.meta.url)));
const list = Array.isArray(accts) ? accts : accts.accounts ?? Object.values(accts);
const by = (r) => list.find((a) => a.role === r);
const SHARE_MPT = "000000017636DBBC2AA4229410F36FC1FD941F7F332DE063";

const c = new xrpl.Client(NET.wss);
await c.connect();

for (const role of ["lender", "borrower", "broker", "spare"]) {
  const a = by(role);
  if (!a) continue;
  try {
    const r = await c.request({ command: "account_objects", account: a.address, type: "mptoken", ledger_index: "validated" });
    const held = r.result.account_objects.filter((o) => o.MPTokenIssuanceID === SHARE_MPT);
    if (held.length) console.log(`${role} ${a.address} shares=${held[0].MPTAmount}`);
  } catch (e) { console.log(`${role}: ${e.message}`); }
}

const lender = xrpl.Wallet.fromSeed(by("lender").seed);
console.log("\n--- TEST 1: OfferCreate with an MPT (CanTrade flag set) ---");
const offer = {
  TransactionType: "OfferCreate",
  Account: lender.address,
  TakerGets: { mpt_issuance_id: SHARE_MPT, value: "1000000" },
  TakerPays: xrpl.xrpToDrops("1"),
};
try {
  const res = await c.submitAndWait(offer, { wallet: lender, autofill: true });
  console.log("code:", res.result.meta?.TransactionResult, "hash:", res.result.hash);
} catch (e) {
  console.log("REJECTED:", e.message?.slice(0, 400));
  console.log("data:", JSON.stringify(e.data ?? {}).slice(0, 400));
}
await c.disconnect();
