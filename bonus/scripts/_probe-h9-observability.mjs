// H9: how many RPC calls, and how much math redone by hand, to answer the
// 5 questions a depositor asks? Read-only.
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";
import { fmt } from "../../scripts/lib/nav.mjs";

const V = "4E75909E40B05E55C2BD12C663147ECC5FD9CDF3AEB0DC23BA6A73FC87CADE50";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const a = loadAccounts();
let calls = 0;
const rpc = async (req) => { calls++; try { return await c.request(req); } catch (e) { return { error: e.data?.error ?? e.message }; } };
const box = (q) => console.log(`\n-------- ${q}`);

console.log(`Subject : vault ${V.slice(0, 16)}... (one of the 13 leftover vaults, with a live loan)`);
console.log(`Point of view : a depositor who holds shares and wants to know where they stand.\n`);

box("Q1. What is my position worth, net of unrealized losses?");
const vi = await rpc({ command: "vault_info", vault_id: V, ledger_index: "validated" });
const v = vi.result.vault;
console.log(`   vault_info returns : ${Object.keys(v).filter(k => k !== "shares").join(", ")}`);
console.log(`   shares : ${Object.keys(v.shares ?? {}).join(", ")}`);
const total = BigInt(v.AssetsTotal ?? 0), loss = BigInt(v.LossUnrealized ?? 0), out = BigInt(v.shares?.OutstandingAmount ?? 0);
const mine = await rpc({ command: "account_objects", account: a.lender.address, type: "mptoken", ledger_index: "validated" });
const myShares = BigInt((mine.result?.account_objects ?? []).find((o) => o.MPTokenIssuanceID === v.ShareMPTID)?.MPTAmount ?? 0);
console.log(`   no "share value" field is returned. Computation left to the caller:`);
console.log(`     gross = AssetsTotal/Outstanding        = ${out ? (Number(total) / Number(out)).toFixed(9) : "n/a"}`);
console.log(`     net   = (AssetsTotal-Loss)/Outstanding = ${out ? (Number(total - loss) / Number(out)).toFixed(9) : "n/a"}`);
console.log(`     my ${myShares} shares -> ${out ? fmt((myShares * (total - loss)) / out) : "n/a"}`);
console.log(`   cumulative RPC calls : ${calls}`);

box("Q2. Are my shares transferable?");
const iss = await rpc({ command: "ledger_entry", mpt_issuance: v.ShareMPTID, ledger_index: "validated" });
const fl = iss.result?.node?.Flags ?? 0;
console.log(`   vault_info does NOT return the issuance flags -> a second call is required`);
console.log(`   MPTokenIssuance.Flags = ${fl} -> transferable : ${(fl & 32) ? "YES" : "NO"} (bit 32, you have to know it)`);
console.log(`   cumulative RPC calls : ${calls}`);

box("Q3. How much can I withdraw right now?");
console.log(`   AssetsAvailable = ${v.AssetsAvailable ?? "ABSENT (= 0)"}`);
console.log(`   capped by min(my value, AssetsAvailable), to be computed by the caller`);

box("Q4. How many loans is my capital in, and are any of them impaired?");
console.log(`   vault_info names no broker and no loan. No "vault_loans" command.`);
const ownerObjs = await rpc({ command: "account_objects", account: v.Owner, ledger_index: "validated" });
const brokers = (ownerObjs.result?.account_objects ?? []).filter((o) => o.LedgerEntryType === "LoanBroker" && o.VaultID === V);
console.log(`   only path found : scan the ${ownerObjs.result?.account_objects?.length ?? 0} objects of the Owner account`);
console.log(`   and filter on VaultID -> ${brokers.length} broker(s) : ${brokers.map(b => b.index.slice(0, 10) + "...").join(", ")}`);
console.log(`   assumes you know Owner AND are allowed to list its objects.`);
for (const b of brokers) {
  console.log(`   broker ${b.index.slice(0, 10)}... : DebtTotal ${fmt(b.DebtTotal ?? 0)}, cover ${fmt(b.CoverAvailable ?? 0)}`);
  const pseudo = await rpc({ command: "account_objects", account: b.Account, type: "loan", ledger_index: "validated" });
  const n = pseudo.result?.account_objects?.length ?? 0;
  console.log(`   loans listed from the broker's pseudo-account : ${n === 0 ? "NONE" : n}`);
}
console.log(`   Loan objects belong to the BORROWERS. Check on our test accounts:`);
for (const who of ["borrower", "spare"]) {
  const r = await rpc({ command: "account_objects", account: a[who].address, type: "loan", ledger_index: "validated" });
  const ls = (r.result?.account_objects ?? []).filter((l) => brokers.some((b) => b.index === l.LoanBrokerID));
  console.log(`     ${who} : ${ls.length} loan(s) from this vault${ls.length ? ": " + ls.map(l => `${fmt(l.PrincipalOutstanding ?? 0)} Flags ${l.Flags}`).join(", ") : ""}`);
}
console.log(`   a depositor who does not know the borrowers CANNOT enumerate the loans.`);
console.log(`   cumulative RPC calls : ${calls}`);

box("Q5. Who are the other depositors?");
const h = await rpc({ command: "mpt_holders", mpt_issuance_id: v.ShareMPTID, ledger_index: "validated" });
console.log(`   mpt_holders -> ${h.error ?? "OK"}`);
console.log(`   no enumeration of share holders on this rippled. Question left unanswered.`);

console.log(`\n==== H9 SUMMARY ====`);
console.log(`   RPC calls for a depositor dashboard : ${calls}`);
console.log(`   quantities to recompute by hand : gross share value, NET share value,`);
console.log(`     value of my position, maximum withdrawal, utilization rate, debt capacity`);
console.log(`   questions left UNANSWERED : "which loans?" (without knowing the borrowers)`);
console.log(`     and "which other depositors?"`);
await c.disconnect();
