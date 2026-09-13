// Récupère le capital dormant dans les vaults résiduels, lender EN PREMIER
// (WithdrawalPolicy 1 = premier arrivé premier servi, et lender porte la démo).
// Opération monotone : un VaultWithdraw ne peut qu'augmenter le solde du porteur.
import { Client, Wallet } from "xrpl";
import { NET } from "../../scripts/config.mjs";
import { submitRaw, loadAccounts } from "../../scripts/raw-submit.mjs";
import { fmt } from "../../scripts/lib/nav.mjs";

const c = new Client(NET.wss, { connectionTimeout: 20000 });
await c.connect();
const a = loadAccounts();
const addr = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.address]));

const libre = async (who) => {
  const r = await c.request({ command: "account_info", account: addr[who], ledger_index: "validated" });
  const si = await c.request({ command: "server_info" });
  const l = si.result.info.validated_ledger;
  return Number(r.result.account_data.Balance) / 1e6 - (l.reserve_base_xrp + r.result.account_data.OwnerCount * l.reserve_inc_xrp);
};
const avant = { lender: await libre("lender"), spare: await libre("spare") };
console.log(`AVANT   lender ${avant.lender.toFixed(6)} libre · spare ${avant.spare.toFixed(6)} libre\n`);

const objs = await c.request({ command: "account_objects", account: addr.broker, ledger_index: "validated" });
const vaults = objs.result.account_objects.filter((o) => o.LedgerEntryType === "Vault").map((o) => o.index);
const parts = async (who, id) => {
  const r = await c.request({ command: "account_objects", account: addr[who], type: "mptoken", ledger_index: "validated" });
  return BigInt(r.result.account_objects.find((o) => o.MPTokenIssuanceID === id)?.MPTAmount ?? 0);
};

for (const who of ["lender", "spare"]) {            // lender d'abord, volontairement
  console.log(`──────── ${who.toUpperCase()} ────────`);
  for (const V of vaults) {
    const vi = await c.request({ command: "vault_info", vault_id: V, ledger_index: "validated" }).catch(() => null);
    if (!vi) continue;
    const v = vi.result.vault;
    const total = BigInt(v.AssetsTotal ?? 0), avail = BigInt(v.AssetsAvailable ?? 0), loss = BigInt(v.LossUnrealized ?? 0);
    const out = BigInt(v.shares?.OutstandingAmount ?? 0);
    if (out === 0n || total === 0n || avail === 0n) continue;
    const sh = await parts(who, v.ShareMPTID);
    if (sh === 0n) continue;
    const valeur = (sh * (total - loss)) / out;
    // Si la position dépasse la liquidité, on ne retire que ce que le vault peut rendre.
    let prendre = sh;
    if (valeur > avail) {
      prendre = (avail * out) / (total - loss);
      if (prendre > 0n) prendre -= 1n;              // marge d'arrondi d'un share
    }
    if (prendre <= 0n) { console.log(`  ${V.slice(0, 10)}… liquidité trop faible, on passe`); continue; }
    const r = await submitRaw(c, a[who].seed, { TransactionType: "VaultWithdraw", VaultID: V,
      Amount: { mpt_issuance_id: v.ShareMPTID, value: String(prendre) } },
      { label: `${V.slice(0, 10)}… retrait ${prendre}/${sh} parts (~${fmt(prendre * (total - loss) / out)})` }).catch((e) => ({ code: String(e.message).slice(0, 40) }));
    if (!r.ok && prendre < sh) {
      const r2 = await submitRaw(c, a[who].seed, { TransactionType: "VaultWithdraw", VaultID: V,
        Amount: { mpt_issuance_id: v.ShareMPTID, value: String(prendre / 2n) } },
        { label: `  2e essai à la moitié` }).catch((e) => ({ code: "échec" }));
    }
  }
  console.log();
}
const apres = { lender: await libre("lender"), spare: await libre("spare") };
console.log("════ BILAN ════");
for (const who of ["lender", "spare"])
  console.log(`  ${who.padEnd(7)} ${avant[who].toFixed(6)} → ${apres[who].toFixed(6)} libre   (+${(apres[who] - avant[who]).toFixed(6)} XRP)`);
console.log(`\n  lender : ${Math.floor(apres.lender / 27)} démos possibles (27 XRP par démo), plancher 150 ${apres.lender > 150 ? "✅" : "⛔"}`);
await c.disconnect();
