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
over the counter at a 3% discount to their vault value. That discount does not
buy yield — four months of accrued interest on this loan is worth a fraction of
it. It buys **four months of immediacy**, which is the only thing she actually
needs. Two crossed escrows share
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

`node scripts/demo.mjs --auto` reproduces it in 56 seconds:

1. A single `LoanSet` takes **100% of `AssetsAvailable`**. It is accepted with
   no warning, no liquidity buffer, no cap. ([view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/7E3006E82C7DF3ECC918093C0B2E93741A18B69A102BB8FD4EF825205F63BAB0))
2. `AssetsAvailable` then **disappears from the ledger node** rather than
   reading zero. A naive client renders `NaN` exactly when the depositor most
   needs the number.
3. The depositor's `VaultWithdraw` is refused with `tecINSUFFICIENT_FUNDS`. ([view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/7AB5622EAEFC70A6B005EAED9411EA3D62539A16E5EF5D8C8E33F8BE493CF934))

We did not engineer this to make a point — we hit it while scripting the demo,
and the fallback path we had written for 95% and 90% was never needed.

## Demo flow — Track 1 minimum bar

Every step below is an explorer link to a validated transaction from a single
`demo.mjs` run.

| # | Step | Transaction | Result | Link |
|---|---|---|---|---|
| 1 | Open-ended vault | `VaultCreate` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/A14CB64FFF00DC4D2E19E459DBB32212013FB510A8881D39E6888F20159502E4) |
| 2 | Lender deposits 25 XRP | `VaultDeposit` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/98A6A315146820D3487F2C1D847B6ACADCA0FFBEB5CE1985B97BB0CDFB772A0A) |
| 3 | Loan broker | `LoanBrokerSet` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/A4A619AAE44033E42D4645705F20F7BA757687CB378D5A22506939DA6480C5A5) |
| 3b | First-loss capital, 5 XRP | `LoanBrokerCoverDeposit` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/9DEA76E2866A4F0ED5E55998077CD6A7BD9BF2FDF5284D86E70612D330BF79BB) |
| 4 | Origination + drawdown, two signatures | `LoanSet` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/7E3006E82C7DF3ECC918093C0B2E93741A18B69A102BB8FD4EF825205F63BAB0) |
| 5 | Repayment, 6.478077 XRP | `LoanPay` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/41B2EAAED6C2E2C4616108A33366CA1D5209CBCD8B65962C52FAE85C0E8EDC8C) |
| 6 | Principal + accrued yield | `VaultWithdraw` | `tesSUCCESS` | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/53133F7685815723FBE734E7F98C78CA127E0E3413527C028F03D49C642895BE) |
| 7 | **Guardrail rejection** | see below | `tec*` | see below |
| 8 | Credible use case | Exit Lane | — | this README |

**On step 4.** The minimum bar asks for a "drawdown" as a separate step. No such
transaction exists in XLS-66: principal is transferred to the borrower by
`LoanSet` itself. Reported as a documentation item.

**On step 6.** Share value moved from `1.000000000` to `1.006443880` after one
repayment. Yield is carried by the share, so it transfers with it — which is
what gives the secondary market its price. Note who is withdrawing here: the
**buyer**, who never deposited into this vault. He redeems principal *and* the
yield accrued while the seller still held the shares.

The loan runs on four **monthly** instalments, so the capital is committed for
roughly four months. That is what makes the 3% discount coherent: holding to
maturity earns about 2.6%, so the seller gives up her remaining yield plus a
thin premium for getting out today. On four *daily* instalments — our first
calibration — waiting cost 0.055 XRP per 100 against a 3 XRP discount, and the
trade made no economic sense at all.

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
| Buyer opts in to the share MPT | `MPTokenAuthorize` | buyer | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/79F48365FE3F5100E239F8CA11528AABE5FBAA657DEDB184AE96C433B32C5E31) |
| Buyer locks payment first, expires at +2h | `EscrowCreate` | buyer | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/1F29F998F40702EA8B5B6C3B2A4D5B896659717A277748E7B0D17755E539FBF8) |
| Seller locks shares, expires at +1h | `EscrowCreate` | seller | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/795D6AFE68DF7B71FD66F7984FAB29B35C0892127495705AF059A49AFB204099) |
| Buyer claims shares, **revealing the preimage** | `EscrowFinish` | buyer | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/029559F027CBCA450F8BF25B3F5DD7BBFB77E952DC569E8616A54CFB1D26A179) |
| Seller claims payment with the preimage **read back from the ledger** | `EscrowFinish` | seller | [view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5F359ADB7BC18CD1F07609FFE8A8B0FA020187FA2290BB39BFF99FEF50BEF991) |

