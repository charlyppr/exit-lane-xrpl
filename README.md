# Exit Lane

> An open-ended vault promises withdrawal at any time. It stops being able to
> keep that promise the moment it works well. Exit Lane gives depositors a
> second way out, without the vault paying a cent.

XRPL Lending Protocol Hackathon — DeVinci Blockchain x Ripple — Nanterre, 12-13 September 2026

## Environment

| | |
|---|---|
| **Track** | 1 — Open-ended vault |
| **Flavour** | Loaded — XLS-65 + XLS-66 + TokenEscrow, see [Why Loaded](#why-loaded) |
| **Protocol** | Lending Protocol V1 |
| **Network** | Custom Hackathon Devnet (`network_id` 4001, `rippled` 3.4.0-rc1) |
| **RPC** | `https://lending-hackathon.dev.ripplex.io:51234` |
| **WSS** | `wss://lending-hackathon.dev.ripplex.io:51233` |
| **Explorer** | https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/ |
| **Library** | `xrpl@4.6.0` (stable, resolved from `^4.4.1`) |
| **Node** | v24.14.0 |

## What it does

A corporate treasurer parks spare cash in a Single Asset Vault. A loan broker
lends that capital to SMEs on fixed terms. The vault is open-ended, so the
treasurer is told she can withdraw whenever she wants.

Three weeks later an unplanned supplier invoice lands. She asks for her money
back — and the protocol refuses. Every cent is out on loans that do not mature
for months. **The vault is open by design and closed in practice.**

Exit Lane is the second door. Vault shares are MPTs, so she sells hers
over the counter at a discount to their vault value. Two crossed escrows share
one PREIMAGE-SHA-256 condition, which makes the swap atomic: to take the shares,
the buyer must publish the secret that releases her payment. No escrow agent, no
counterparty risk, and the vault itself never moves. Only the holder changes.

What is sold is the **depositor's share**, never the `Loan`: XLS-66 has no
transfer of credit. The borrower never even sees the transaction.

### Why an open-ended vault, and not a closed-ended one

Because the mismatch only exists here. A closed-ended vault is honest about
locking capital until its redemption date. An open-ended vault advertises
permanent liquidity while funding fixed-term loans — that gap is the subject of
Track 1, and it is what this project addresses.

## The problem, reproduced on demand

`node scripts/demo.mjs` reproduces it in 73 seconds:

1. A single `LoanSet` takes **100% of `AssetsAvailable`**. It is accepted with
   no warning, no liquidity buffer, no cap. ([view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/83184D0DEE4299B58433FC58915A3A57751DAF2DE6F8216D92C10BF2D449941C))
2. `AssetsAvailable` then **disappears from the ledger node** rather than
   reading zero. A naive client renders `NaN` exactly when the depositor most
   needs the number.
3. The depositor's `VaultWithdraw` is refused with `tecINSUFFICIENT_FUNDS`. ([view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/72A5FD04EF0B190B4E01F1E7DA508CD6423CCB62811AE34D1CA36DEF9801BFA2))

We did not engineer this to make a point — we hit it while scripting the demo,
and the fallback path we had written for 95% and 90% was never needed.

## Demo flow — Track 1 minimum bar

Every step below is an explorer link to a validated transaction from a single
`demo.mjs` run.

| # | Step | Transaction | Result | Link |
|---|---|---|---|---|
| 1 | Open-ended vault | `VaultCreate` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/95C2CF859D802379D8B424130716D5BEAE879F2E454668622959F6B9377BD466) |
| 2 | Lender deposits 100 XRP | `VaultDeposit` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/7856C238150748A6B6DA4D5815AF89F7E372C872682AEBABD9D2F229E2A1181F) |
| 3 | Loan broker | `LoanBrokerSet` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/76E57ECA7A52D5C4E24FE5C6F1E34DBF5CF08C738CCDA39B8E32FB286D2E154E) |
| 3b | First-loss capital, 20 XRP | `LoanBrokerCoverDeposit` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/EDF6522963E59113D64A19B774141D6A5CF01BD2CDF7F817FCC8034F9C5AF3F8) |
| 4 | Origination + drawdown, two signatures | `LoanSet` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/83184D0DEE4299B58433FC58915A3A57751DAF2DE6F8216D92C10BF2D449941C) |
| 5 | Repayment, 25.513701 XRP | `LoanPay` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/64FDC37C924CD71F97BB18F3EAA87C4A186B6D3366E932D02E619C3DD3484124) |
| 6 | Principal + accrued yield | `VaultWithdraw` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C44E164363045FF4A482E3119E639780515DFE02B4A9775FADAFDC5A584D9E57) |
| 7 | **Guardrail rejection** | see below | `tec*` | see below |
| 8 | Credible use case | Exit Lane | — | this README |

**On step 4.** The minimum bar asks for a "drawdown" as a separate step. No such
transaction exists in XLS-66: principal is transferred to the borrower by
`LoanSet` itself. Reported as a documentation item.

**On step 6.** Share value moved from `1.000000000` to `1.000214800` after one
repayment. Yield is carried by the share, so it transfers with it — which is
what gives the secondary market its price.

