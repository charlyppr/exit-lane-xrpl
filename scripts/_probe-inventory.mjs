// Inventaire des vaults / brokers / prêts encore vivants, et du capital immobilisé.
import { Client, Wallet } from "xrpl";
import { NET } from "./config.mjs";
import { loadAccounts } from "./raw-submit.mjs";
import { fmt } from "./lib/nav.mjs";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const a = loadAccounts();
const bw = Wallet.fromSeed(a.broker.seed);
const objs = await c.request({ command: "account_objects", account: bw.address, ledger_index: "validated" });
const vaults = objs.result.account_objects.filter((o) => o.LedgerEntryType === "Vault");
const brokers = objs.result.account_objects.filter((o) => o.LedgerEntryType === "LoanBroker");
console.log(`VAULTS (${vaults.length})`);
let locked = 0n;
for (const v of vaults) {
  const t = BigInt(v.AssetsTotal ?? 0), av = BigInt(v.AssetsAvailable ?? 0);
  locked += t;
  console.log(`  ${v.index.slice(0, 12)}… total ${fmt(t).padStart(16)} dispo ${fmt(av).padStart(16)} perte ${String(v.LossUnrealized ?? "-").padStart(9)} max ${v.AssetsMaximum ?? "-"}`);
}
console.log(`  → capital total encore dans des vaults : ${fmt(locked)}`);
console.log(`\nBROKERS (${brokers.length})`);
let cover = 0n;
for (const b of brokers) {
  const d = BigInt(b.DebtTotal ?? 0), cv = BigInt(b.CoverAvailable ?? 0);
  cover += cv;
  console.log(`  ${b.index.slice(0, 12)}… dette ${fmt(d).padStart(16)} cover ${fmt(cv).padStart(16)} min ${b.CoverRateMinimum ?? "-"} liq ${b.CoverRateLiquidation ?? "-"} vault ${b.VaultID.slice(0, 10)}…`);
}
console.log(`  → first-loss capital immobilisé : ${fmt(cover)}`);
for (const who of ["borrower", "lender", "spare"]) {
  const r = await c.request({ command: "account_objects", account: a[who].address, type: "loan", ledger_index: "validated" }).catch(() => null);
  const ls = r?.result.account_objects ?? [];
  if (ls.length) { console.log(`\nPRÊTS VIVANTS chez ${who} (${ls.length})`);
    for (const l of ls) console.log(`  ${l.index.slice(0, 12)}… principal ${fmt(l.PrincipalOutstanding ?? 0).padStart(16)} restant ${l.PaymentRemaining ?? 0} Flags ${l.Flags} broker ${l.LoanBrokerID.slice(0, 10)}…`); }
}
await c.disconnect();
