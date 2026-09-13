// Verification of the hard point of the H13 probe: on a closed-ended vault
// whose RedemptionDate is in the future, VaultWithdraw returned tesSUCCESS.
// Before turning it into a report item, we must prove that funds actually
// moved; a tesSUCCESS that moves nothing would be a different topic.
//
// We measure: depositor balance, MPT shares, vault state, before/after a
// full withdrawal. Then we check whether `vault_info` exposes the V1.1 fields.

import { Client, Wallet } from "xrpl";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { sign as kpSign } from "ripple-keypairs";
import { NET, txUrl } from "../../scripts/config.mjs";
import { loadAccounts } from "../../scripts/raw-submit.mjs";

const VAULT_A = "B6D108A2839F33EB5AC78144C7495C685866276E2C23B0180929631ADC4BF123";
const XRP = (n) => String(Math.round(n * 1_000_000));
const RIPPLE_EPOCH = 946_684_800;
const nowRipple = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
const log = (...a) => console.log(...a);

function signRaw(tx, wallet) {
  const t = { ...tx, SigningPubKey: wallet.publicKey };
  t.TxnSignature = kpSign(encodeForSigning(t), wallet.privateKey);
  return encode(t);
}

const client = new Client(NET.wss, { connectionTimeout: 20000 });
await client.connect();
const { lender } = loadAccounts();
const lenderW = Wallet.fromSeed(lender.seed);

const vault = async () => {
  const r = await client.request({ command: "ledger_entry", index: VAULT_A, ledger_index: "validated" });
  return r.result.node;
};
const balance = async (addr) => {
  const r = await client.request({ command: "account_info", account: addr, ledger_index: "validated" });
  return Number(r.result.account_data.Balance) / 1e6;
};
const shares = async (addr, mptID) => {
  const r = await client.request({ command: "account_objects", account: addr, type: "mptoken", ledger_index: "validated" });
  return r.result.account_objects.find((o) => o.MPTokenIssuanceID === mptID)?.MPTAmount ?? "0";
};

const v0 = await vault();
log(`VaultKind        : ${v0.VaultKind}`);
log(`SubscriptionDate : ${v0.SubscriptionDate}  (now ${nowRipple()} -> ${v0.SubscriptionDate > nowRipple() ? "window OPEN" : "window CLOSED"})`);
log(`RedemptionDate   : ${v0.RedemptionDate}  (${v0.RedemptionDate > nowRipple() ? `in ${v0.RedemptionDate - nowRipple()} s -> INVESTMENT PERIOD` : "past"})`);
log(`LEVersion        : ${v0.LEVersion}`);
log(`AssetsTotal      : ${Number(v0.AssetsTotal) / 1e6} XRP`);
log(`AssetsAvailable  : ${Number(v0.AssetsAvailable) / 1e6} XRP`);
log(`ShareMPTID       : ${v0.ShareMPTID}`);

const b0 = await balance(lenderW.address);
const s0 = await shares(lenderW.address, v0.ShareMPTID);
log(`\nlender : ${b0.toFixed(6)} XRP, ${s0} shares`);

// Full withdrawal before RedemptionDate
log(`\n--- VaultWithdraw of the whole balance (${Number(v0.AssetsTotal) / 1e6} XRP) before RedemptionDate`);
const prepared = await client.autofill({
  TransactionType: "VaultWithdraw",
  Account: lenderW.address,
  VaultID: VAULT_A,
  Amount: v0.AssetsTotal,
});
const res = await client.submitAndWait(signRaw(prepared, lenderW));
const code = res.result.meta?.TransactionResult;
log(`  ${code}`);
log(`    ${txUrl(res.result.hash)}`);

const v1 = await vault().catch(() => null);
const b1 = await balance(lenderW.address);
const s1 = v1 ? await shares(lenderW.address, v1.ShareMPTID) : "0";

log(`\nAFTER`);
log(`  lender          : ${b1.toFixed(6)} XRP (delta ${(b1 - b0).toFixed(6)}), ${s1} shares (before ${s0})`);
if (v1) {
  log(`  AssetsTotal     : ${Number(v1.AssetsTotal) / 1e6} XRP (before ${Number(v0.AssetsTotal) / 1e6})`);
  log(`  AssetsAvailable : ${Number(v1.AssetsAvailable) / 1e6} XRP`);
} else {
  log("  vault deleted");
}

const moved = b1 - b0;
log(`\nVERDICT : ${moved > 0.1
  ? `funds DID move (+${moved.toFixed(6)} XRP): the closed-ended lock is not enforced.`
  : "no significant movement: tesSUCCESS with no effect, different topic."}`);

// does vault_info expose the V1.1 fields?
log("\n--- vault_info");
try {
  const vi = await client.request({ command: "vault_info", vault_id: VAULT_A, ledger_index: "validated" });
  const keys = Object.keys(vi.result.vault ?? vi.result);
  log(`  fields returned : ${keys.join(", ")}`);
  const v11 = ["VaultKind", "SubscriptionDate", "RedemptionDate", "LEVersion"].filter((k) => keys.includes(k));
  log(`  V1.1 fields exposed : ${v11.length ? v11.join(", ") : "NONE"}`);
} catch (e) {
  log(`  vault_info FAILED : ${e.message}`);
}

await client.disconnect();
