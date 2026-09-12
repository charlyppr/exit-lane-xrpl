# Developer Feedback Report

| | |
|---|---|
| **Team** | CY-HACK (DevEx pseudonym `late-quail-92`) |
| **Track / Flavour** | 1 — open-ended vault · Loaded (XLS-65 + XLS-66 + TokenEscrow) |
| **Network** | Custom Hackathon Devnet · `network_id` 4001 · `rippled` 3.4.0-rc1 · Lending Protocol V1, with `LendingProtocolV1_1` also enabled |
| **Library** | **`xrpl@4.6.0`**, pinned — resolved from `^4.4.1`; npm `latest` was 5.2.0 (Track 2 territory) |
| **Repo** | https://github.com/charlyppr/xrpl-lending |

**Time to first transaction:** ~50 min — ~45 min of it a network block (below), ~5 min
a bug in the provided script. Cleared, the setup script runs in 13 s.
**Hand-built JSON: 0 / 15 types** — all are correctly typed in `xrpl@4.6.0`.
`LoanSet` needed a hand-rolled *signing* helper; four probes had to bypass the SDK
validator to ask the ledger something it would not express.
**Coverage:** all 15 XLS-65/66 types submitted at least once, the full
`tfLoanImpair` → `tfLoanDefault` cycle, 5 guardrails triggered on purpose.
Raw log with every hash: [`FEEDBACK-RAW.md`](./FEEDBACK-RAW.md), 64 entries.

| # | Phase | Category | Finding | Sev. |
|---|---|---|---|---|
| 1 | Construction | docs / error msg | A late `LoanPay` needs `tfLoanLatePayment`, or `tecEXPIRED` — a code absent from its own error table | **High** |
| 2 | Observability | UX / docs | `LossUnrealized` is not deducted from `AssetsTotal`: the obvious share price is **150 % too high** | **High** |
| 3 | Construction | naming / design | "First-loss capital" absorbed **0.5 %** of the first loss; the broker took the rest back a minute later | **High** |
| 4 | Construction | UX | `AssetsMaximum: 0` **disables** the cap instead of freezing deposits | **High** |
| 5 | Observability | missing primitive | A depositor's dashboard: **8 RPC calls, 6 hand-built formulas** | **High** |
| 6 | Construction | error message | One `tecINSUFFICIENT_FUNDS` for two opposite cliffs: no cover vs no liquidity | Medium |

Items 1–4 are detailed below, 5 and 6 in the short list that follows; all six have
their full repro in [`FEEDBACK-RAW.md`](./FEEDBACK-RAW.md).

---

### 1. A late payment needs an undocumented flag, and the code misleads

A loan **10 seconds** past `NextPaymentDueDate` — still in grace, not impaired —
rejected every `LoanPay`: the exact periodic amount, the amount plus
`LatePaymentFee`, the full outstanding balance, and `tfLoanFullPayment`. All
**`tecEXPIRED`**. The fix is `tfLoanLatePayment` (262144), which appears only in the
flags table, worded as an *indication* rather than a requirement — and `tecEXPIRED`
**is not in the `LoanPay` error cases** at all, so the code cannot be looked up from
the page of the transaction that returned it, while its name points at loan expiry.
Two probe scripts and one burned loan went on wrong hypotheses before we found it.
An integrator shipping a "pay my instalment" button without the flag permanently
blocks every borrower one second late.

**Repro.** `PaymentInterval: 90`, `GracePeriod: 60`; pass the due date by 10 s;
`LoanPay` of `ceil(PeriodicPayment) + LoanServiceFee + LatePaymentFee`, no flag →
`tecEXPIRED` `96C3870480E4CB0C9E3B925F2965347DA0815A486CDB4B49545928E32D6B0BA4`;
same transaction, `Flags: 262144` → `tesSUCCESS`
`EFAD383F9B622357CE67CBB0518D9F9F5FC27BE611D43F26FD69427713FB608F`

