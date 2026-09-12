# XRPL Lending Protocol: Developer Feedback

**Team** CY-HACK · DevEx pseudonym `late-quail-92` · https://github.com/charlyppr/xrpl-lending
**Track** 1, open-ended vault · XLS-65, XLS-66 and TokenEscrow
**Network** Custom Hackathon Devnet · `rippled` 3.4.0-rc1, hackathon branch · `LendingProtocolV1_1` and `fixCleanup3_4_0` enabled
**Library** `xrpl@4.6.0`. The 15 XLS-65/66 transaction types are typed. No raw JSON was needed.
**Time to first transaction** 50 minutes, of which 45 on blocked ports (finding 8)
**PDF with explorer screenshots** [`deck/feedback-report.pdf`](./deck/feedback-report.pdf)

**Verification.** The 143 transaction hashes cited in this report, the raw log and the README
were queried on the ledger before submission. All 143 are validated, with the type and result
code stated. Documentation statements were checked against XLS-65, XLS-66 and xrpl.org, library
statements against the `rippled` and `xrpl.js` source.
`node scripts/_probe-audit-hashes.mjs FEEDBACK.md FEEDBACK-RAW.md README.md`

| # | Finding | Category | Checked against |
|---|---|---|---|
| 1 | `fixCleanup3_4_0` changes impairment timing and the `LoanSet` counterparty signature. xrpl.org does not list it. | docs, amendments | ledger, XLS-66, rippled |
| 2 | A late `LoanPay` without `tfLoanLatePayment` returns `tecEXPIRED`. The xrpl.org `LoanPay` reference does not list this failure. | docs, error codes | ledger, XLS-66, xrpl.org |
| 3 | The first-loss capital covered 0.5 % of a defaulted loan. The broker then withdrew the remaining cover. | design, naming | ledger, xrpl.org |
| 4 | xrpl.org omits the sole-holder exception to share value. `LossUnrealized` is absent from the node while zero. | docs, UX | ledger, XLS-65, xrpl.org |
| 5 | `loan_info` and `loan_broker_info` do not exist. `mpt_holders` needs Clio, which the devnet does not expose. | missing primitive | ledger, xrpl.org |
| 6 | Four result codes each cover situations that call for different actions. | error codes | ledger |
| 7 | The hackathon build reverts the V1.1 `LoanBrokerSet` restriction. The event brief does not mention it. | event docs | ledger, rippled |
| 8 | The devnet listens only on ports 51233 and 51234. A filtered port and a stalled node show the same signature. | infrastructure | network tests |
| 9 | Closing a vault to deposits requires setting `AssetsMaximum` to `AssetsTotal`. | missing primitive | ledger, xrpl.org |
| 10 | Vault shares carry `lsfMPTCanTrade`. `OfferCreate` with a share amount returns `temDISABLED`. | docs, MPT | ledger, xrpl.org |

---

### 1. `fixCleanup3_4_0` is enabled and not listed on xrpl.org

The `feature` command reports `fixCleanup3_4_0` as enabled on the devnet. The xrpl.org
*Known Amendments* page does not list it. The amendment changes two lending behaviours.

**Impairment.** XLS-66, section 3.10.4.2, condition 9: with `fixCleanup3_4_0`, `tfLoanImpair`
fails while `currentTime <= NextPaymentDueDate`. The xrpl.org tutorial *Manage a Loan* says a
broker can "*manually impair a loan before a payment due date passes*".

| Time relative to `NextPaymentDueDate` | `LoanManage` with `tfLoanImpair` |
|---|---|
| 31 s before | `tecTOO_SOON` |
| 13 s before | `tecTOO_SOON` |
| 5 s after | `tesSUCCESS` `5486020BA8FF227C58409042F96BDC07246FDACC3F9B0EF24749555E319E972E` |

**Counterparty signature.** rippled PR #8162: with `fixCleanup3_4_0`, `CounterpartySignature`
uses the `CPT` signing prefix. In `xrpl@4.6.0`, `signLoanSetByCounterparty` signs with
`encodeForSigning`, the previous prefix, and has no option to change it. Its `LoanSet` fails
local checks with `Counterparty: Invalid signature`. The same `LoanSet` signed with
`encodeForSigningCounterparty` from `ripple-binary-codec` returned `tesSUCCESS`
(`23631C3610DA97926E8BF9FC5BC4E76E504C9DFB2683C928E825DE0138397B2B`).

