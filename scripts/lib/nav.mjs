// Reads the state of a Single Asset Vault and the derived quantities.
//
// `vault_info` returns the raw ledger fields only. The quantities a depositor
// needs (value of one share, utilization rate, locked capital) are not
// exposed, so every client reimplements this arithmetic and may round
// differently. See hypothesis H9.
//
// Verified on 12/09 (FEEDBACK-RAW [14:05]): `AssetsAvailable` is omitted from
// the node when it equals zero. A client that reads the field directly gets
// `undefined` and prints "NaN" or crashes, at the moment the depositor can no
// longer withdraw.

const DROPS = 1_000_000n;

/** Formats drops (BigInt|string|number) as "12.345678 XRP". */
export const fmt = (drops) => {
  const d = BigInt(drops);
  const neg = d < 0n;
  const a = neg ? -d : d;
  return `${neg ? "-" : ""}${a / DROPS}.${String(a % DROPS).padStart(6, "0")} XRP`;
};

/**
 * Snapshot of a vault at a validated ledger.
 * All quantities are BigInt in drops (or in shares).
 */
export async function vaultSnapshot(client, vaultId) {
  const res = await client.request({
    command: "vault_info",
    vault_id: vaultId,
    ledger_index: "validated",
  });
  const v = res.result.vault;

  const assetsTotal = BigInt(v.AssetsTotal ?? 0);
  // A missing field means zero: do not write `BigInt(v.AssetsAvailable)`.
  const assetsAvailable = BigInt(v.AssetsAvailable ?? 0);
  const sharesOutstanding = BigInt(v.shares?.OutstandingAmount ?? 0);
  const lent = assetsTotal - assetsAvailable;

  return {
    vaultId,
    shareMPTID: v.ShareMPTID,
    pseudoAccount: v.Account,
    owner: v.Owner,
    assetsTotal,
    assetsAvailable,
    sharesOutstanding,
    lent,
    // Derived fields, absent from the protocol:
    utilization: assetsTotal === 0n ? 0 : Number(lent) / Number(assetsTotal),
    navPerShare: sharesOutstanding === 0n ? 1 : Number(assetsTotal) / Number(sharesOutstanding),
    availableAbsent: v.AssetsAvailable === undefined,
    raw: v,
  };
}

/** Value in drops of a bundle of shares, at the vault's price. Rounded down. */
export const sharesToDrops = (snap, shares) =>
  snap.sharesOutstanding === 0n ? 0n : (BigInt(shares) * snap.assetsTotal) / snap.sharesOutstanding;

/** Number of shares an amount in drops would buy, at the vault's price. */
export const dropsToShares = (snap, drops) =>
  snap.assetsTotal === 0n ? 0n : (BigInt(drops) * snap.sharesOutstanding) / snap.assetsTotal;

/** Share balance of an account. Returns 0n if the account never opted in. */
export async function shareBalance(client, address, shareMPTID) {
  try {
    const r = await client.request({
      command: "account_objects",
      account: address,
      type: "mptoken",
      ledger_index: "validated",
    });
    const held = r.result.account_objects.find((o) => o.MPTokenIssuanceID === shareMPTID);
    return BigInt(held?.MPTAmount ?? 0);
  } catch {
    return 0n;
  }
}

/** Human-readable state block shown on screen during the demo. */
export function render(snap) {
  const pct = (snap.utilization * 100).toFixed(1);
  return [
    `  Total assets        ${fmt(snap.assetsTotal)}`,
    `  Lent                ${fmt(snap.lent)}  (${pct} % of the vault)`,
    `  Available           ${fmt(snap.assetsAvailable)}` +
      (snap.availableAbsent ? "   (field absent from the node, not an explicit zero)" : ""),
    `  Shares outstanding  ${snap.sharesOutstanding}`,
    `  Value of one share  ${snap.navPerShare.toFixed(9)}  (1.000000000 at opening)`,
  ].join("\n");
}