Also undocumented: **`Amount` is a ceiling.** Accrued late interest is exposed by
**no field**, so any amount rebuilt from the node is a few drops short and draws
`tecINSUFFICIENT_PAYMENT`. Overpaying costs nothing — 2 765 001 drops sent,
**765 015** debited.
`9A7589384C5142703AFFACBB91B12E223EC734F7ACBE51272A87525FE4EE9CA8`

**Proposal.** List `tecEXPIRED` with its real cause, describe the flag as
**required** past the due date, say that `Amount` is a ceiling, and add the late
case to the *Pay Off a Loan* tutorial. Better, accept a late payment without a
flag — the ledger already knows `NextPaymentDueDate`.

### 2. `LossUnrealized` exists, and the obvious share price misses it

Impairing a loan does write a paper loss — into `LossUnrealized`, which is **not
deducted from `AssetsTotal`**. A vault holding 5 XRP against a 3 XRP impaired loan
reads `AssetsTotal: 5000002`, `AssetsAvailable: 2000001`,
`LossUnrealized: 3000001`. So `AssetsTotal / OutstandingAmount` — the formula
anyone writes — gives **1.000000**, where the value net of the loss is
**0.400000**: a client unaware of the field **overstates the share by 150 %**,
exactly when its holder needs the truth.
`C8678C1C0A10BE889124F40C03017038654B278E2D464FAC54784F55B35318FC`

We wrote `lib/nav.mjs` specifically to read vault state, with this protocol's traps
already commented in it, and it still missed the field: optional in the TS model,
**absent from the node when zero** so invisible throughout development, and in none
of the `vault_info` examples we read. This repo now holds two share-price
implementations that disagree by a factor of 2.5.

**The pattern behind it: four fields vanish at zero** — `AssetsAvailable`,
`AssetsMaximum`, `LossUnrealized` on `Vault`, `PaymentRemaining` and
`TotalValueOutstanding` on a repaid `Loan`. Three fail loudly (`BigInt(undefined)`
throws); `LossUnrealized` returns **a wrong, plausible number**.

**Proposal.** Return zero-valued numeric fields explicitly as `"0"`, say that
`AssetsTotal` is **gross of unrealized losses**, and return `SharePriceNet` from
the node — the one number every integrator displays.

### 3. "First-loss capital" absorbs half a percent of the first loss

Two setups, 12.5× apart, both matching
`DebtTotal × CoverRateMinimum × CoverRateLiquidation` to the drop:

| | vault | loan | cover posted | **cover taken** | **depositor loss** | share value |
|---|---|---|---|---|---|---|
| A | 200 XRP | 50 | 50 | **0.25** | **49.75** | 1.000 → 0.751 |
| B | 5 XRP | 4 | 1 | **0.02** | **3.98** | 1.000 → **0.204** |

In B the depositor lost **79.6 %** while 0.98 XRP of cover sat untouched — then the
broker took all of it: a default zeroes `DebtTotal`, dropping the cover floor to
zero, so `LoanBrokerCoverWithdraw` of the remainder returned `tesSUCCESS` **in the
same minute** `68DD97D949602FD470E0FA80B2526C3FDCFA3449095F7A7879F4D4430845D45E`.
Defaults A `91F458E3E6244E1C3005345C5C83CDFAF0E8A1AF6E5587E100C302CA56743BC7` and
B `923F7D616B094C82197506CF2867907A93067041E3990D24BD07A19035F73EAC`.

The behaviour matches the documented formula — the **name** misleads.
`CoverRateLiquidation: 5 %` reads as "5 % of the default is covered"; it is 5 % *of
the minimum requirement*, a product of two rates, two orders of magnitude out, and
unfixable once a loan is originated.

**Proposal.** Rename to `CoverLiquidationFractionOfMinimum` or make it a fraction of
the defaulted amount; **gate `LoanBrokerCoverWithdraw` after a default**; and offer
a dry run — "a default of X leaves Y to depositors" — which would have told us in
seconds what cost us a real default on a real vault.

