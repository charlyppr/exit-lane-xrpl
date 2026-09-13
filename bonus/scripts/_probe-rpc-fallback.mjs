// JSON-RPC fallback: the WSS (51233) refuses the handshake, the RPC (51234) answers.
// xrpl.js has no HTTP transport (`Client` is WebSocket only), so everything
// has to be redone by hand: Fee, Sequence, LastLedgerSequence, signing,
// submit, waiting for validation. Feedback item under `client libraries`.
//
// Purpose: phase 3 (redemption) of vault C + recovering the lender's 20 XRP.
import { Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";

const C = "45BF2F44A84D64CE11D69A6D66900337467DE35CE43FA5E8683C6559D93FDE63";
const A = "B6D108A2839F33EB5AC78144C7495C685866276E2C23B0180929631ADC4BF123";
const log = (...a) => console.log(...a);

async function rpc(method, params = {}) {
  const r = await fetch(NET.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params: [params] }),
  });
  const j = await r.json();
  if (j.result?.error) throw new Error(`${method}: ${j.result.error} ${j.result.error_message ?? ""}`);
  return j.result;
}

const signRaw = (tx, w) => {
  const t = { ...tx, SigningPubKey: w.publicKey };
  t.TxnSignature = kpSign(encodeForSigning(t), w.privateKey);
  return encode(t);
};

// Home-made equivalent of client.autofill + submitAndWait, in 25 lines.
async function send(w, tx, label, expected) {
  const ai = await rpc("account_info", { account: w.address, ledger_index: "validated" });
  const li = (await rpc("ledger", { ledger_index: "validated" })).ledger_index;
  const full = {
    ...tx,
    Account: w.address,
    Fee: "20",
    Sequence: ai.account_data.Sequence,
    LastLedgerSequence: Number(li) + 20,
    NetworkID: 4001,          // network_id > 1024 -> NetworkID is mandatory
  };
  const sub = await rpc("submit", { tx_blob: signRaw(full, w) });
  const hash = sub.tx_json?.hash;
  let code = sub.engine_result;
  // Wait for validation: no submitAndWait here either.
  for (let i = 0; i < 15 && hash; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const t = await rpc("tx", { transaction: hash });
      if (t.validated) { code = t.meta?.TransactionResult ?? code; break; }
    } catch { /* not found yet */ }
  }
  log(`  ${label.padEnd(30)} ${String(code).padEnd(20)} ${expected ? (code === expected ? "as documented" : `DIVERGENCE (doc: ${expected})`) : ""}`);
  if (hash) log(`    ${txUrl(hash)}`);
  return code;
}

const { spare, lender } = loadAccounts();
const lw = Wallet.fromSeed(lender.seed), sw = Wallet.fromSeed(spare.seed);

const si = await rpc("server_info");
log(`RPC OK, build ${si.info.build_version}, ledgers ${si.info.complete_ledgers}`);

const ct = (await rpc("ledger", { ledger_index: "validated" })).ledger.close_time;
const v = (await rpc("ledger_entry", { index: C, ledger_index: "validated" })).node;
log(`close_time ${ct}, RedemptionDate ${v.RedemptionDate} -> phase ${ct > v.RedemptionDate ? "REDEMPTION" : "INVESTMENT"}`);
log(`AssetsTotal ${Number(v.AssetsTotal ?? 0) / 1e6} XRP\n`);

log("--- PHASE 3: REDEMPTION");
await send(lw, { TransactionType: "VaultWithdraw", VaultID: C, Amount: v.AssetsTotal ?? "0" },
  "VaultWithdraw (redemption)", "tesSUCCESS");

log("\n--- Cleanup");
await send(sw, { TransactionType: "VaultDelete", VaultID: C }, "VaultDelete C (emptied)", "tesSUCCESS");
await send(sw, { TransactionType: "VaultDelete", VaultID: A }, "VaultDelete A (broker attached)", null);

const bal = (await rpc("account_info", { account: lw.address, ledger_index: "validated" })).account_data.Balance;
log(`\nlender: ${(Number(bal) / 1e6).toFixed(6)} XRP`);
