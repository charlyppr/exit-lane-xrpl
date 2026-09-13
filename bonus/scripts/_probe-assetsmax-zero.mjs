// AssetsMaximum = 0 : plafond illimité, ou gel des dépôts ? Le test précédent
// ne tranchait pas (le dépôt restait sous l'ancien plafond). Ici on dépasse.
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts } from "../../scripts/raw-submit.mjs";
import { vaultSnapshot, fmt } from "../../scripts/lib/nav.mjs";

const XRP = (n) => String(Math.round(n * 1_000_000));
const createdNode = (r, t) => (r?.meta?.AffectedNodes ?? []).find((n) => n.CreatedNode?.LedgerEntryType === t)?.CreatedNode ?? null;
const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const { broker, spare } = loadAccounts();
const show = async (V, t) => { const s = await vaultSnapshot(c, V);
  console.log(`   ${t} : AssetsTotal ${fmt(s.assetsTotal)} · AssetsMaximum ${s.raw.AssetsMaximum ? fmt(s.raw.AssetsMaximum) : "ABSENT"}`); return s; };

const v = await submitRaw(c, broker.seed, { TransactionType: "VaultCreate", Asset: { currency: "XRP" },
  AssetsMaximum: XRP(5), WithdrawalPolicy: 1 }, { label: "VaultCreate(max=5)" });
const V = createdNode(v.result, "Vault").LedgerIndex;
await submitRaw(c, spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(3) }, { label: "Dépôt 3 XRP" });
await show(V, "état");

console.log("\n1) VaultSet max = AssetsTotal exactement (3 XRP) — le geste de « gel »");
await submitRaw(c, broker.seed, { TransactionType: "VaultSet", VaultID: V, AssetsMaximum: XRP(3) }, { label: "VaultSet max=3 (=total)" });
await show(V, "après");
console.log("   dépôt de 1 XRP sur un vault gelé :");
await submitRaw(c, spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(1) }, { label: "Dépôt 1 XRP (gelé)" });

console.log("\n2) VaultSet max = 0, puis dépôt qui DÉPASSE l'ancien plafond de 5 XRP");
await submitRaw(c, broker.seed, { TransactionType: "VaultSet", VaultID: V, AssetsMaximum: "0" }, { label: "VaultSet max=0" });
await show(V, "après max=0");
const d = await submitRaw(c, spare.seed, { TransactionType: "VaultDeposit", VaultID: V, Amount: XRP(4) }, { label: "Dépôt 4 XRP (total 7 > 5)" });
const s = await show(V, "après dépôt");
console.log(`\n   VERDICT : AssetsMaximum = 0 signifie ${d.ok ? "ILLIMITÉ (le plafond est DÉSACTIVÉ) ⚠️" : "GEL (dépôts bloqués)"}`);

console.log("\n3) Peut-on remettre un plafond après un 0 ?");
await submitRaw(c, broker.seed, { TransactionType: "VaultSet", VaultID: V, AssetsMaximum: XRP(5) }, { label: "VaultSet max=5 (< total 7)" });
await submitRaw(c, broker.seed, { TransactionType: "VaultSet", VaultID: V, AssetsMaximum: XRP(7) }, { label: "VaultSet max=7 (= total)" });
await show(V, "final");

console.log("\n4) Ménage : retrait total puis VaultDelete (récupération des 2 XRP de réserve)");
const sh = await (async () => { const r = await c.request({ command: "account_objects", account: Wallet.fromSeed(spare.seed).address, type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === s.shareMPTID)?.MPTAmount ?? 0); })();
await submitRaw(c, spare.seed, { TransactionType: "VaultWithdraw", VaultID: V,
  Amount: { mpt_issuance_id: s.shareMPTID, value: String(sh) } }, { label: "Retrait total" });
await submitRaw(c, broker.seed, { TransactionType: "VaultDelete", VaultID: V }, { label: "VaultDelete" });
await c.disconnect();
