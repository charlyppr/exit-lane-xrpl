// TRACK 1 — Custom Hackathon Devnet, Lending Protocol V1, xrpl.js stable.
//
// Source de vérité unique pour les endpoints. Ne jamais hardcoder une URL
// ailleurs dans le projet : c'est comme ça qu'on finit à cheval sur deux
// réseaux sans s'en rendre compte.

export const NET = {
  track: 1,
  protocol: "Lending Protocol V1",
  vaultKind: "open-ended",
  faucet: "https://lending-hackathon-faucet.dev.ripplex.io/accounts",
  rpc: "https://lending-hackathon.dev.ripplex.io:51234",
  wss: "wss://lending-hackathon.dev.ripplex.io:51233",
  explorer: "https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/",
};

export const txUrl = (hash) => `${NET.explorer}transactions/${hash}`;
export const acctUrl = (addr) => `${NET.explorer}accounts/${addr}`;

// Les taux du Lending Protocol sont en 1/10 de point de base :
// 0 à 100000 représente 0 % à 100 %. Donc 10 % s'écrit 10000.
// Cf. hypothèse H6 — utiliser ces helpers systématiquement plutôt que
// d'écrire les valeurs à la main.
export const pctToRate = (pct) => Math.round(pct * 1000);
export const rateToPct = (rate) => rate / 1000;
