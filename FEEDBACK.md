# XRPL Lending Protocol: Developer Feedback

| | |
|---|---|
| **Team** | CY-HACK · DevEx pseudonym `late-quail-92` · https://github.com/charlyppr/xrpl-lending |
| **Track** | 1, open-ended vault |
| **Flavour** | Loaded: XLS-65, XLS-66 and TokenEscrow |
| **Environment** | Custom Hackathon Devnet · `rippled` 3.4.0-rc1, hackathon branch · `LendingProtocolV1_1` and `fixCleanup3_4_0` enabled |
| **Library** | `xrpl@4.6.0`, for every finding. The 15 XLS-65/66 transaction types are typed. No raw JSON. One helper, `signLoanSetByCounterparty`, replaced by our own signer (finding 1) |
| **Time to first transaction** | 50 minutes, of which 45 on blocked ports (finding 8) |
| **Three-page version** | [`FEEDBACK.pdf`](./FEEDBACK.pdf), same content with explorer screenshots |

**Verification.** The 143 transaction hashes cited in this report, the raw log and the README
were queried on the ledger before submission. All 143 are validated, with the type and result
code stated. Documentation statements were checked against XLS-65, XLS-66 and xrpl.org, library
statements against the `rippled` and `xrpl.js` source.
`node scripts/_probe-audit-hashes.mjs FEEDBACK.md FEEDBACK-RAW.md README.md`

**Severity.** High: blocks a minimum bar step for any team, or misstates the risk a depositor
carries. Medium: costs time or a wrong design decision, with a workaround. Low: documented
elsewhere or cosmetic.

| # | Finding | Category | Severity | Library |
|---|---|---|---|---|
| 1 | `fixCleanup3_4_0` changes impairment timing and the `LoanSet` counterparty signature. xrpl.org does not list it, and the `xrpl.js` signing helper predates it. | client libraries | High | `xrpl@4.6.0` |
| 2 | A late `LoanPay` without `tfLoanLatePayment` returns `tecEXPIRED`. The xrpl.org `LoanPay` reference does not list this failure. | documentation/tutorials | High | `xrpl@4.6.0` |
| 3 | The first-loss capital covered 0.5 % of a defaulted loan. The broker then withdrew the remaining cover. | UX | High | `xrpl@4.6.0` |
| 4 | xrpl.org omits the sole-holder exception to share value. `LossUnrealized` is absent from the node while zero. | documentation/tutorials | Medium | `xrpl@4.6.0` |
| 5 | `loan_info` and `loan_broker_info` do not exist. `mpt_holders` needs Clio, which the devnet does not expose. | missing primitive | Medium | `xrpl@4.6.0` |
| 6 | Four result codes each cover situations that call for different actions. | UX | Medium | `xrpl@4.6.0` |
| 7 | The hackathon build reverts the V1.1 `LoanBrokerSet` restriction. The event brief does not mention it. | documentation/tutorials | Medium | `xrpl@4.6.0` |
| 8 | The devnet listens only on ports 51233 and 51234. A filtered port and a stalled node show the same signature. | other | Medium | `xrpl@4.6.0` |
| 9 | Closing a vault to deposits requires setting `AssetsMaximum` to `AssetsTotal`. | missing primitive | Low | `xrpl@4.6.0` |
| 10 | Vault shares carry `lsfMPTCanTrade`. `OfferCreate` with a share amount returns `temDISABLED`. | documentation/tutorials | Medium | `xrpl@4.6.0` |

### The six questions of the brief

1. **Vault, broker and loan.** Clear in the references: only the vault owner can submit
   `LoanBrokerSet`, so owner and broker are one account. The minimum bar's drawdown has no
   transaction: `LoanSet` moves the principal out of the vault
   ([`D19CD59F`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D19CD59FB93CCF28547533C76CC1AFA71CF592FD0EC9D0A9E217A9F6EAAD85DA)).