Two design points that are not cosmetic. The buyer commits **first**, so the
seller never exposes her shares before seeing the money locked. And the seller's
escrow expires **earlier** than the buyer's, so once the preimage is public she
always has time left to claim. Swapping those two durations breaks the safety
of the exchange.

## XLS-65 / XLS-66 transactions used

**All fifteen types have been submitted to the ledger at least once.** The eight
that the pitch does not need were exercised in a dedicated hunt, and what each
one revealed is in [`FEEDBACK.md`](./FEEDBACK.md).

| Transaction | In the demo | Submitted | Raw JSON | What it taught us |
|---|---|---|---|---|
| `VaultCreate` | ✅ | ✅ | no | No duration field exists — open-ended is the default, not an option |
| `VaultDeposit` | ✅ | ✅ | no | Past `AssetsMaximum`: `tecLIMIT_EXCEEDED`, rejected whole, never partial |
| `VaultWithdraw` | ✅ | ✅ | no | Capped at `AssetsAvailable` — and denominated in shares while that cap is in assets |
| `VaultSet` | — | ✅ | no | `AssetsMaximum: 0` **disables** the cap instead of freezing deposits; `WithdrawalPolicy` is immutable |
| `VaultDelete` | — | ✅ | no | `tecHAS_OBLIGATIONS` while not empty; once empty it also cleans up third-party `MPToken` objects and refunds their reserve |
| `VaultClawback` | — | ✅ | no | `tecNO_PERMISSION` even for the vault owner — clawback needs an asset with an issuer, and XRP has none |
| `LoanBrokerSet` | ✅ | ✅ | no | Must be the vault owner; cover rates and management fee are **immutable** afterwards (`temINVALID`) |
| `LoanBrokerCoverDeposit` | ✅ | ✅ | no | Broker owner only — no pooled first-loss capital |
| `LoanBrokerCoverWithdraw` | ✅ | ✅ | no | Floor enforced to the drop — and released entirely by a default |
| `LoanBrokerCoverClawback` | — | ✅ | no | `tecNO_PERMISSION` for broker, depositor and borrower alike |
| `LoanBrokerDelete` | — | ✅ | no | `tecHAS_OBLIGATIONS` while a loan is alive |
| `LoanSet` | ✅ | ✅ | **partly** | SDK counterparty signing is broken, see below |
| `LoanPay` | ✅ | ✅ | no | `Amount` is a **ceiling**, not an exact amount; a late payment needs `tfLoanLatePayment` or returns `tecEXPIRED` |
| `LoanManage` | — | ✅ | no | Impairment allowed from the due date, default only after grace; with no flag it returns `tesSUCCESS` and does nothing |
| `LoanDelete` | — | ✅ | no | Works once the loan is repaid or defaulted |

All fifteen are typed in stable `xrpl@4.6.0`, which is better than the brief led
us to expect. One workaround was still required: `signLoanSetByCounterparty`
signs with `encodeForSigning` where `rippled` expects
`encodeForSigningCounterparty`, so every `LoanSet` fails local checks. Our
replacement is in [`scripts/raw-submit.mjs`](./scripts/raw-submit.mjs).

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

Sixty-seven entries with hashes, ten findings in the report. The three that would cost
another team the most time:

1. **A borrower one second late cannot pay at all** unless `LoanPay` carries
   `tfLoanLatePayment`. Without the flag every amount — the exact instalment, the
   instalment plus `LatePaymentFee`, even the whole outstanding balance — returns
   **`tecEXPIRED`**, a code that does not appear in the `LoanPay` error table, so
   it cannot be looked up from the page of the transaction that returned it
   ([without](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/96C3870480E4CB0C9E3B925F2965347DA0815A486CDB4B49545928E32D6B0BA4) /
   [with](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/EFAD383F9B622357CE67CBB0518D9F9F5FC27BE611D43F26FD69427713FB608F)).
   Two probe scripts and one burned loan went on wrong hypotheses first.
2. **The obvious share price is 150 % too high on an impaired vault.**
   Impairment writes the paper loss into `LossUnrealized`, which is *not*
   deducted from `AssetsTotal` — and the field is **absent from the node while it
   is zero**, so it never appears during development. `lib/nav.mjs` was written
   specifically to read vault state, with this protocol's other zero-value traps
   already commented in it, and it still missed the field. Three more numeric
   fields vanish at zero the same way; this is the only one that returns a wrong,
   plausible number instead of a loud `NaN`
   ([impairment](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C8678C1C0A10BE889124F40C03017038654B278E2D464FAC54784F55B35318FC)).