### Step 7 — five guardrails, triggered on purpose

`node scripts/step-7-guardrails.mjs`. All five are `tec` codes, so they are
**validated and written on-chain with a verifiable hash** — unlike a `tem`
local rejection, which leaves no trace at all.

| Guardrail | Code | Link |
|---|---|---|
| `LoanSet` of 5000 XRP against a vault holding 25 | `tecINSUFFICIENT_FUNDS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B92A90F59EBF79108B5414F61A12656F321EBC264E1BB186FCC14CAF259F9CAA) |
| `LoanPay` of 1 XRP against a 25.5 XRP instalment | `tecINSUFFICIENT_PAYMENT` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/77F708D6DDB803BE80738DE78936E6EDDD0640A153C8CCF68A5A460D1E0541B4) |
| Cover withdrawal breaching `CoverRateMinimum` | `tecINSUFFICIENT_FUNDS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D91DEFCEF5D3765E0FD5A8AAC86D49891C68C52D10847F384042422D2595A60F) |
| `LoanBrokerSet` by a non-owner of the vault | `tecNO_PERMISSION` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/33742272A6C8CF7B37CD6D1E12E79AF28CD191FAB2E45F7017F1C224A0FA40A8) |
| Withdrawal beyond unlent liquidity | `tecINSUFFICIENT_FUNDS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/FB47313D52001E893E629975825807E8D368A9FE232AAD02B816967CD76DAAC4) |

**Positive control**, without which the tests would only prove that
transactions fail, not that the limit sits in the right place: a cover
withdrawal of 1 XRP *below* the threshold returns `tesSUCCESS`
([view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/90BF019FC510EF8B2E083D6716E945CD53A4914723131EE38335FEE98C4279B2)).
The script then restores the cover, so it stays replayable.

### The atomic swap, transaction by transaction

| Step | Transaction | Signed by | Link |
|---|---|---|---|
| Buyer opts in to the share MPT | `MPTokenAuthorize` | buyer | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/193346D0FB6EF4BB97A9EADC6EA76CACB4CC4CF864090797011308EBBA767D00) |
| Buyer locks payment first, expires at +2h | `EscrowCreate` | buyer | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/279011D34A1D14BC2C988EC432B02A28033CDD78316B48E6AD5604A016B31746) |
| Seller locks shares, expires at +1h | `EscrowCreate` | seller | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/6166F27B0631F8004D42F156DA5E021D421EE86B4B988E0FB83C1E077BCDEF1A) |
| Buyer claims shares, **revealing the preimage** | `EscrowFinish` | buyer | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/43697F8677CDF2FCE35F556C734500F4CFE6293F732BE4220569AAFB37642377) |
| Seller claims payment with the preimage **read back from the ledger** | `EscrowFinish` | seller | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C6419FF835DEC973C38076A0865D1B621B5EE494A89D131B14E74D00E9A58DAA) |

Two design points that are not cosmetic. The buyer commits **first**, so the
seller never exposes her shares before seeing the money locked. And the seller's
escrow expires **earlier** than the buyer's, so once the preimage is public she
always has time left to claim. Swapping those two durations breaks the safety
of the exchange.

## XLS-65 / XLS-66 transactions used

| Transaction | Used | Typed in SDK 4.6.0 | Raw JSON needed | Note |
|---|---|---|---|---|
| `VaultCreate` | ✅ | ✅ | no | No duration field exists — open-ended is the default, not an option |
| `VaultDeposit` | ✅ | ✅ | no | |
| `VaultWithdraw` | ✅ | ✅ | no | Capped at `AssetsAvailable` |
| `VaultSet` | — | ✅ | — | |
| `VaultDelete` | — | ✅ | — | |
| `VaultClawback` | — | ✅ | — | |
| `LoanBrokerSet` | ✅ | ✅ | no | Must be the vault owner |
| `LoanBrokerCoverDeposit` | ✅ | ✅ | no | Broker owner only — no pooled first-loss capital |
| `LoanBrokerCoverWithdraw` | ✅ | ✅ | no | Used for guardrail 3 |
| `LoanBrokerCoverClawback` | — | ✅ | — | |
| `LoanBrokerDelete` | — | ✅ | — | |
| `LoanSet` | ✅ | ✅ | **partly** | SDK counterparty signing is broken, see below |
| `LoanPay` | ✅ | ✅ | no | Amount must match the instalment exactly |
| `LoanManage` | — | ✅ | — | |
| `LoanDelete` | — | ✅ | — | |

All fifteen types are typed in stable `xrpl@4.6.0`, which is better than the
brief led us to expect. One workaround was still required:
`signLoanSetByCounterparty` signs with `encodeForSigning` where `rippled`
expects `encodeForSigningCounterparty`, so every `LoanSet` fails local checks.
Our replacement is in [`scripts/raw-submit.mjs`](./scripts/raw-submit.mjs).

**Other transaction types used:** `MPTokenAuthorize`, `EscrowCreate`,
`EscrowFinish`, `Payment`, and `OfferCreate` (attempted, rejected).

## Why Loaded

TokenEscrow is not decoration here. Without it, selling a vault share means
someone sends first and trusts the other party. The escrow is what removes
counterparty risk, and the use case does not hold without it.

We reached for the DEX first, which would have been Vanilla. It is not
available: `OfferCreate` on an MPT returns `temDISABLED` — MPT trading is not
implemented (XLS-82 is still in development) — even though the protocol itself
sets `lsfMPTCanTrade` on vault shares. That flag promises a capability the
ledger cannot honour, and it is what pushed us to escrows.

## Developer feedback

Full report: [`FEEDBACK.md`](./FEEDBACK.md) · Raw capture log:
[`FEEDBACK-RAW.md`](./FEEDBACK-RAW.md)

Three that cost us the most time:

1. **The documented V1.1 matrix contradicts the ledger.** With
   `LendingProtocolV1_1` enabled, the docs state a loan broker can only attach
   to a closed-ended vault. On this build `LoanBrokerSet` on an open-ended vault
   returns `tesSUCCESS`
   ([view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/781F54B5E77A768F4C02A54E3C55902AA9F1AC96AA04037AB97CE93FFB5DBDE4)).
   We nearly redesigned the whole project around a restriction that is not
   enforced.
2. **`Payment` of vault shares returns `tecNO_AUTH`** when the recipient has
   not run `MPTokenAuthorize` — a cause absent from the five failure scenarios
   the vault-share documentation lists
   ([before](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/789AAF7E228CC085199E2FB38B07A10DFC68A45C76C5FC3EFDB498BC5FD512A4) /
   [after](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B20699B9EBB2E3B60439FD86316CEC44F9579DBFABED6C779675522233791601)).
3. **Only ports 51233 and 51234 are exposed**, with no 443 fallback. Guest and
   corporate Wi-Fi silently drop both. 45 minutes lost before the first
   transaction; the faucet, on 443, answered in 365 ms throughout.

## Setup

```bash
git clone https://github.com/charlyppr/xrpl-lending
cd xrpl-lending
npm install
node scripts/check-connection.mjs   # network + library version
node scripts/setup-accounts.mjs     # funds lender / borrower / broker / spare
node scripts/demo.mjs               # the full story, 73 seconds
```

### Network prerequisite — check this first

The devnet is only exposed on ports **51233** (WSS) and **51234** (RPC). Many
guest and corporate networks allow 80/443 only and will time both out:

```bash
curl -m 10 -X POST https://lending-hackathon.dev.ripplex.io:51234 \
  -H 'Content-Type: application/json' \
  -d '{"method":"server_info","params":[{}]}'