### 2. A late `LoanPay` without `tfLoanLatePayment` returns `tecEXPIRED`

A loan 10 s past `NextPaymentDueDate`, within its grace period, rejected four `LoanPay`
transactions with `tecEXPIRED`: the instalment, the instalment plus `LatePaymentFee`, the full
balance, and a payment with `tfLoanFullPayment`. The same payment with `tfLoanLatePayment`
(262144) returned `tesSUCCESS`.

- XLS-66, section 3.11.4.2, condition 11 defines this failure. The xrpl.org `LoanPay` reference lists eight error codes, and `tecEXPIRED` is not among them.
- xrpl.org describes `tfLoanLatePayment` as "*Indicates that the borrower is making a late loan payment*".
- The explorer shows `tfLoanImpair` and `tfLoanDefault` by name, and `tfLoanLatePayment` as `0x00040000`.
- No field of the `Loan` node changed during 85 s of lateness, and no field holds the accrued late interest. A payment of `ceil(PeriodicPayment) + LoanServiceFee + LatePaymentFee` returned `tecINSUFFICIENT_PAYMENT`. A payment of 2 765 001 drops returned `tesSUCCESS`, and 765 003 drops were taken.

`Flags: 0` → `tecEXPIRED` `96C3870480E4CB0C9E3B925F2965347DA0815A486CDB4B49545928E32D6B0BA4` ·
`Flags: 262144` → `tesSUCCESS` `EFAD383F9B622357CE67CBB0518D9F9F5FC27BE611D43F26FD69427713FB608F` ·
overpayment `9A7589384C5142703AFFACBB91B12E223EC734F7ACBE51272A87525FE4EE9CA8`

### 3. The first-loss capital covered 0.5 % of a defaulted loan

Both brokers used `CoverRateMinimum` 10 % and `CoverRateLiquidation` 5 %.

| Vault | Loan | Cover | Cover taken | Depositor loss | Share value |
|---|---|---|---|---|---|
| 200 XRP | 50 | 50 | 0.25 | 49.75 | 1.000 → 0.751 |
| 5 XRP | 4 | 1 | 0.02 | 3.98 | 1.000 → 0.204 |

On both vaults the cover taken equals `debt × 10 % × 5 %` to the drop. The xrpl.org Lending
Protocol page gives this formula, with an example that covers 1 % of the debt.
`CoverRateLiquidation` applies to the minimum cover (`DebtTotal × CoverRateMinimum`), not to the
defaulted amount. After a default, `DebtTotal` is zero and so is the cover floor.

Second vault, in ledger order:

| Time (UTC) | Transaction | Result |
|---|---|---|
| 14:23:50 | `VaultWithdraw` of all shares | `tecINSUFFICIENT_FUNDS` `D91BA47E816FDA60F9BBAD7F100B383099D87021B08DE065E841B9E8E34AFE2D` |
| 14:27:01 | `LoanManage` `tfLoanDefault` | `tesSUCCESS`, 0.02 XRP from the cover to the vault `923F7D616B094C82197506CF2867907A93067041E3990D24BD07A19035F73EAC` |
| 14:27:11 | `VaultWithdraw` of all shares | `tesSUCCESS`, 1.02 XRP `3338BA629F8772CDEC07B6F714F2AF3A1ADC8E93642429A54B95CF372FDB2880` |
| 14:27:22 | `LoanBrokerCoverWithdraw` 0.98 XRP | `tesSUCCESS` `68DD97D949602FD470E0FA80B2526C3FDCFA3449095F7A7879F4D4430845D45E` |

First vault default: `91F458E3E6244E1C3005345C5C83CDFAF0E8A1AF6E5587E100C302CA56743BC7`

### 4. Share value and `LossUnrealized`

XLS-65 computes the assets returned on redemption as
`shares × (AssetsTotal − LossUnrealized) / total shares`, and waives the `LossUnrealized`
deduction when the withdrawer is the sole outstanding shareholder. The xrpl.org Single Asset
Vault page gives the formula and does not mention the exception.