2. **First-loss parameters.** No. `CoverRateLiquidation` applies to the minimum cover, not to the
   defaulted debt (finding 3).
3. **Multi-party `LoanSet`.** The broker signs, the borrower adds `CounterpartySignature` and
   submits. Both wallets ran in one script. The `xrpl@4.6.0` helper for the second signature is
   rejected on this devnet (finding 1).
4. **SDK or raw JSON.** All 15 types are typed. No raw JSON. One helper replaced (finding 1).
5. **Position value, utilisation, liquidity, yield.** Not from ledger objects: five calls and six
   values computed client-side (finding 5), fields absent while zero (finding 4).
6. **Explorer and docs against the ledger.** The docs differ on findings 1, 2, 4 and 10. The
   explorer shows `tfLoanLatePayment` in hex (finding 2) and no `Vault` field values in its
   *Detailed* tab (finding 4).

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
| 5 s after | `tesSUCCESS` [`5486020B`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5486020BA8FF227C58409042F96BDC07246FDACC3F9B0EF24749555E319E972E) |

**Counterparty signature.** rippled PR #8162: with `fixCleanup3_4_0`, `CounterpartySignature`
uses the `CPT` signing prefix. In `xrpl@4.6.0`, `signLoanSetByCounterparty` signs with
`encodeForSigning`, the previous prefix, and has no option to change it. Its `LoanSet` fails
local checks with `Counterparty: Invalid signature`. The same `LoanSet` signed with
`encodeForSigningCounterparty` from `ripple-binary-codec` returned `tesSUCCESS`
([`23631C36`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/23631C3610DA97926E8BF9FC5BC4E76E504C9DFB2683C928E825DE0138397B2B)).

**Proposed fix.** List `fixCleanup3_4_0` on *Known Amendments* with its two lending changes.
Update *Manage a Loan*: impairment is accepted once `NextPaymentDueDate` has passed. In
`xrpl.js`, sign `CounterpartySignature` with `encodeForSigningCounterparty`, with the previous
prefix as an option for networks without the amendment.

### 2. A late `LoanPay` without `tfLoanLatePayment` returns `tecEXPIRED`

A loan 10 s past `NextPaymentDueDate`, within its grace period, rejected four `LoanPay`
transactions with `tecEXPIRED`: the instalment, the instalment plus `LatePaymentFee`, the full
balance, and a payment with `tfLoanFullPayment`. The same payment with `tfLoanLatePayment`
(262144) returned `tesSUCCESS`.

- XLS-66, section 3.11.4.2, condition 11 defines this failure. The xrpl.org `LoanPay` reference lists eight error codes, and `tecEXPIRED` is not among them.
- The explorer shows `tfLoanImpair` and `tfLoanDefault` by name, and `tfLoanLatePayment` as `0x00040000`.
- No field of the `Loan` node changed during 85 s of lateness, and no field holds the accrued late interest. A payment of `ceil(PeriodicPayment) + LoanServiceFee + LatePaymentFee` returned `tecINSUFFICIENT_PAYMENT`. A payment of 2 765 001 drops returned `tesSUCCESS`, and 765 003 drops were taken.

`Flags: 0` → `tecEXPIRED` [`96C38704`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/96C3870480E4CB0C9E3B925F2965347DA0815A486CDB4B49545928E32D6B0BA4) ·
`Flags: 262144` → `tesSUCCESS` [`EFAD383F`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/EFAD383F9B622357CE67CBB0518D9F9F5FC27BE611D43F26FD69427713FB608F) ·
overpayment [`9A758938`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/9A7589384C5142703AFFACBB91B12E223EC734F7ACBE51272A87525FE4EE9CA8)

**Proposed fix.** Add `tecEXPIRED` to the `LoanPay` error table, with `tfLoanLatePayment` as the
remedy. Name the flag in the explorer. Expose the amount due now, late interest included, in a
`Loan` field or a read command.

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

