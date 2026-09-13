# Exit Lane

A secondary exit for depositors of an open-ended XRPL vault whose capital is out on loans.

XRPL Lending Protocol Hackathon · DeVinci Blockchain x Ripple · Nanterre, 12-13 September 2026

## What it does

A corporate treasurer deposits spare cash in an open-ended Single Asset Vault. A loan broker lends
that capital to SMEs on fixed four-month terms. When every unit is on loan, her `VaultWithdraw`
returns `tecINSUFFICIENT_FUNDS`: the vault is open to withdrawals but has nothing left to pay out.

Exit Lane lets her sell her vault shares instead. Shares are MPTs. She sells them to a buyer at a 3%
discount to their vault value, through two escrows locked by the same PREIMAGE-SHA-256 condition:
the buyer claims the shares by publishing the preimage, and the seller uses that preimage to claim
the payment. The swap is atomic, the vault and the loan are untouched, and the buyer later redeems
the shares with their accrued yield.

`node scripts/demo.mjs` runs the full scenario, which covers the Track 1 minimum bar: vault
creation, deposit, broker and loan origination, drawdown, repayment, withdrawal with yield, and a
guardrail rejection.

## Track

Track 1, open-ended vault. Flavour: Loaded (XLS-65 + XLS-66 + TokenEscrow).

## Environment

| | |
|---|---|
| Protocol | Lending Protocol V1 |
| Network | Custom Hackathon Devnet (`network_id` 4001, `rippled` 3.4.0-rc1) |
| RPC | `https://lending-hackathon.dev.ripplex.io:51234` |
| WSS | `wss://lending-hackathon.dev.ripplex.io:51233` |
| Faucet | https://lending-hackathon-faucet.dev.ripplex.io/accounts |
| Explorer | https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/ |
| Vault asset | XRP |
| Node | v24.14.0 |

## Library version

`xrpl@4.6.0` (stable), pinned in [`package.json`](./package.json).

## Setup

```bash
git clone https://github.com/charlyppr/xrpl-lending
cd xrpl-lending
npm install
node scripts/check-connection.mjs    # network and library version
node scripts/setup-accounts.mjs      # funds lender, borrower, broker and spare accounts
node scripts/demo.mjs                # full scenario, --auto runs without pauses
node scripts/step-7-guardrails.mjs   # deliberate guardrail rejections
```

The devnet listens on ports 51233 and 51234 only. Networks that allow 80/443 only time out on both.

## XLS-65 / XLS-66 transactions used

All fifteen types were submitted and validated on the devnet. Every link below points to a
validated transaction.