- The `Vault` node has no `LossUnrealized` field until an impairment writes one. Impairment `C8678C1C0A10BE889124F40C03017038654B278E2D464FAC54784F55B35318FC` moved it from absent to `"3000001"`, with `AssetsTotal` at `"5000002"`.
- `AssetsAvailable`, `AssetsMaximum`, `PaymentRemaining` and `TotalValueOutstanding` are also absent from their node when zero.
- The explorer's *Detailed* tab shows "*It modified a node with type Vault*" without field values. `LossUnrealized` appears in the *Raw* tab once the node is expanded.

### 5. Read commands

`vault_info` is a `rippled` command. `loan_info` and `loan_broker_info` return `unknownCmd` and
have no documentation page. xrpl.org documents `mpt_holders` as Clio-only. The devnet endpoints
serve `rippled`, where `mpt_holders` returns `unknownCmd`.

A depositor's view takes five calls:

| Call | Returns |
|---|---|
| `vault_info` | vault totals, share issuance and share flags |
| `account_objects`, type `mptoken`, on the depositor | the depositor's shares |
| `account_objects` on the vault owner | the broker, found by filtering on `VaultID` |
| `account_objects`, type `loan`, on the broker's pseudo-account | the loans |
| `mpt_holders` | `unknownCmd` |

Six values are computed client-side: gross share value, net share value, position value,
withdrawable amount, utilisation and broker debt capacity.

### 6. Four result codes cover situations that call for different actions

| Code | Situations observed | Hash |
|---|---|---|
| `tecINSUFFICIENT_FUNDS` | `LoanSet` above the cover limit | `5DC3A6E00F31DA82C69AB77669C64691BD71CAC49C169736F53D7C724147618B` |
| | `LoanSet` above the vault liquidity | `B92A90F59EBF79108B5414F61A12656F321EBC264E1BB186FCC14CAF259F9CAA` |
| | `LoanBrokerCoverWithdraw` below the cover floor | `4FB4A2B0D01DD2411A5E8592680D50B1F4CCA51ED97C243C2A506516262F1370` |
| `tecLIMIT_EXCEEDED` | `VaultDeposit` above `AssetsMaximum` | `132BAF7C1B8208E695A453C0EE061BC5E3528FC97571589D8A2EA66F027B5B4F` |
| | `VaultSet` with `AssetsMaximum` below `AssetsTotal` | `37053F15A20E6153EDBAD2DE6DD48E039E7A234328382A58DD97607FA88C3DC6` |
| | `LoanBrokerSet` with `DebtMaximum` below `DebtTotal` | `82C14ED4071391EC1EF25637D2FEC28CF784BB19FEB4E89082A64CD9748E4121` |
| `tecNO_PERMISSION` | `tfLoanImpair` sent by the borrower | `F030419492FB6A9A8CD4BA3015E8A55A9A86B9A1288A6458C5CC36475DE2C112` |
| | `tfLoanUnimpair` sent by the broker on a loan that is not impaired | `13975FD33EFA2F97D3120920E6F613BAFB95D09459350E7693C207E66AA24537` |
| `tecNO_AUTH` | `Payment` of shares to an account without `MPToken` | `789AAF7E228CC085199E2FB38B07A10DFC68A45C76C5FC3EFDB498BC5FD512A4` |
| | `Payment` of non-transferable shares to an authorized account | `E9DE504D40B8AB27F7C7EA433B0C1E68DC91854AA04A5D600163A64DB8BE5FD9` |

`tecHAS_OBLIGATIONS` names a single cause on `VaultDelete`, `LoanBrokerDelete` and `LoanDelete`.

### 7. The hackathon build reverts the V1.1 `LoanBrokerSet` restriction