| Time (UTC) | Transaction | Result |
|---|---|---|
| 14:23:50 | `VaultWithdraw` of all shares | `tecINSUFFICIENT_FUNDS` [`D91BA47E`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D91BA47E816FDA60F9BBAD7F100B383099D87021B08DE065E841B9E8E34AFE2D) |
| 14:27:01 | `LoanManage` `tfLoanDefault` | `tesSUCCESS`, 0.02 XRP from the cover to the vault [`923F7D61`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/923F7D616B094C82197506CF2867907A93067041E3990D24BD07A19035F73EAC) |
| 14:27:11 | `VaultWithdraw` of all shares | `tesSUCCESS`, 1.02 XRP [`3338BA62`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/3338BA629F8772CDEC07B6F714F2AF3A1ADC8E93642429A54B95CF372FDB2880) |
| 14:27:22 | `LoanBrokerCoverWithdraw` 0.98 XRP | `tesSUCCESS` [`68DD97D9`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/68DD97D949602FD470E0FA80B2526C3FDCFA3449095F7A7879F4D4430845D45E) |

First vault default: [`91F458E3`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/91F458E3E6244E1C3005345C5C83CDFAF0E8A1AF6E5587E100C302CA56743BC7)

**Proposed fix.** Next to the formula, state the share of a defaulted debt the cover absorbs:
`CoverRateMinimum × CoverRateLiquidation`, 0.5 % at 10 % and 5 %. Hold
`LoanBrokerCoverWithdraw` for a set delay after a default, or state that no delay exists.

### 4. Share value and `LossUnrealized`

XLS-65 computes the assets returned on redemption as
`shares × (AssetsTotal − LossUnrealized) / total shares`, and waives the `LossUnrealized`
deduction when the withdrawer is the sole outstanding shareholder. The xrpl.org Single Asset
Vault page gives the formula and does not mention the exception.

- The `Vault` node has no `LossUnrealized` field until an impairment writes one. Impairment [`C8678C1C`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C8678C1C0A10BE889124F40C03017038654B278E2D464FAC54784F55B35318FC) moved it from absent to `"3000001"`, with `AssetsTotal` at `"5000002"`.
- `AssetsAvailable`, `AssetsMaximum`, `PaymentRemaining` and `TotalValueOutstanding` are also absent from their node when zero.
- The explorer's *Detailed* tab shows "*It modified a node with type Vault*" without field values. `LossUnrealized` appears in the *Raw* tab once the node is expanded.

**Proposed fix.** Add the sole-holder exception to the xrpl.org formula. Return zero-valued
fields as `"0"` in `vault_info`, or document their absence. Show changed field values in the
explorer's *Detailed* tab.

### 5. Read commands

`vault_info` is a `rippled` command. `loan_info` and `loan_broker_info` return `unknownCmd` and
have no documentation page. xrpl.org documents `mpt_holders` as Clio-only. The devnet endpoints
serve `rippled`, where `mpt_holders` returns `unknownCmd`. A depositor's view takes five calls:
`vault_info` (totals, share issuance and flags), `account_objects` of type `mptoken` on the
depositor (shares), `account_objects` on the vault owner filtered on `VaultID` (the broker),
`account_objects` of type `loan` on the broker's pseudo-account (the loans), and `mpt_holders`
(`unknownCmd`). Six values are computed client-side: gross share value, net share value,
position value, withdrawable amount, utilisation and broker debt capacity.

**Proposed fix.** Add `loan_broker_info` and `loan_info`, or list a vault's brokers and loans in
`vault_info`. Return share value, withdrawable amount and utilisation. Expose Clio on the devnet.

### 6. Four result codes cover situations that call for different actions