### 4. `AssetsMaximum: 0` removes the cap instead of freezing deposits

`VaultSet` exposes only `Data`, `AssetsMaximum` and `DomainID`, so closing a vault
to deposits reads as `AssetsMaximum: 0`. It does the opposite: the cap is
**disabled**, the field **disappears from the node**, and a deposit beyond the old
cap succeeds — on a vault capped at 5 XRP holding 3, a 4 XRP deposit brought it to
7 `BC83AEB1A369CB773B8566BBBCC6D7FA62E8A3720C0AA9B6AC9872064F512612`. The real
freeze is `AssetsMaximum = AssetsTotal`, written nowhere. And there is a ratchet:
afterwards no cap below the outstanding balance can be set again
(`tecLIMIT_EXCEEDED` `A964C7CD371F0FED745B58F0B8449B3D2F460FFACD7B6C3293C229F0D82897A4`),
so an accidental `0` is **irreversible while depositors remain**.

**Proposal.** Document that `0` disables the cap, return it explicitly, and add a
`tfVaultFreezeDeposits` flag — the primitive actually being reached for.

### The other six, with their evidence

| Finding | Result | Hash / metric |
|---|---|---|
| **A depositor's dashboard costs 8 RPC calls and 6 hand-built formulas.** `vault_info` returns 17 raw fields; vault → loans has **no index** (know `Owner`, scan its 39 objects, filter on `LoanBroker` + `VaultID`, then query the broker's *pseudo-account*) | — | read-only |
| **`loan_info` / `loan_broker_info` / `mpt_holders` do not exist**, though `vault_info` does — so co-depositors cannot be enumerated even though `WithdrawalPolicy` is first-come-first-served | `unknownCmd` | — |
| **`VaultWithdraw` is in shares, its limit `AssetsAvailable` in assets**, with no conversion offered: integer division lands a drop over the limit | — | 9 of 10 withdrawals partial |
| **One code for two opposite remedies**: cover saturated with liquidity ample at 8.5 XRP, then liquidity short with cover ample at capacity 52. "Deposit cover" vs "wait for depositors" | `tecINSUFFICIENT_FUNDS` | `5DC3A6E00F31DA82C69AB77669C64691BD71CAC49C169736F53D7C724147618B` (cover) · liquidity case in the raw log |
| **`signLoanSetByCounterparty` signs the wrong payload** (`encodeForSigning` where `rippled` wants `encodeForSigningCounterparty`), so `LoanSet` is unusable through the documented helper | local rejection | fix in [`raw-submit.mjs`](./scripts/raw-submit.mjs) |
| **An enabled amendment flag does not mean its rules are enforced.** `LendingProtocolV1_1` reports `enabled: true`, and `LoanBrokerSet` then succeeds on **both** vault kinds — though the V1.1 matrix marks open-ended ❌. We nearly redesigned the project around it. The gap is surgical, not a stale devnet: the new fields, the date validation (`tecEXPIRED`, `temMALFORMED`) and the phase locks (`tecEXPIRED` on deposit, `tecTOO_SOON` on withdrawal during the investment period) are all enforced as documented. Only the broker restriction is absent. Someone *relying* on it reasons worse than we did | `tesSUCCESS` on both | open-ended `781F54B5E77A768F4C02A54E3C55902AA9F1AC96AA04037AB97CE93FFB5DBDE4` · closed-ended `1961BE21CC4011F50AA926E1494E9D51F94FC57B0E9C0C1B8F8ADF6FEDD09D40` |
| **`tfLoanImpair` is refused *before* the due date**, though the tutorial presents pre-emptive impairment as its purpose | `tecTOO_SOON` | refused at due−13 s, accepted at due+5 s |
| **Only ports 51233/51234, no 443 fallback** — guest Wi-Fi accepts the TCP handshake on both, then routes nothing above it, so `nc -z` is a false positive and only a full `server_info` detects it. Three outages, one cause: 443 answered every time (GitHub 47 ms, faucet 320 ms). And `xrpl.js` has **no JSON-RPC transport** — `Client` is WebSocket-only — so during the window where 51234 still answered we hand-rolled `autofill` and `submitAndWait` over HTTP to reach a live ledger. The faucet also **cannot refill an existing account**, ignoring `destination` | — | 45 min lost; ~30 lines of fallback |

