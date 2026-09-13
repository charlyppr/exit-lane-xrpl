// Truth audit of the numeric claims in FEEDBACK.md: re-reads on the ledger the
// nodes behind each statement and recomputes the formulas. Read-only.
import { Client } from "xrpl";
import { NET } from "../../scripts/config.mjs";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const idx = async (i) => (await c.request({ command: "ledger_entry", index: i, ledger_index: "validated" })).result.node;
const nodesOf = async (h) => {
  const r = await c.request({ command: "tx", transaction: h });
  const out = [];
  for (const n of r.result.meta.AffectedNodes) {
    const k = n.ModifiedNode ?? n.CreatedNode ?? n.DeletedNode;
    if (k && ["Vault", "Loan", "LoanBroker"].includes(k.LedgerEntryType))
      out.push({ type: k.LedgerEntryType, index: k.LedgerIndex, final: k.FinalFields ?? k.NewFields, prev: k.PreviousFields });
  }
  return out;
};

console.log("### FINDING 2: share price / LossUnrealized (impair C8678C1C)");
for (const n of await nodesOf("C8678C1C0A10BE889124F40C03017038654B278E2D464FAC54784F55B35318FC")) {
  if (n.type !== "Vault") continue;
  console.log("   Vault at the time of the impair:", JSON.stringify(n.final));
  const v = await idx(n.index).catch(() => null);
  if (v) console.log("   Vault today:", JSON.stringify({ AssetsTotal: v.AssetsTotal, LossUnrealized: v.LossUnrealized, ShareMPTID: v.ShareMPTID }));
  const id = (v ?? n.final).ShareMPTID;
  try {
    const r = await c.request({ command: "ledger_entry", mpt_issuance: id, ledger_index: "validated" });
    console.log("   ShareMPT OutstandingAmount:", r.result.node.OutstandingAmount);
  } catch (e) { console.log("   mpt_issuance:", e.data?.error ?? e.message); }
  const at = BigInt(n.final.AssetsTotal), lu = BigInt(n.final.LossUnrealized ?? 0);
  console.log(`   AssetsTotal ${at}, LossUnrealized ${lu}, net ${at - lu}, ratio net/gross = ${Number(at - lu) / Number(at)}`);
}

console.log("\n### FINDING 3: broker parameters of the two defaults");
for (const [tag, h] of [["A (vault 200 XRP)", "91F458E3E6244E1C3005345C5C83CDFAF0E8A1AF6E5587E100C302CA56743BC7"], ["B (vault 5 XRP)", "923F7D616B094C82197506CF2867907A93067041E3990D24BD07A19035F73EAC"]]) {
  const ns = await nodesOf(h);
  const br = ns.find((n) => n.type === "LoanBroker"), ln = ns.find((n) => n.type === "Loan");
  console.log(` ${tag}`);
  if (!br) { console.log("   no LoanBroker"); continue; }
  const b = (await idx(br.index).catch(() => null)) ?? br.final;
  console.log("   broker:", JSON.stringify({ CoverRateMinimum: b.CoverRateMinimum, CoverRateLiquidation: b.CoverRateLiquidation, ManagementFeeRate: b.ManagementFeeRate, DebtMaximum: b.DebtMaximum }));
  const debt = BigInt(ln?.prev?.PrincipalOutstanding ?? ln?.final?.PrincipalOutstanding ?? 0);
  const cm = BigInt(b.CoverRateMinimum ?? 0), cl = BigInt(b.CoverRateLiquidation ?? 0);
  const coverTaken = BigInt(br.prev?.CoverAvailable ?? 0) - BigInt(br.final?.CoverAvailable ?? 0);
  console.log(`   debt before default ${debt}, cover taken ${coverTaken}`);
  console.log(`   debt * CoverRateMinimum/1e5 * CoverRateLiquidation/1e5 = ${(debt * cm * cl) / 10_000_000_000n} drops`);
  console.log(`   share of the debt absorbed = ${(Number(coverTaken) / Number(debt) * 100).toFixed(4)} %`);
}

console.log("\n### V1.1: is the vault of LoanBrokerSet 781F54B5 open-ended?");
for (const n of await nodesOf("781F54B5E77A768F4C02A54E3C55902AA9F1AC96AA04037AB97CE93FFB5DBDE4")) console.log("  ", n.type, n.index, JSON.stringify(n.final ?? {}).slice(0, 200));
for (const vid of ["4E75909E40B05E55C2BD12C663147ECC5FD9CDF3AEB0DC23BA6A73FC87CADE50"]) {
  try { const v = await idx(vid); console.log(`  Vault ${vid.slice(0,8)}:`, JSON.stringify({ Flags: v.Flags, LEVersion: v.LEVersion, keys: Object.keys(v).join(",") })); }
  catch (e) { console.log(`  Vault ${vid.slice(0,8)}: ${e.data?.error ?? e.message}`); }
}

console.log("\n### RPC commands: do they exist?");
for (const [cmd, extra] of [["vault_info", { vault_id: "0".repeat(64) }], ["loan_info", { loan_id: "0".repeat(64) }], ["loan_broker_info", { loan_broker_id: "0".repeat(64) }], ["mpt_holders", { mpt_issuance_id: "0".repeat(48) }], ["mpt_issuance_info", { mpt_issuance_id: "0".repeat(48) }]]) {
  try { await c.request({ command: cmd, ...extra }); console.log(`  ${cmd.padEnd(20)} -> OK`); }
  catch (e) { console.log(`  ${cmd.padEnd(20)} -> ${e.data?.error ?? e.message}`); }
}
await c.disconnect();