| Code | Situations observed | Hash |
|---|---|---|
| `tecINSUFFICIENT_FUNDS` | `LoanSet` above the cover limit | [`5DC3A6E0`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5DC3A6E00F31DA82C69AB77669C64691BD71CAC49C169736F53D7C724147618B) |
| | `LoanSet` above the vault liquidity | [`B92A90F5`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B92A90F59EBF79108B5414F61A12656F321EBC264E1BB186FCC14CAF259F9CAA) |
| | `LoanBrokerCoverWithdraw` below the cover floor | [`4FB4A2B0`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4FB4A2B0D01DD2411A5E8592680D50B1F4CCA51ED97C243C2A506516262F1370) |
| `tecLIMIT_EXCEEDED` | `VaultDeposit` above `AssetsMaximum` | [`132BAF7C`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/132BAF7C1B8208E695A453C0EE061BC5E3528FC97571589D8A2EA66F027B5B4F) |
| | `VaultSet` with `AssetsMaximum` below `AssetsTotal` | [`37053F15`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/37053F15A20E6153EDBAD2DE6DD48E039E7A234328382A58DD97607FA88C3DC6) |
| | `LoanBrokerSet` with `DebtMaximum` below `DebtTotal` | [`82C14ED4`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/82C14ED4071391EC1EF25637D2FEC28CF784BB19FEB4E89082A64CD9748E4121) |
| `tecNO_PERMISSION` | `tfLoanImpair` sent by the borrower | [`F0304194`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/F030419492FB6A9A8CD4BA3015E8A55A9A86B9A1288A6458C5CC36475DE2C112) |
| | `tfLoanUnimpair` sent by the broker on a loan that is not impaired | [`13975FD3`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/13975FD33EFA2F97D3120920E6F613BAFB95D09459350E7693C207E66AA24537) |
| `tecNO_AUTH` | `Payment` of shares to an account without `MPToken` | [`789AAF7E`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/789AAF7E228CC085199E2FB38B07A10DFC68A45C76C5FC3EFDB498BC5FD512A4) |
| | `Payment` of non-transferable shares to an authorized account | [`E9DE504D`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E9DE504D40B8AB27F7C7EA433B0C1E68DC91854AA04A5D600163A64DB8BE5FD9) |

`tecHAS_OBLIGATIONS` names a single cause on `VaultDelete`, `LoanBrokerDelete` and `LoanDelete`.

**Proposed fix.** Where one transaction type maps two causes to one code (`LoanSet`,
`LoanManage`, a `Payment` of shares), return distinct codes or a result message naming the
check that failed.

### 7. The hackathon build reverts the V1.1 `LoanBrokerSet` restriction

