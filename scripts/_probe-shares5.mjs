import xrpl from "xrpl";
import { readFileSync } from "node:fs";
import { NET } from "./config.mjs";
const accts = JSON.parse(readFileSync(new URL("../.accounts.json", import.meta.url)));
const list = Array.isArray(accts) ? accts : accts.accounts ?? Object.values(accts);
const by = (r) => list.find((a) => a.role === r);
const VAULT = "8F8CCB7AFDD9214483D41F87C385C4081818ED27D06F6A38A39437C7F4475F15";
const SHARE_MPT = "000000017636DBBC2AA4229410F36FC1FD941F7F332DE063";
const c = new xrpl.Client(NET.wss); await c.connect();
const lender = xrpl.Wallet.fromSeed(by("lender").seed);
const buyer  = xrpl.Wallet.fromSeed(by("spare").seed);

const vi = async (tag) => {
  const r = await c.request({ command: "vault_info", vault_id: VAULT, ledger_index: "validated" });
  const v = r.result.vault;
  console.log(`${tag} AssetsTotal=${v.AssetsTotal} AssetsAvailable=${v.AssetsAvailable ?? "ABSENT(=0)"} shares out=${v.shares.OutstandingAmount}`);
};
await vi("avant :");
const dep = await c.submitAndWait({ TransactionType:"VaultDeposit", Account:lender.address, VaultID:VAULT, Amount: xrpl.xrpToDrops("10") }, { wallet: lender, autofill:true });
console.log("VaultDeposit 10 XRP:", dep.result.meta?.TransactionResult);
await vi("après :");

console.log("\n--- TEST 6bis : VaultWithdraw par le porteur SECONDAIRE, liquidité disponible ---");
const r = await c.submitAndWait({ TransactionType:"VaultWithdraw", Account:buyer.address, VaultID:VAULT, Amount:{ mpt_issuance_id: SHARE_MPT, value:"500000" } }, { wallet: buyer, autofill:true });
console.log("code:", r.result.meta?.TransactionResult, "| hash:", r.result.hash);
const b = await c.request({ command:"account_info", account: buyer.address, ledger_index:"validated" });
console.log("XRP acheteur:", xrpl.dropsToXrp(b.result.account_data.Balance));
await c.disconnect();