3. **The documented V1.1 matrix contradicts the ledger.** With
   `LendingProtocolV1_1` enabled, the docs state a loan broker can only attach to
   a closed-ended vault. On this build `LoanBrokerSet` on an open-ended vault
   returns `tesSUCCESS`
   ([view](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/781F54B5E77A768F4C02A54E3C55902AA9F1AC96AA04037AB97CE93FFB5DBDE4)).
   We nearly redesigned the whole project around a restriction that is not
   enforced.

And the finding that cost us the most XRP rather than the most time: a **default
drained 0.5 % of the first-loss capital and 79.6 % of the depositor's position**,
after which the broker withdrew the untouched 98 % of its cover within the
minute. That is the documented formula working as specified — which is the point.

## Setup

```bash
git clone https://github.com/charlyppr/xrpl-lending
cd xrpl-lending
npm install
node scripts/check-connection.mjs   # network + library version
node scripts/setup-accounts.mjs     # funds lender / borrower / broker / spare
node scripts/demo.mjs               # the full story, 56 seconds
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
| `scripts/demo.mjs` | The pitch. Pauses between scenes; `--auto` runs straight through in 56 s |
| `scripts/lib/scenario.mjs` | The scenario itself, shared so demo and proof runs cannot drift apart |
| `scripts/lib/nav.mjs` | Share value, utilisation, available liquidity — everything `vault_info` does not return |
| `scripts/step-8-secondary.mjs` | Same scenario, unattended, prints hashes |
| `scripts/step-7-guardrails.mjs` | Five deliberate rejections plus a positive control |
| `scripts/steps-4-6.mjs` | Drawdown, repayment, withdrawal |
| `scripts/test-v11-blocking.mjs` | Settles whether V1.1 blocks open-ended vaults |
| `scripts/raw-submit.mjs` | Submission helpers, including the counterparty signing workaround |
| `scripts/setup-accounts.mjs` | Funds four accounts from the faucet |
| `scripts/_probe-*.mjs` | Twenty-three throwaway probes, one per subject, none wired into the demo — they are what produced the report |
| `scripts/_probe-budget.mjs` | Free balance of every account against its reserve floor |
| `scripts/_probe-inventory.mjs` | Every live vault, broker and loan, with the capital still locked in them |

## Known limitations

- **Devnet only.** `SingleAssetVault` and `LendingProtocol` are not enabled on
  mainnet.
- **No price discovery.** The DEX rejects MPTs, so buyer and seller find each
  other off-chain. Only settlement is on-chain. When XLS-82 ships, that
  off-chain layer disappears.
- **No RLUSD on this network** (Testnet only). The vault asset is XRP.
- **Two-party swap.** No order book, no partial fills, no market making.
- **The buyer holds a free option.** Nothing compels him to complete the swap.
  He locks his payment, watches for an hour, and if the price moves he simply
  lets both escrows expire: he recovers his XRP at +2h, the seller her shares
  at +1h. He has therefore obtained a one-hour option on the shares at no cost,
  and the seller financed it by immobilising her position for nothing. This is
  the *free option problem*, structural to every HTLC-settled swap, and we do
  not solve it here. The standard remedies — a non-refundable commitment
  premium, or buyer-side collateral forfeited on expiry — are both expressible
  with the primitives already used, and are the first thing this design would
  need before real counterparties.
- **Clawback is untested in its working case.** The vault asset is XRP, which has
  no issuer, so `VaultClawback` and `LoanBrokerCoverClawback` could only be
  observed refusing. On an IOU- or MPT-denominated vault they may behave very
  differently.
- **Loan servicing is exercised but not in the pitch.** The full
  `tfLoanImpair` → `tfLoanDefault` cycle, the first-loss drain and its effect on
  the depositor's share were all measured (see [`FEEDBACK.md`](./FEEDBACK.md)),
  on payment intervals of 60–90 seconds rather than months. Accrual rounding over
  real monthly terms is untested, and the demo deliberately stays on the
  performing path.

## Team

**CY-HACK** — DevEx pseudonym `late-quail-92`

| Name | GitHub |
|---|---|
| Charly Pupier | [@charlyppr](https://github.com/charlyppr) |
| | |
