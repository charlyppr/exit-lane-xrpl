// H9 — combien d'appels RPC, et combien de maths refaites à la main, pour
// répondre aux 5 questions que se pose un DÉPOSANT ? Lecture seule.
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
const box = (q) => console.log(`\n──────── ${q}`);

console.log(`Sujet : vault ${V.slice(0, 16)}… (un des 13 vaults résiduels, avec prêt vivant)`);
console.log(`Point de vue : un déposant qui détient des parts et veut savoir où il en est.\n`);

box("Q1. Combien vaut ma position, nette des pertes latentes ?");
const vi = await rpc({ command: "vault_info", vault_id: V, ledger_index: "validated" });
const v = vi.result.vault;
console.log(`   vault_info renvoie : ${Object.keys(v).filter(k => k !== "shares").join(", ")}`);
console.log(`   shares : ${Object.keys(v.shares ?? {}).join(", ")}`);
const total = BigInt(v.AssetsTotal ?? 0), loss = BigInt(v.LossUnrealized ?? 0), out = BigInt(v.shares?.OutstandingAmount ?? 0);
const mine = await rpc({ command: "account_objects", account: a.lender.address, type: "mptoken", ledger_index: "validated" });
const myShares = BigInt((mine.result?.account_objects ?? []).find((o) => o.MPTokenIssuanceID === v.ShareMPTID)?.MPTAmount ?? 0);
console.log(`   → aucun champ « valeur de part » n'est renvoyé. Calcul à faire soi-même :`);
console.log(`     brut  = AssetsTotal/Outstanding        = ${out ? (Number(total) / Number(out)).toFixed(9) : "n/a"}`);
console.log(`     net   = (AssetsTotal-Loss)/Outstanding = ${out ? (Number(total - loss) / Number(out)).toFixed(9) : "n/a"}`);
console.log(`     mes ${myShares} parts → ${out ? fmt((myShares * (total - loss)) / out) : "n/a"}`);
console.log(`   appels RPC cumulés : ${calls}`);

box("Q2. Mes parts sont-elles cessibles ?");
const iss = await rpc({ command: "ledger_entry", mpt_issuance: v.ShareMPTID, ledger_index: "validated" });
const fl = iss.result?.node?.Flags ?? 0;
console.log(`   vault_info ne renvoie PAS les flags de l'émission → second appel obligatoire`);
console.log(`   MPTokenIssuance.Flags = ${fl} → cessibles : ${(fl & 32) ? "OUI" : "NON"} (bit 32, à connaître)`);
console.log(`   appels RPC cumulés : ${calls}`);

box("Q3. Combien puis-je retirer maintenant ?");
console.log(`   AssetsAvailable = ${v.AssetsAvailable ?? "ABSENT (= 0)"}`);
console.log(`   → plafonné par min(ma valeur, AssetsAvailable), à calculer soi-même`);

box("Q4. Dans combien de prêts est mon capital, et y en a-t-il de dépréciés ?");
console.log(`   vault_info ne cite aucun broker ni aucun prêt. Aucune commande « vault_loans ».`);
const ownerObjs = await rpc({ command: "account_objects", account: v.Owner, ledger_index: "validated" });
const brokers = (ownerObjs.result?.account_objects ?? []).filter((o) => o.LedgerEntryType === "LoanBroker" && o.VaultID === V);
console.log(`   seule voie trouvée : scanner les ${ownerObjs.result?.account_objects?.length ?? 0} objets du compte Owner`);
console.log(`   et filtrer sur VaultID → ${brokers.length} broker(s) : ${brokers.map(b => b.index.slice(0, 10) + "…").join(", ")}`);
console.log(`   ⚠️ suppose de connaître Owner ET d'avoir le droit de lister ses objets.`);
for (const b of brokers) {
  console.log(`   broker ${b.index.slice(0, 10)}… : DebtTotal ${fmt(b.DebtTotal ?? 0)} · cover ${fmt(b.CoverAvailable ?? 0)}`);
  const pseudo = await rpc({ command: "account_objects", account: b.Account, type: "loan", ledger_index: "validated" });
  const n = pseudo.result?.account_objects?.length ?? 0;
  console.log(`   prêts listés depuis le pseudo-compte du broker : ${n === 0 ? "AUCUN ⚠️" : n}`);
}
console.log(`   les objets Loan appartiennent aux EMPRUNTEURS. Contrôle sur nos comptes de test :`);
for (const who of ["borrower", "spare"]) {
  const r = await rpc({ command: "account_objects", account: a[who].address, type: "loan", ledger_index: "validated" });
  const ls = (r.result?.account_objects ?? []).filter((l) => brokers.some((b) => b.index === l.LoanBrokerID));
  console.log(`     ${who} : ${ls.length} prêt(s) de ce vault${ls.length ? " → " + ls.map(l => `${fmt(l.PrincipalOutstanding ?? 0)} Flags ${l.Flags}`).join(", ") : ""}`);
}
console.log(`   → un déposant qui ne connaît pas les emprunteurs ne peut PAS énumérer les prêts.`);
console.log(`   appels RPC cumulés : ${calls}`);

box("Q5. Qui sont les autres déposants ?");
const h = await rpc({ command: "mpt_holders", mpt_issuance_id: v.ShareMPTID, ledger_index: "validated" });
console.log(`   mpt_holders → ${h.error ?? "OK"}`);
console.log(`   → aucune énumération des porteurs de parts sur ce rippled. Question sans réponse.`);

console.log(`\n════ BILAN H9 ════`);
console.log(`   appels RPC pour un tableau de bord de déposant : ${calls}`);
console.log(`   grandeurs à recalculer à la main : valeur de part brute, valeur de part NETTE,`);
console.log(`     valeur de ma position, retrait maximum, taux d'utilisation, capacité de dette`);
console.log(`   questions restées SANS réponse : « quels prêts ? » (sans connaître les emprunteurs)`);
console.log(`     et « quels autres déposants ? »`);
await c.disconnect();
