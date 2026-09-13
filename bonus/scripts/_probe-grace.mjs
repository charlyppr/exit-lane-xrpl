// GracePeriod: what is the minimum accepted? The docs say nothing about it.
import { Client, Wallet } from "xrpl";
import { NET, pctToRate } from "../../scripts/config.mjs";
import { loadAccounts, signLoanSetCounterparty } from "../../scripts/raw-submit.mjs";
const XRP = (n) => String(Math.round(n * 1_000_000));
const c = new Client(NET.wss); await c.connect();
const { borrower, broker } = loadAccounts();
const brokerW = Wallet.fromSeed(broker.seed), borrowerW = Wallet.fromSeed(borrower.seed);
const BROKER_ID = process.argv[2];
for (const g of [1, 10, 60, 300, 900, 1800, 3600]) {
  try {
    const prepared = await c.autofill({
      TransactionType: "LoanSet", Account: brokerW.address, LoanBrokerID: BROKER_ID,
      Counterparty: borrowerW.address, PrincipalRequested: XRP(1),
      InterestRate: pctToRate(8), PaymentInterval: 86_400, PaymentTotal: 4,
      GracePeriod: g, LoanOriginationFee: XRP(0.1), LoanServiceFee: XRP(0.1),
      LatePaymentFee: XRP(0.1), ClosePaymentFee: XRP(0.1),
    });
    const res = await c.submitAndWait(signLoanSetCounterparty(brokerW.sign(prepared).tx_blob, borrower.seed));
    console.log(`GracePeriod ${String(g).padStart(5)} -> ${res.result.meta?.TransactionResult}  ${res.result.hash}`);
    if (res.result.meta?.TransactionResult === "tesSUCCESS") break;
  } catch (e) { console.log(`GracePeriod ${String(g).padStart(5)} -> ${e.message.replace("Transaction failed, ", "").slice(0, 60)}`); }
}
await c.disconnect();
