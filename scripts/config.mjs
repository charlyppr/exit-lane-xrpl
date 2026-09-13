// TRACK 1: Custom Hackathon Devnet, Lending Protocol V1, xrpl.js stable.
//
// Single source of truth for the endpoints. Never hardcode a URL anywhere
// else in the project: that is how you end up straddling two networks
// without noticing.

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

// Lending Protocol rates are expressed in 1/10 of a basis point:
// 0 to 100000 means 0 % to 100 %. So 10 % is written 10000.
// See hypothesis H6: always use these helpers instead of writing the
// values by hand.
export const pctToRate = (pct) => Math.round(pct * 1000);
export const rateToPct = (rate) => rate / 1000;