### One code, several causes — the recurring shape

`tecLIMIT_EXCEEDED` covers three situations (deposit over cap, cap under balance,
`DebtMaximum` under `DebtTotal`) · `tecINSUFFICIENT_FUNDS` the two opposites above ·
`tecNO_PERMISSION` both "you may not" and "the state does not allow it" ·
`tecNO_AUTH` both "the recipient has not authorized", fixable in one transaction,
and "these shares can never be transferred". A non-transferable vault is itself
indistinguishable on the `Vault` node: `Flags` is 0 either way, the only trace being
a *missing* bit 32 in `shares`. The protocol *can* name a cause —
`tecHAS_OBLIGATIONS` does it perfectly — which is why the rest is worth fixing.

---

### What worked well

- **`tecHAS_OBLIGATIONS`** on the three delete transactions names its cause without
  reading a node. The model the other codes should follow.
- **`VaultDelete` cleans up third-party `MPToken` objects** and refunds their
  reserve. We expected an orphan-reserve leak; there is none.
- **The cover floor is enforced to the drop**, and `CoverRateMinimum`,
  `CoverRateLiquidation` and `ManagementFeeRate` are **immutable** once the broker
  exists, so it cannot lower the protection it promised. Non-transferability
  likewise resists `EscrowCreate` — the subtle path — even though escrow bypasses
  the `MPTokenAuthorize` requirement `Payment` enforces.

### Limits of this test

- **XRP only**, so both clawback transactions could only be seen refusing: they
  need an asset with an issuer, and their working behaviour is untested.
- **Compressed schedules** (60–90 s, not months), so accrual rounding over real
  terms is untested. When `tfLoanDefault` succeeded both the grace period and the
  term had passed, so that threshold is not isolated.
- **Untested:** fee redirection to cover below the minimum, Permissioned Domains and
  Credentials, `DomainID`, `tfVaultPrivate`. One build, `3.4.0-rc1`.
- Six claims in our raw log were **corrected in place** after re-reading the docs,
  each marked with its correction time — including one where we had wrongly called a
  documented limit undocumented.

### Top 3 recommendations

1. **Return zero-valued fields, and return derived quantities.** Explicit `"0"`
   across `Vault` and `Loan`, plus `SharePriceNet`, `MaxWithdrawable`,
   `SharesTransferable` and `DebtCapacity` in `vault_info`. One change removes a
   whole class of silent client bugs — including ours.
2. **Make every `tec` name its cause.** Four codes currently cover two to four
   unrelated situations, several calling for opposite actions.
3. **Document the late-payment path:** `tecEXPIRED` in the `LoanPay` error cases,
   `tfLoanLatePayment` as required, `Amount` as a ceiling, and a late case in the
   tutorial. Today the only documented path is the one needing no flag.

### Bonus contribution

- **A working `LoanSet` counterparty signer**, replacing the broken SDK helper —
  offered as an `xrpl.js` pull request.
- **Two doc typos** for one PR on `XRPLF/xrpl-dev-portal`: `PrincipleOutstanding` →
  `PrincipalOutstanding`, and `depostitor`.
- **A one-line SDK fix:** `validateVaultCreate` should check `WithdrawalPolicy`
  against the `VaultWithdrawalPolicy` enum it already defines instead of `isNumber`
  — only `1` is valid, and 0, 2, 3, 99 and 255 all travel to the network to come
  back `temMALFORMED`.
- **[`_probe-inventory.mjs`](./scripts/_probe-inventory.mjs)** lists every live
  vault, broker and loan with the capital locked in them — it found 537 XRP we had
  stranded across ten vaults without noticing.