The V1.1 documentation states "*`LoanBrokerSet` is restricted on open-ended vaults*". The
`feature` command reports `LendingProtocolV1_1` as enabled. `LoanBrokerSet` returned `tesSUCCESS`
on an open-ended vault (`781F54B5E77A768F4C02A54E3C55902AA9F1AC96AA04037AB97CE93FFB5DBDE4`) and
on a closed-ended vault (`1961BE21CC4011F50AA926E1494E9D51F94FC57B0E9C0C1B8F8ADF6FEDD09D40`).
rippled PR #8076 added the restriction. A commit titled "*Revert "fix: Reject open-ended vaults
at LoanBrokerSet (#8076)"*" removed it from the lending hackathon branch on 10 September 2026.
The other V1.1 rules tested (new fields, date validation, phase locks) are enforced. The event
brief does not mention the revert.

### 8. Ports 51233 and 51234

The documented endpoints use ports 51233 (WebSocket) and 51234 (JSON-RPC). No endpoint is
documented on port 443. On a Wi-Fi network, `nc -z` succeeded on both ports while `curl` on
51234 returned 0 bytes, and `portquiz.net:51234` timed out. The same signature appeared five
times during the event: three occurrences were traced to the local network, two could not be
attributed. The first cost 45 minutes. `xrpl.js` `Client` uses WebSocket only. The faucet
ignores the `destination` field and creates a new account.

### 9. Closing a vault to deposits

The xrpl.org `Vault` entry and XLS-65 define `AssetsMaximum: 0` as no cap. The `VaultSet`
reference does not repeat it. `VaultSet` exposes `Data`, `AssetsMaximum` and `DomainID`, and no
flag closes a vault to deposits. Setting `AssetsMaximum` equal to `AssetsTotal` blocks deposits:
a 1 XRP deposit then returns `tecLIMIT_EXCEEDED`
(`132BAF7C1B8208E695A453C0EE061BC5E3528FC97571589D8A2EA66F027B5B4F`).

### 10. Vault shares carry `lsfMPTCanTrade`

`vault_info` returns the share issuance with `Flags: 56`, which is `lsfMPTCanEscrow` (0x08),
`lsfMPTCanTrade` (0x10) and `lsfMPTCanTransfer` (0x20). `VaultCreate` has no field that sets
these flags. The xrpl.org `MPTokenIssuance` reference describes `lsfMPTCanTrade` as allowing
holders to "*trade their balances using the XRP Ledger DEX or AMM*". On the devnet, an
`OfferCreate` with a share amount returned `temDISABLED`. The `feature` list contains
`MPTokensV1` and `DynamicMPT`, and no amendment for MPT trading.

---

### What we ran

| Step | Transaction | Result | Hash |
|---|---|---|---|
| Open-ended vault | `VaultCreate` | `tesSUCCESS` | `A14CB64FFF00DC4D2E19E459DBB32212013FB510A8881D39E6888F20159502E4` |
| Deposit, 25 XRP | `VaultDeposit` | `tesSUCCESS` | `98A6A315146820D3487F2C1D847B6ACADCA0FFBEB5CE1985B97BB0CDFB772A0A` |
| Loan broker | `LoanBrokerSet` | `tesSUCCESS` | `A4A619AAE44033E42D4645705F20F7BA757687CB378D5A22506939DA6480C5A5` |
| First-loss capital, 5 XRP | `LoanBrokerCoverDeposit` | `tesSUCCESS` | `9DEA76E2866A4F0ED5E55998077CD6A7BD9BF2FDF5284D86E70612D330BF79BB` |
| Origination and drawdown | `LoanSet` | `tesSUCCESS` | `7E3006E82C7DF3ECC918093C0B2E93741A18B69A102BB8FD4EF825205F63BAB0` |
| Repayment | `LoanPay` | `tesSUCCESS` | `41B2EAAED6C2E2C4616108A33366CA1D5209CBCD8B65962C52FAE85C0E8EDC8C` |
| Withdrawal with yield | `VaultWithdraw` | `tesSUCCESS` | `53133F7685815723FBE734E7F98C78CA127E0E3413527C028F03D49C642895BE` |

All 15 XLS-65/66 transaction types were submitted at least once, including a full
`tfLoanImpair` then `tfLoanDefault` cycle.

Guardrails triggered on purpose:

| Transaction | Result | Hash |
|---|---|---|
| `LoanSet` of 5000 XRP against a vault holding 25 | `tecINSUFFICIENT_FUNDS` | `B92A90F59EBF79108B5414F61A12656F321EBC264E1BB186FCC14CAF259F9CAA` |
| `LoanPay` of 1 XRP against a 25.5 XRP instalment | `tecINSUFFICIENT_PAYMENT` | `77F708D6DDB803BE80738DE78936E6EDDD0640A153C8CCF68A5A460D1E0541B4` |
| `LoanBrokerCoverWithdraw` below `CoverRateMinimum` | `tecINSUFFICIENT_FUNDS` | `D91DEFCEF5D3765E0FD5A8AAC86D49891C68C52D10847F384042422D2595A60F` |
| `LoanBrokerSet` by an account that does not own the vault | `tecNO_PERMISSION` | `33742272A6C8CF7B37CD6D1E12E79AF28CD191FAB2E45F7017F1C224A0FA40A8` |
| `VaultWithdraw` above the unlent liquidity | `tecINSUFFICIENT_FUNDS` | `FB47313D52001E893E629975825807E8D368A9FE232AAD02B816967CD76DAAC4` |
| `LoanBrokerCoverWithdraw` that leaves the cover above the floor (control) | `tesSUCCESS` | `90BF019FC510EF8B2E083D6716E945CD53A4914723131EE38335FEE98C4279B2` |

Closed-ended vault, one transaction per phase:

| Phase | Transaction | Result | Hash |
|---|---|---|---|
| Subscription | `VaultDeposit` 20 XRP | `tesSUCCESS` | `2F8B4C3A9F9AD15234AC4457585701D335A9B0D816B6EC89A87C3D213E25E149` |
| Investment | `VaultDeposit` 10 XRP | `tecEXPIRED` | `85D62B2521FD08CC7BA9A3D0AC232DB5893C4A790E919D99CC16E3D2B42C92CA` |
| Investment | `VaultWithdraw` 5 XRP | `tecTOO_SOON` | `C5449EC0D1393C13FF4D04273655A71874A88AB15F8D04CA69A2985660386C5C` |
| Redemption | `VaultWithdraw` | `tesSUCCESS` | `F95FA55FF8DE52EE3B23DFA974734F1EE2EDA8B3213FAE7FE5DFD9E023F8D8E2` |

Secondary sale of vault shares with TokenEscrow (hashlock):

| Step | Transaction | Hash |
|---|---|---|
| Buyer opts in to the share MPT | `MPTokenAuthorize` | `79F48365FE3F5100E239F8CA11528AABE5FBAA657DEDB184AE96C433B32C5E31` |
| Buyer locks the payment | `EscrowCreate` | `1F29F998F40702EA8B5B6C3B2A4D5B896659717A277748E7B0D17755E539FBF8` |
| Seller locks the shares | `EscrowCreate` | `795D6AFE68DF7B71FD66F7984FAB29B35C0892127495705AF059A49AFB204099` |
| Buyer claims the shares with the preimage | `EscrowFinish` | `029559F027CBCA450F8BF25B3F5DD7BBFB77E952DC569E8616A54CFB1D26A179` |
| Seller claims the payment with the same preimage | `EscrowFinish` | `5F359ADB7BC18CD1F07609FFE8A8B0FA020187FA2290BB39BFF99FEF50BEF991` |

Lending-related amendments enabled on the devnet: `LendingProtocol`, `LendingProtocolV1_1`,
`SingleAssetVault`, `MPTokensV1`, `DynamicMPT`, `TokenEscrow`, `fixTokenEscrowV1`,
`fixCleanup3_2_0`, `fixCleanup3_4_0`, `BatchV1_1`, `PermissionedDomains`, `Credentials`.

### What worked

- `tecHAS_OBLIGATIONS` names its cause on the three delete transactions.
- `VaultDelete` removes third-party `MPToken` objects and refunds their reserve.
- The cover floor is enforced to the drop. `CoverRateMinimum`, `CoverRateLiquidation` and `ManagementFeeRate` return `temINVALID` when changed on an existing broker.
- The closed-ended vault phases behave as XLS-65 describes: deposits accepted then `tecEXPIRED`, withdrawals `tecTOO_SOON` then accepted.

### Limits

XRP only, so neither clawback transaction was tested with an issued asset. Payment schedules of
60 to 90 seconds. One build: the hackathon branch of `rippled` 3.4.0-rc1.

### Material in the repo

- [`scripts/raw-submit.mjs`](./scripts/raw-submit.mjs): a `LoanSet` counterparty signer using `encodeForSigningCounterparty`.
- [`scripts/_probe-audit-hashes.mjs`](./scripts/_probe-audit-hashes.mjs): checks every hash cited in a document against the ledger, and separates transaction hashes from ledger object IDs.
- [`deck/capture-explorer.mjs`](./deck/capture-explorer.mjs): the explorer screenshots in the PDF.
- Observed in passing: the Lending Protocol concept page spells `PrincipleOutstanding` and `depostitor`. `validateVaultCreate` in `xrpl@4.6.0` accepts any number for `WithdrawalPolicy`; the values 0, 2, 3, 99 and 255 reach the network and return `temMALFORMED`.