| Transaction | Use in the project | Accepted | Rejected |
|---|---|---|---|
| `VaultCreate` | Open-ended XRP vault | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/A14CB64FFF00DC4D2E19E459DBB32212013FB510A8881D39E6888F20159502E4) | |
| `VaultDeposit` | Lender deposits 25 XRP | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/98A6A315146820D3487F2C1D847B6ACADCA0FFBEB5CE1985B97BB0CDFB772A0A) | |
| `VaultWithdraw` | Buyer redeems shares with accrued yield; withdrawal beyond available liquidity | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/53133F7685815723FBE734E7F98C78CA127E0E3413527C028F03D49C642895BE) | [`tecINSUFFICIENT_FUNDS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/FB47313D52001E893E629975825807E8D368A9FE232AAD02B816967CD76DAAC4) |
| `VaultSet` | Cap `AssetsMaximum` at `AssetsTotal`; cap below `AssetsTotal` | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/6DC46A2D238E4F16B9480525D63FACE4A3259084E206A6E5FF2BBC31B66CBDD4) | [`tecLIMIT_EXCEEDED`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/37053F15A20E6153EDBAD2DE6DD48E039E7A234328382A58DD97607FA88C3DC6) |
| `VaultDelete` | Delete an empty vault; delete a vault that still carries a broker and a loan | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E23FD79766486B2FDC038569CC1B9EBAE3FCF5E626DB5BB212B5699DEE1318BC) | [`tecHAS_OBLIGATIONS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/80CF578E955A35BAB856AF2D969C71B4E6C5FB380B8D64E608C4094C5F87FC29) |
| `VaultClawback` | Clawback by the vault owner on an XRP vault | | [`tecNO_PERMISSION`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E110F2CA3B076B2B36F7089DFD9D3C352C3DB340FA50831776CA0014A2C3534F) |
| `LoanBrokerSet` | Broker on the vault; broker set by a non-owner of the vault | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/A4A619AAE44033E42D4645705F20F7BA757687CB378D5A22506939DA6480C5A5) | [`tecNO_PERMISSION`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/33742272A6C8CF7B37CD6D1E12E79AF28CD191FAB2E45F7017F1C224A0FA40A8) |
| `LoanBrokerCoverDeposit` | 5 XRP of first-loss cover | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/9DEA76E2866A4F0ED5E55998077CD6A7BD9BF2FDF5284D86E70612D330BF79BB) | |
| `LoanBrokerCoverWithdraw` | Withdrawal above `CoverRateMinimum`; withdrawal breaching it | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/90BF019FC510EF8B2E083D6716E945CD53A4914723131EE38335FEE98C4279B2) | [`tecINSUFFICIENT_FUNDS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D91DEFCEF5D3765E0FD5A8AAC86D49891C68C52D10847F384042422D2595A60F) |
| `LoanBrokerCoverClawback` | Clawback by the broker on an XRP broker | | [`tecNO_PERMISSION`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/DBBBA2F3B1313BD205EE33AAA9091787954AA5410E2595ED32AE43562C0A0E8D) |
| `LoanBrokerDelete` | Delete a broker with no loan; delete a broker with a live loan | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/604C28B3075477182F41503FBC4030A1092977E4DCE76D70EF50AB1731C1C432) | [`tecHAS_OBLIGATIONS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/8024101A0F7DBDD5D68579101DF1FFD78FA8A2DE34C379DD06C975EFD7B5372B) |
| `LoanSet` | Origination and drawdown, signed by broker and borrower; 5000 XRP loan against a 25 XRP vault | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/7E3006E82C7DF3ECC918093C0B2E93741A18B69A102BB8FD4EF825205F63BAB0) | [`tecINSUFFICIENT_FUNDS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/B92A90F59EBF79108B5414F61A12656F321EBC264E1BB186FCC14CAF259F9CAA) |
| `LoanPay` | Repayment of 6.478077 XRP; 1 XRP against a 25.5 XRP instalment; late payment without `tfLoanLatePayment` | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/41B2EAAED6C2E2C4616108A33366CA1D5209CBCD8B65962C52FAE85C0E8EDC8C) | [`tecINSUFFICIENT_PAYMENT`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/77F708D6DDB803BE80738DE78936E6EDDD0640A153C8CCF68A5A460D1E0541B4), [`tecEXPIRED`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/96C3870480E4CB0C9E3B925F2965347DA0815A486CDB4B49545928E32D6B0BA4) |
| `LoanManage` | `tfLoanImpair` after the due date; `tfLoanDefault` after the grace period | [`impair`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5486020BA8FF227C58409042F96BDC07246FDACC3F9B0EF24749555E319E972E), [`default`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/923F7D616B094C82197506CF2867907A93067041E3990D24BD07A19035F73EAC) | |
| `LoanDelete` | Delete a defaulted loan | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D081B4A128C57FFA4F6149512549936B5E46AFBE95DE01E27EC587164FBE9840) | |

All fifteen types are typed in `xrpl@4.6.0` and none was built as raw JSON. `LoanSet` has no
separate drawdown transaction: it sends the principal to the borrower. The borrower's
`CounterpartySignature` is produced by our signer in
[`scripts/raw-submit.mjs`](./scripts/raw-submit.mjs), because `signLoanSetByCounterparty` in
`xrpl@4.6.0` uses the signing prefix that `fixCleanup3_4_0` replaced.

## Share swap transactions

The five transactions of the Exit Lane swap, from one `demo.mjs` run.

| Step | Transaction | Signed by | Link |
|---|---|---|---|
| Buyer opts in to the share MPT | `MPTokenAuthorize` | buyer | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/79F48365FE3F5100E239F8CA11528AABE5FBAA657DEDB184AE96C433B32C5E31) |
| Buyer locks the payment, expires at +2h | `EscrowCreate` | buyer | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/1F29F998F40702EA8B5B6C3B2A4D5B896659717A277748E7B0D17755E539FBF8) |
| Seller locks the shares, expires at +1h | `EscrowCreate` | seller | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/795D6AFE68DF7B71FD66F7984FAB29B35C0892127495705AF059A49AFB204099) |
| Buyer claims the shares and reveals the preimage | `EscrowFinish` | buyer | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/029559F027CBCA450F8BF25B3F5DD7BBFB77E952DC569E8616A54CFB1D26A179) |
| Seller claims the payment with the preimage read from the ledger | `EscrowFinish` | seller | [`tesSUCCESS`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/5F359ADB7BC18CD1F07609FFE8A8B0FA020187FA2290BB39BFF99FEF50BEF991) |

## Team

**CY-HACK**

| Name | GitHub |
|---|---|
| Charly Pupier | [@charlyppr](https://github.com/charlyppr) |
| Simon Hamelin | [@Simonhamel1](https://github.com/Simonhamel1) |