```

No answer within 10 s means you need a 4G hotspot or a VPN. There is no 443
fallback endpoint. Full diagnosis in `FEEDBACK-RAW.md`, entry `[12:26]`.

### DevEx hook — each developer, on their own machine

Required by the event. Not committed: nested git repo plus local symlinks, both
gitignored.

```bash
git clone https://github.com/RippleDevRel/xrpl-devex-hook.git
INVITE_CODE="BFT-PARIS-26" TEAM_NAME="CY-HACK" CONSENT=yes \
  node xrpl-devex-hook/hook/setup.mjs --non-interactive --agent claude-code
```

Swap `--agent claude-code` for `cursor`, `codex`, `grok` or `vscode-copilot`.
Then approve the project hooks in your agent (`/hooks`, or `/hooks-trust` under
Grok) and restart the session. Check with `node xrpl-devex-hook/hook/status.mjs`.
Consent is individual: `CONSENT=no` records a refusal and disables all capture.

## Scripts

| File | What it does |
|---|---|
| `scripts/demo.mjs` | The pitch. Pauses between scenes; `--auto` runs straight through |
| `scripts/lib/scenario.mjs` | The scenario itself, shared so demo and proof runs cannot drift apart |
| `scripts/lib/nav.mjs` | Share value, utilisation, available liquidity — everything `vault_info` does not return |
| `scripts/step-8-secondary.mjs` | Same scenario, unattended, prints hashes |
| `scripts/step-7-guardrails.mjs` | Five deliberate rejections plus a positive control |
| `scripts/steps-4-6.mjs` | Drawdown, repayment, withdrawal |
| `scripts/test-v11-blocking.mjs` | Settles whether V1.1 blocks open-ended vaults |
| `scripts/raw-submit.mjs` | Submission helpers, including the counterparty signing workaround |
| `scripts/setup-accounts.mjs` | Funds four accounts from the faucet |

## Known limitations

- **Devnet only.** `SingleAssetVault` and `LendingProtocol` are not enabled on
  mainnet.
- **No price discovery.** The DEX rejects MPTs, so buyer and seller find each
  other off-chain. Only settlement is on-chain. When XLS-82 ships, that
  off-chain layer disappears.
- **No RLUSD on this network** (Testnet only). The vault asset is XRP.
- **Two-party swap.** No order book, no partial fills, no market making.
- Loan servicing states (`LoanManage`, impairment, default) are out of scope for
  this build.

## Team

**CY-HACK** — DevEx pseudonym `late-quail-92`

| Name | GitHub |
|---|---|
| Charly Pupier | [@charlyppr](https://github.com/charlyppr) |
| | |
