// Which pseudo-account belongs to the Vault and which to the LoanBroker, in a given tx. Read-only.
import { Client } from "xrpl";
import { NET } from "../../scripts/config.mjs";
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const r = await c.request({ command: "tx", transaction: process.argv[2] });
for (const n of r.result.meta.AffectedNodes) {
  const k = n.ModifiedNode ?? n.CreatedNode ?? n.DeletedNode;
  const f = k.FinalFields ?? k.NewFields ?? {}, p = k.PreviousFields ?? {};
  if (k.LedgerEntryType === "Vault") console.log(`Vault      pseudo-account ${f.Account}  AssetsTotal ${p.AssetsTotal}→${f.AssetsTotal}`);
  if (k.LedgerEntryType === "LoanBroker") console.log(`LoanBroker pseudo-account ${f.Account}  CoverAvailable ${p.CoverAvailable}→${f.CoverAvailable ?? 0}`);
  if (k.LedgerEntryType === "AccountRoot" && p.Balance) console.log(`AccountRoot ${f.Account}  ${p.Balance}→${f.Balance}`);
}
await c.disconnect();