The V1.1 documentation states "*`LoanBrokerSet` is restricted on open-ended vaults*". The
`feature` command reports `LendingProtocolV1_1` as enabled. `LoanBrokerSet` returned `tesSUCCESS`
on an open-ended vault ([`781F54B5`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/781F54B5E77A768F4C02A54E3C55902AA9F1AC96AA04037AB97CE93FFB5DBDE4)) and
on a closed-ended vault ([`1961BE21`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/1961BE21CC4011F50AA926E1494E9D51F94FC57B0E9C0C1B8F8ADF6FEDD09D40)).
rippled PR #8076 added the restriction. A commit titled "*Revert "fix: Reject open-ended vaults
at LoanBrokerSet (#8076)"*" removed it from the lending hackathon branch on 10 September 2026.
The other V1.1 rules tested (new fields, date validation, phase locks) are enforced. The event
brief does not mention the revert.

**Proposed fix.** State in the event brief which V1.1 rules the hackathon build enforces, and
that the #8076 restriction is reverted.

### 8. Ports 51233 and 51234

The documented endpoints use ports 51233 (WebSocket) and 51234 (JSON-RPC). No endpoint is
documented on port 443. On a Wi-Fi network, `nc -z` succeeded on both ports while `curl` on
51234 returned 0 bytes, and `portquiz.net:51234` timed out. The same signature appeared five
times during the event: three occurrences were traced to the local network, two could not be
attributed. The first cost 45 minutes. `xrpl.js` `Client` uses WebSocket only. The faucet
ignores the `destination` field and creates a new account.

**Proposed fix.** Serve JSON-RPC and WebSocket on port 443. Fund the `destination` account from
the faucet instead of creating a new one.

### 9. Closing a vault to deposits

The xrpl.org `Vault` entry and XLS-65 define `AssetsMaximum: 0` as no cap. The `VaultSet`
reference does not repeat it. `VaultSet` exposes `Data`, `AssetsMaximum` and `DomainID`, and no
flag closes a vault to deposits. Setting `AssetsMaximum` equal to `AssetsTotal` blocks deposits:
a 1 XRP deposit then returns `tecLIMIT_EXCEEDED`
([`132BAF7C`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/132BAF7C1B8208E695A453C0EE061BC5E3528FC97571589D8A2EA66F027B5B4F)).

**Proposed fix.** Add a `VaultSet` flag that closes a vault to deposits. Repeat "`0` means no
cap" on the `VaultSet` reference.

### 10. Vault shares carry `lsfMPTCanTrade`

`vault_info` returns the share issuance with `Flags: 56`, which is `lsfMPTCanEscrow` (0x08),
`lsfMPTCanTrade` (0x10) and `lsfMPTCanTransfer` (0x20). `VaultCreate` has no field that sets
these flags. The xrpl.org `MPTokenIssuance` reference describes `lsfMPTCanTrade` as allowing
holders to "*trade their balances using the XRP Ledger DEX or AMM*". On the devnet, an
`OfferCreate` with a share amount returned `temDISABLED`. The `feature` list contains
`MPTokensV1` and `DynamicMPT`, and no amendment for MPT trading.

**Proposed fix.** State on the `MPTokenIssuance` reference that DEX trading of MPTs needs an
amendment not yet available, or leave `lsfMPTCanTrade` unset on vault shares until then.

---

The minimum bar run, the six guardrails, the closed-ended vault control and the escrow swap are
listed with explorer links in the [README](./README.md). All 15 XLS-65/66 transaction types were
submitted at least once, including a full `tfLoanImpair` then `tfLoanDefault` cycle.

**What worked.** `tecHAS_OBLIGATIONS` names its cause on the three delete transactions.
`VaultDelete` removes third-party `MPToken` objects and refunds their reserve. The cover floor is
enforced to the drop. `CoverRateMinimum`, `CoverRateLiquidation` and `ManagementFeeRate` return
`temINVALID` when changed on an existing broker. The closed-ended vault phases behave as XLS-65
describes.

**Limits.** XRP only, so neither clawback transaction was tested with an issued asset. Payment
schedules of 60 to 90 seconds. One build: the hackathon branch of `rippled` 3.4.0-rc1.
Lending-related amendments enabled: `LendingProtocol`, `LendingProtocolV1_1`, `SingleAssetVault`,
`MPTokensV1`, `DynamicMPT`, `TokenEscrow`, `fixTokenEscrowV1`, `fixCleanup3_2_0`,
`fixCleanup3_4_0`, `BatchV1_1`, `PermissionedDomains`, `Credentials`.

**Material in the repo.**
[`scripts/raw-submit.mjs`](./scripts/raw-submit.mjs): a `LoanSet` counterparty signer using
`encodeForSigningCounterparty`.
[`scripts/_probe-audit-hashes.mjs`](./scripts/_probe-audit-hashes.mjs): checks every hash cited
in a document against the ledger.
[`deck/capture-explorer.mjs`](./deck/capture-explorer.mjs): the explorer screenshots in the PDF.

**Observed in passing.** The Lending Protocol concept page spells `PrincipleOutstanding` and
`depostitor`. `validateVaultCreate` in `xrpl@4.6.0` accepts any number for `WithdrawalPolicy`;
the values 0, 2, 3, 99 and 255 reach the network and return `temMALFORMED`.
