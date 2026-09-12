// Phase 3 (rachat) du vault C, et récupération des 20 XRP du lender.
// Double emploi : dernier maillon du test de phases + nettoyage du capital.
import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl } from "./config.mjs";
import { loadAccounts } from "./raw-submit.mjs";

const C = "45BF2F44A84D64CE11D69A6D66900337467DE35CE43FA5E8683C6559D93FDE63";
const A = "B6D108A2839F33EB5AC78144C7495C685866276E2C23B0180929631ADC4BF123";
const log = (...a) => console.log(...a);
const signRaw = (tx, w) => {
  const t = { ...tx, SigningPubKey: w.publicKey };
  t.TxnSignature = kpSign(encodeForSigning(t), w.privateKey);
  return encode(t);
};
const c = new Client(NET.wss, { connectionTimeout: 20000, timeout: 30000 });
await c.connect();
const { spare, lender } = loadAccounts();
const lw = Wallet.fromSeed(lender.seed), sw = Wallet.fromSeed(spare.seed);
const submit = async (w, tx, label, expected) => {
  try {
    const p = await c.autofill({ Account: w.address, ...tx });
    const r = await c.submitAndWait(signRaw(p, w));
    const code = r.result.meta.TransactionResult;
    log(`  ${label.padEnd(30)} ${code.padEnd(20)} ${expected ? (code === expected ? "✓ conforme" : `✗ doc: ${expected}`) : ""}`);
    log(`    ${txUrl(r.result.hash)}`);
    return code;
  } catch (e) { log(`  ${label.padEnd(30)} rejet: ${e.message}`); return "throw"; }
};
const node = async (i) => {
  try { return (await c.request({ command: "ledger_entry", index: i, ledger_index: "validated" })).result.node; }
  catch { return null; }
};
const ct = (await c.request({ command: "ledger", ledger_index: "validated" })).result.ledger.close_time;
const v = await node(C);
log(`close_time ${ct} · RedemptionDate ${v.RedemptionDate} → phase ${ct > v.RedemptionDate ? "RACHAT" : "INVESTISSEMENT"}`);
log(`AssetsTotal ${Number(v.AssetsTotal ?? 0) / 1e6} XRP`);

log("\n─── PHASE 3 · RACHAT");
await submit(lw, { TransactionType: "VaultWithdraw", VaultID: C, Amount: v.AssetsTotal ?? "0" },
  "VaultWithdraw (rachat)", "tesSUCCESS");

log("\n─── Nettoyage : VaultDelete sur les vaults de test");
await submit(sw, { TransactionType: "VaultDelete", VaultID: C }, "VaultDelete C (vide)", "tesSUCCESS");
await submit(sw, { TransactionType: "VaultDelete", VaultID: A }, "VaultDelete A (broker attaché)", null);

const bal = (await c.request({ command: "account_info", account: lw.address, ledger_index: "validated" })).result.account_data.Balance;
log(`\nlender : ${(Number(bal) / 1e6).toFixed(6)} XRP`);
await c.disconnect();
