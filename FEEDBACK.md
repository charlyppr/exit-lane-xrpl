# XRPL Lending Protocol: Developer Feedback

| | |
|---|---|
| **Track** | Track 1, open-ended vault |
| **Flavour** | Loaded: XLS-65, XLS-66, TokenEscrow |
| **Environment** | Custom Hackathon Devnet, `rippled` 3.4.0-rc1 (hackathon branch), `LendingProtocolV1_1` and `fixCleanup3_4_0` enabled |
| **Library and version** | `xrpl@4.6.0` |
| **Team** | CY-HACK, DevEx pseudonym `late-quail-92` |

Three-page version with explorer screenshots: [`FEEDBACK.pdf`](./FEEDBACK.pdf).

The 143 transactions cited in this report, the raw log and the README are validated on the
ledger, type and result code included
(`node scripts/_probe-audit-hashes.mjs FEEDBACK.md FEEDBACK-RAW.md README.md`). Documentation
claims are checked against XLS-65, XLS-66 and xrpl.org, library claims against the `rippled` and
`xrpl.js` source.

| # | Finding | Category | Severity |
|---|---|---|---|
| [1](#f1) | `fixCleanup3_4_0` is enabled and missing from xrpl.org | client libraries | 🔴 High |
| [2](#f2) | A late `LoanPay` without `tfLoanLatePayment` returns `tecEXPIRED` | documentation/tutorials | 🔴 High |
| [3](#f3) | First-loss capital covered 0.5 % of a defaulted loan | UX | 🔴 High |
| [4](#f4) | xrpl.org omits the sole-holder exception, and zero-valued fields are absent | documentation/tutorials | 🟠 Medium |
| [5](#f5) | No read command for loans or brokers | missing primitive | 🟠 Medium |
| [6](#f6) | One result code covers causes that need different actions | UX | 🟠 Medium |
| [7](#f7) | The hackathon build reverts the V1.1 `LoanBrokerSet` restriction | documentation/tutorials | 🟠 Medium |
| [8](#f8) | Vault shares carry `lsfMPTCanTrade`, but `OfferCreate` rejects them | documentation/tutorials | 🟠 Medium |
| [9](#f9) | No flag closes a vault to deposits | missing primitive | ⚪ Low |

**High**: blocks a minimum bar step, or misstates a depositor's risk. **Medium**: costs time or a
wrong design, with a workaround. **Low**: documented elsewhere, or cosmetic.

## The brief's questions

| Question | Answer |
|---|---|
| Vault, broker, loan | Clear. Only the vault owner can submit `LoanBrokerSet`. The drawdown has no transaction: `LoanSet` moves the principal ([`D19CD59F`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D19CD59FB93CCF28547533C76CC1AFA71CF592FD0EC9D0A9E217A9F6EAAD85DA)). |
| First-loss parameters | Not as named ([3](#f3)). |
| Multi-party `LoanSet` | Broker signs, borrower countersigns and submits. The `xrpl@4.6.0` helper fails here ([1](#f1)). |
| SDK or raw JSON | All 15 XLS-65/66 types are typed. No raw JSON. |
| Position and yield | Computed client-side from five calls ([5](#f5)). |
| Docs and explorer | The docs differ in [1](#f1), [2](#f2), [4](#f4), [8](#f8). The explorer hides a flag name ([2](#f2)) and `Vault` fields ([4](#f4)). |

## Findings

<a id="f1"></a>
### 1. `fixCleanup3_4_0` is enabled and missing from xrpl.org

🔴 **High** · client libraries · `xrpl@4.6.0`

The amendment is active on the devnet and absent from *Known Amendments*. It changes two lending
behaviours, and neither the tutorial nor `xrpl@4.6.0` reflects them.

**Impairment.** XLS-66, section 3.10.4.2, condition 9 rejects `tfLoanImpair` while
`currentTime <= NextPaymentDueDate`. The tutorial *Manage a Loan* still says a broker can impair
"*before a payment due date passes*".

**Counterparty signature.** Since rippled PR #8162, `CounterpartySignature` is signed with the
`CPT` prefix. `signLoanSetByCounterparty` signs with `encodeForSigning`, the previous prefix, and
offers no option.

**Repro steps**
1. `LoanSet` with `PaymentInterval` 60 and `GracePeriod` 60. `LoanManage` `tfLoanImpair` returns
   `tecTOO_SOON` 31 s and 13 s before `NextPaymentDueDate`, and `tesSUCCESS` 5 s after.
2. The broker signs a `LoanSet`, the borrower applies `signLoanSetByCounterparty` and submits:
   `Counterparty: Invalid signature`, a local check with no hash.
3. The same blob signed over `encodeForSigningCounterparty`
   ([`scripts/raw-submit.mjs`](./scripts/raw-submit.mjs)) returns `tesSUCCESS`.

**Transactions** impairment
[`5486020B`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5486020BA8FF227C58409042F96BDC07246FDACC3F9B0EF24749555E319E972E),
countersigned `LoanSet`
[`23631C36`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/23631C3610DA97926E8BF9FC5BC4E76E504C9DFB2683C928E825DE0138397B2B)

**Proposed fix** List `fixCleanup3_4_0` on *Known Amendments* with both lending changes. Update
*Manage a Loan*: impairment is accepted once `NextPaymentDueDate` has passed. In `xrpl.js`, sign
`CounterpartySignature` with `encodeForSigningCounterparty`, keeping the previous prefix as an
option for networks without the amendment.

<a id="f2"></a>
### 2. A late `LoanPay` without `tfLoanLatePayment` returns `tecEXPIRED`

🔴 **High** · documentation/tutorials · `xrpl@4.6.0`

Once `NextPaymentDueDate` has passed, every `LoanPay` without the flag fails, even within the
grace period: the instalment, the instalment with `LatePaymentFee`, the full balance, and
`tfLoanFullPayment`. XLS-66, section 3.11.4.2, condition 11 defines this failure; the xrpl.org
`LoanPay` reference lists eight error codes, not this one. The explorer shows the flag as
`0x00040000`, and no `Loan` field holds the accrued late interest.

**Repro steps**
1. `LoanSet` with `PaymentInterval` 90, `GracePeriod` 60, `PaymentTotal` 4
   ([`scripts/_probe-pay-states.mjs`](./scripts/_probe-pay-states.mjs)).
2. 10 s after the due date, `LoanPay` of `ceil(PeriodicPayment) + LoanServiceFee + LatePaymentFee`
   returns `tecEXPIRED` with `Flags: 0`, and `tesSUCCESS` with `Flags: 262144`.
3. With `LateInterestRate` 30 % ([`scripts/_probe-h2-race.mjs`](./scripts/_probe-h2-race.mjs)), the
   same amount returns `tecINSUFFICIENT_PAYMENT`. Sending 2 765 001 drops succeeds and takes
   765 003.

**Transactions** no flag
[`96C38704`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/96C3870480E4CB0C9E3B925F2965347DA0815A486CDB4B49545928E32D6B0BA4),
flag
[`EFAD383F`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/EFAD383F9B622357CE67CBB0518D9F9F5FC27BE611D43F26FD69427713FB608F),
late interest
[`9A758938`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/9A7589384C5142703AFFACBB91B12E223EC734F7ACBE51272A87525FE4EE9CA8)

**Proposed fix** Add `tecEXPIRED` to the `LoanPay` error table, with `tfLoanLatePayment` as the
remedy. Name the flag in the explorer. Expose the amount due now, late interest included, in a
`Loan` field or a read command.

<a id="f3"></a>
### 3. First-loss capital covered 0.5 % of a defaulted loan

🔴 **High** · UX · `xrpl@4.6.0`

Two brokers, both with `CoverRateMinimum` 10 % and `CoverRateLiquidation` 5 %:

| Vault | Loan | Cover | Taken | Loss | Share value |
|---|---|---|---|---|---|
| 200 XRP | 50 | 50 | 0.25 | 49.75 | 1.000 → 0.751 |
| 5 XRP | 4 | 1 | 0.02 | 3.98 | 1.000 → 0.204 |

The cover taken is `debt × 10 % × 5 %`, to the drop. This is the documented formula:
`CoverRateLiquidation` applies to the minimum cover, not to the defaulted debt, and the xrpl.org
example covers 1 % of the debt. After the default `DebtTotal` is zero, so is the cover floor, and
the broker withdrew the rest. Second vault, UTC:

| Time | Event | |
|---|---|---|
| 14:23:50 | `VaultWithdraw`: `tecINSUFFICIENT_FUNDS` | [`D91BA47E`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D91BA47E816FDA60F9BBAD7F100B383099D87021B08DE065E841B9E8E34AFE2D) |
| 14:27:01 | `tfLoanDefault`: 0.02 XRP from the cover | [`923F7D61`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/923F7D616B094C82197506CF2867907A93067041E3990D24BD07A19035F73EAC) |
| 14:27:11 | `VaultWithdraw`: 1.02 XRP | [`3338BA62`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/3338BA629F8772CDEC07B6F714F2AF3A1ADC8E93642429A54B95CF372FDB2880) |
| 14:27:22 | `LoanBrokerCoverWithdraw`: 0.98 XRP | [`68DD97D9`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/68DD97D949602FD470E0FA80B2526C3FDCFA3449095F7A7879F4D4430845D45E) |

**Repro steps**
1. [`node scripts/h1-default.mjs`](./scripts/h1-default.mjs), after `setup-accounts.mjs`: a
   200 XRP vault, 50 XRP of cover, one 50 XRP loan, defaulted after `GracePeriod`.
2. Compare `CoverAvailable` and `AssetsTotal` before and after the default.
3. `LoanBrokerCoverWithdraw` of the remaining cover returns `tesSUCCESS`.

**Transactions** first vault default
[`91F458E3`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/91F458E3E6244E1C3005345C5C83CDFAF0E8A1AF6E5587E100C302CA56743BC7)

**Proposed fix** Next to the formula, state the share of a defaulted debt the cover absorbs:
`CoverRateMinimum × CoverRateLiquidation`, 0.5 % at 10 % and 5 %. Hold `LoanBrokerCoverWithdraw`
for a set delay after a default, or state that no delay exists.

<a id="f4"></a>
### 4. xrpl.org omits the sole-holder exception, and zero-valued fields are absent

🟠 **Medium** · documentation/tutorials · `xrpl@4.6.0`

XLS-65 redeems shares at `(AssetsTotal − LossUnrealized) / total shares`, except for the sole
outstanding holder, who is not charged `LossUnrealized`. The xrpl.org Single Asset Vault page
gives the formula without the exception. `LossUnrealized` is absent until an impairment writes
it, as are `AssetsAvailable`, `AssetsMaximum`, `PaymentRemaining` and `TotalValueOutstanding` at
zero. The explorer's *Detailed* tab shows no field of the `Vault` node.

**Repro steps**
1. `vault_info` on a vault without an impaired loan: no `LossUnrealized` field.
2. `tfLoanImpair` on one of its loans, after `NextPaymentDueDate`.
3. `vault_info` returns `LossUnrealized` `"3000001"` with `AssetsTotal` `"5000002"`. Compare the
   explorer's *Detailed* and *Raw* tabs.

**Transactions** impairment
[`C8678C1C`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C8678C1C0A10BE889124F40C03017038654B278E2D464FAC54784F55B35318FC)

**Proposed fix** Add the sole-holder exception to the xrpl.org formula. Return zero-valued fields
as `"0"` in `vault_info`, or document their absence. Show changed field values in the explorer's
*Detailed* tab.

<a id="f5"></a>
### 5. No read command for loans or brokers

🟠 **Medium** · missing primitive · `xrpl@4.6.0`

A depositor's position takes five calls, then six values computed client-side in
[`scripts/lib/nav.mjs`](./scripts/lib/nav.mjs): gross and net share value, position value,
withdrawable amount, utilisation, broker debt capacity. `mpt_holders` is documented as
Clio-only, and the devnet serves `rippled`.

| Call | Returns |
|---|---|
| `vault_info` | totals, share issuance and flags |
| `account_objects` `mptoken` | the depositor's shares |
| `account_objects`, owner | the broker, filtered on `VaultID` |
| `account_objects` `loan` | the loans, on the broker's pseudo-account |
| `mpt_holders` | `unknownCmd` |

**Repro steps**
1. Send `loan_info` and `loan_broker_info` to the devnet JSON-RPC endpoint: `unknownCmd`. Neither
   has a documentation page.

**Proposed fix** Add `loan_broker_info` and `loan_info`, or list a vault's brokers and loans in
`vault_info`. Return share value, withdrawable amount and utilisation. Expose Clio on the devnet.

<a id="f6"></a>
### 6. One result code covers causes that need different actions

🟠 **Medium** · UX · `xrpl@4.6.0`

A broker who receives `tecINSUFFICIENT_FUNDS` on `LoanSet` cannot tell whether to add cover or
wait for deposits. Three other codes share the problem.

| Code | Cause | |
|---|---|---|
| `tecINSUFFICIENT_FUNDS` | `LoanSet` above the cover limit | [`5DC3A6E0`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5DC3A6E00F31DA82C69AB77669C64691BD71CAC49C169736F53D7C724147618B) |
| | `LoanSet` above the vault liquidity | [`B92A90F5`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B92A90F59EBF79108B5414F61A12656F321EBC264E1BB186FCC14CAF259F9CAA) |
| | `LoanBrokerCoverWithdraw` below the floor | [`4FB4A2B0`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4FB4A2B0D01DD2411A5E8592680D50B1F4CCA51ED97C243C2A506516262F1370) |
| `tecLIMIT_EXCEEDED` | `VaultDeposit` above `AssetsMaximum` | [`132BAF7C`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/132BAF7C1B8208E695A453C0EE061BC5E3528FC97571589D8A2EA66F027B5B4F) |
| | `AssetsMaximum` set below `AssetsTotal` | [`37053F15`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/37053F15A20E6153EDBAD2DE6DD48E039E7A234328382A58DD97607FA88C3DC6) |
| | `DebtMaximum` set below `DebtTotal` | [`82C14ED4`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/82C14ED4071391EC1EF25637D2FEC28CF784BB19FEB4E89082A64CD9748E4121) |
| `tecNO_PERMISSION` | `tfLoanImpair` sent by the borrower | [`F0304194`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/F030419492FB6A9A8CD4BA3015E8A55A9A86B9A1288A6458C5CC36475DE2C112) |
| | `tfLoanUnimpair` on an unimpaired loan | [`13975FD3`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/13975FD33EFA2F97D3120920E6F613BAFB95D09459350E7693C207E66AA24537) |
| `tecNO_AUTH` | shares sent to a holder without `MPToken` | [`789AAF7E`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/789AAF7E228CC085199E2FB38B07A10DFC68A45C76C5FC3EFDB498BC5FD512A4) |
| | non-transferable shares sent | [`E9DE504D`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E9DE504D40B8AB27F7C7EA433B0C1E68DC91854AA04A5D600163A64DB8BE5FD9) |

**Repro steps**
1. [`node scripts/_probe-cliffs.mjs`](./scripts/_probe-cliffs.mjs): a `LoanSet` above the cover
   limit with ample liquidity, then one above the liquidity with ample cover. Both return
   `tecINSUFFICIENT_FUNDS`.

**Proposed fix** Where one transaction type maps two causes to one code (`LoanSet`,
`LoanManage`, a `Payment` of shares), return distinct codes or a result message naming the check
that failed.

<a id="f7"></a>
### 7. The hackathon build reverts the V1.1 `LoanBrokerSet` restriction

🟠 **Medium** · documentation/tutorials · `xrpl@4.6.0`

The V1.1 documentation restricts `LoanBrokerSet` on open-ended vaults, a rule added by rippled PR
#8076. A revert of #8076 reached the lending hackathon branch on 10 September 2026. The other V1.1
rules tested (new fields, date validation, phase locks) are enforced. The event brief does not
mention the revert.

**Repro steps**
1. `feature`: `LendingProtocolV1_1` is enabled.
2. `LoanBrokerSet` on an open-ended vault returns `tesSUCCESS`.
3. `LoanBrokerSet` on a `VaultKind: 1` vault returns `tesSUCCESS`
   ([`scripts/_probe-h13-closed.mjs`](./scripts/_probe-h13-closed.mjs)).

**Transactions** open-ended
[`781F54B5`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/781F54B5E77A768F4C02A54E3C55902AA9F1AC96AA04037AB97CE93FFB5DBDE4),
closed-ended
[`1961BE21`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/1961BE21CC4011F50AA926E1494E9D51F94FC57B0E9C0C1B8F8ADF6FEDD09D40)

**Proposed fix** State in the event brief which V1.1 rules the hackathon build enforces, and that
the #8076 restriction is reverted.

<a id="f8"></a>
### 8. Vault shares carry `lsfMPTCanTrade`, but `OfferCreate` rejects them

🟠 **Medium** · documentation/tutorials · `xrpl@4.6.0`

`VaultCreate` sets `lsfMPTCanEscrow`, `lsfMPTCanTrade` and `lsfMPTCanTransfer` on the share
issuance, with no field to change them. The xrpl.org `MPTokenIssuance` reference says
`lsfMPTCanTrade` lets holders trade "*using the XRP Ledger DEX or AMM*". The devnet has no MPT
trading amendment, only `MPTokensV1` and `DynamicMPT`.

**Repro steps**
1. `vault_info`: `shares.Flags` is 56, that is 0x08, 0x10 and 0x20.
2. `OfferCreate` by a holder, `TakerGets` the share MPT, `TakerPays` XRP: `temDISABLED`, a local
   rejection with no hash ([`scripts/_probe-shares.mjs`](./scripts/_probe-shares.mjs)).

**Proposed fix** State on the `MPTokenIssuance` reference that DEX trading of MPTs needs an
amendment not yet available, or leave `lsfMPTCanTrade` unset on vault shares until then.

<a id="f9"></a>
### 9. No flag closes a vault to deposits

⚪ **Low** · missing primitive · `xrpl@4.6.0`

`VaultSet` exposes `Data`, `AssetsMaximum` and `DomainID`. The only way to stop deposits is a cap
equal to `AssetsTotal`. `AssetsMaximum: 0` means no cap in XLS-65 and the `Vault` entry; the
`VaultSet` reference does not repeat it.

**Repro steps**
1. `VaultSet` with `AssetsMaximum` equal to `AssetsTotal` returns `tesSUCCESS`.
2. A 1 XRP `VaultDeposit` returns `tecLIMIT_EXCEEDED`.

**Transactions** deposit refused
[`132BAF7C`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/132BAF7C1B8208E695A453C0EE061BC5E3528FC97571589D8A2EA66F027B5B4F)

**Proposed fix** Add a `VaultSet` flag that closes a vault to deposits. Repeat that `0` means no
cap on the `VaultSet` reference.

## Minor issues

| Issue | Category | Severity |
|---|---|---|
| The Lending Protocol concept page spells `PrincipleOutstanding` and `depostitor`. | documentation/tutorials | ⚪ Low |
| `validateVaultCreate` in `xrpl@4.6.0` accepts any `WithdrawalPolicy`; 0, 2, 3, 99 and 255 return `temMALFORMED`. | client libraries | ⚪ Low |
| The faucet ignores `destination` and funds a new account instead. | other | ⚪ Low |

## What worked

`tecHAS_OBLIGATIONS` names its cause on the three delete transactions. `VaultDelete` removes
third-party `MPToken` objects and refunds their reserve. The cover floor is enforced to the drop,
and cover rates cannot change on an existing broker (`temINVALID`). Closed-ended vault phases
behave as XLS-65 describes.

**Limits.** XRP only, so no clawback with an issued asset. Payment intervals of 60 to 90 s. One
build. The minimum bar run, the guardrails and the escrow swap are in the [README](./README.md).
