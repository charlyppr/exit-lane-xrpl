// Lecture de l'état d'un Single Asset Vault et des grandeurs dérivées.
//
// Raison d'être : `vault_info` renvoie les champs BRUTS du ledger. Aucune des
// grandeurs dont un déposant a besoin — valeur d'une part, taux d'utilisation,
// capital immobilisé — n'est exposée. Chaque client devra donc réimplémenter
// cette arithmétique, et divergera sur les arrondis. C'est l'hypothèse H9, et
// ce fichier en est la preuve : 60 lignes pour afficher quatre chiffres.
//
// Piège vérifié le 12/09 (FEEDBACK-RAW [14:05]) : `AssetsAvailable` DISPARAÎT
// du nœud quand il vaut zéro. Un client naïf lit `undefined`, affiche "NaN" ou
// plante, exactement au moment le plus critique pour un déposant — celui où il
// ne peut plus retirer.

const DROPS = 1_000_000n;

/** Formate des drops (BigInt|string|number) en "12.345678 XRP". */
export const fmt = (drops) => {
  const d = BigInt(drops);
  const neg = d < 0n;
  const a = neg ? -d : d;
  return `${neg ? "-" : ""}${a / DROPS}.${String(a % DROPS).padStart(6, "0")} XRP`;
};

/**
 * Photographie d'un vault à un ledger validé.
 * Toutes les quantités sont des BigInt en drops (ou en parts).
 */
export async function vaultSnapshot(client, vaultId) {
  const res = await client.request({
    command: "vault_info",
    vault_id: vaultId,
    ledger_index: "validated",
  });
  const v = res.result.vault;

  const assetsTotal = BigInt(v.AssetsTotal ?? 0);
  // ⚠️ Absence du champ = zéro. Ne jamais écrire `BigInt(v.AssetsAvailable)`.
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
    // Champs dérivés, absents du protocole :
    utilization: assetsTotal === 0n ? 0 : Number(lent) / Number(assetsTotal),
    navPerShare: sharesOutstanding === 0n ? 1 : Number(assetsTotal) / Number(sharesOutstanding),
    availableAbsent: v.AssetsAvailable === undefined,
    raw: v,
  };
}

/** Valeur en drops d'un paquet de parts, au prix du vault. Arrondi vers le bas. */
export const sharesToDrops = (snap, shares) =>
  snap.sharesOutstanding === 0n ? 0n : (BigInt(shares) * snap.assetsTotal) / snap.sharesOutstanding;

/** Nombre de parts qu'achèterait un montant en drops, au prix du vault. */
export const dropsToShares = (snap, drops) =>
  snap.assetsTotal === 0n ? 0n : (BigInt(drops) * snap.sharesOutstanding) / snap.assetsTotal;

/** Solde de parts d'un compte. Renvoie 0n si le compte n'a pas fait son opt-in. */
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

/** Bloc d'état lisible à l'écran pendant la démo. */
export function render(snap) {
  const pct = (snap.utilization * 100).toFixed(1);
  return [
    `  Actif total        ${fmt(snap.assetsTotal)}`,
    `  Prêté              ${fmt(snap.lent)}  (${pct} % du vault)`,
    `  Disponible         ${fmt(snap.assetsAvailable)}` +
      (snap.availableAbsent ? "   ← champ ABSENT du nœud, pas zéro explicite" : ""),
    `  Parts en circul.   ${snap.sharesOutstanding}`,
    `  Valeur d'une part  ${snap.navPerShare.toFixed(9)}  (1.000000000 à l'ouverture)`,
  ].join("\n");
}
