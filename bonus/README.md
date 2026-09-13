# Bonus

Working material behind the submission. The deliverables are [`README.md`](../README.md),
[`FEEDBACK.md`](../FEEDBACK.md), [`FEEDBACK.pdf`](../FEEDBACK.pdf), [`deck/`](../deck) and
[`scripts/`](../scripts). Nothing in this folder is needed to run the demo.

## `notes/`

Written in French during the event.

| File | Content |
|---|---|
| [`FEEDBACK-RAW.md`](./notes/FEEDBACK-RAW.md) | Timestamped raw capture log with every hash. `FEEDBACK.md` is distilled from it. |
| [`HYPOTHESES.md`](./notes/HYPOTHESES.md) | Feedback hypotheses and their test status: confirmed, refuted, open. |
| [`PLAN.md`](./notes/PLAN.md) | Execution plan to the code freeze. |
| [`CHASSE.md`](./notes/CHASSE.md) | Briefing for the bug-hunting session: XRP budget per account, capture rules. |

## `scripts/`

Exploration and reproduction scripts. Run them from the repository root
after `node scripts/setup-accounts.mjs`; they reuse `scripts/config.mjs`, `scripts/raw-submit.mjs`
and `scripts/lib/`. Unless marked read-only, a script submits transactions and spends the test
accounts' devnet XRP.

### Cited in `FEEDBACK.md`

| Script | Finding |
|---|---|
| [`_probe-pay-states.mjs`](./scripts/_probe-pay-states.mjs), [`_probe-h2-race.mjs`](./scripts/_probe-h2-race.mjs) | 2, late `LoanPay` |
| [`h1-default.mjs`](./scripts/h1-default.mjs) | 3, first-loss capital on default |
| [`_probe-cliffs.mjs`](./scripts/_probe-cliffs.mjs) | 6, one code for two `LoanSet` causes |
| [`_probe-h13-closed.mjs`](./scripts/_probe-h13-closed.mjs) | 7, V1.1 `LoanBrokerSet` restriction |
| [`_probe-shares.mjs`](./scripts/_probe-shares.mjs) | 8, `OfferCreate` on vault shares |
| [`_probe-audit-hashes.mjs`](./scripts/_probe-audit-hashes.mjs) | Checks every hash cited in the deliverables on the ledger. Read-only. |

### By topic

| Topic | Scripts |
|---|---|
| Late payments | `_probe-latepayment`, `_probe-late-payoff`, `_probe-pay-blocked`, `_probe-h2-cleanup`, `_probe-h2-meta` (read-only) |
| Default and first-loss cover | `h1-h3`, `_probe-default-cycle`, `_probe-default-boundary`, `_probe-grace`, `_probe-cover-floor`, `_probe-cover-floor2`, `_probe-broker-mutable` |
| Vault shares as MPTs | `_probe-shares2` to `_probe-shares5`, `_probe-nontransferable`, `_probe-transferable-control`, `_probe-orphan-mpt` (read-only) |
| Vault lifecycle and caps | `_probe-vault-lifecycle`, `_probe-assetsmax-zero`, `_probe-vault-info-shape` (read-only) |
| V1.1 and closed-ended vaults | `test-v11-blocking`, `_probe-h13-phases`, `_probe-h13-phases2`, `_probe-h13-phase3`, `_probe-h13-verify`, `_probe-h13-cleanup` |
| Observability | `_probe-h9-observability`, `_probe-pseudo-accounts` (both read-only) |
| Network | `_probe-rpc-fallback`, `_probe-amendments` (read-only) |
| First minimum-bar runs, replaced by `scripts/demo.mjs` | `steps-4-6`, `step-8-secondary` |
| Test accounts | `_probe-budget`, `_probe-inventory`, `_probe-recoverable`, `_probe-hashes`, `_probe-close-times` (all read-only), `_probe-refill` |
| Deliverable audits | `_probe-audit-claims`, `_probe-verify-links` (both read-only) |

## `deck-source/`

Sources of [`deck/exit-lane.pptx`](../deck/exit-lane.pptx) and [`FEEDBACK.pdf`](../FEEDBACK.pdf).
Design system, pitch timing and build commands are in its [`README.md`](./deck-source/README.md).

| File | Role |
|---|---|
| [`build-deck.cjs`](./deck-source/build-deck.cjs) | Generates the deck with `pptxgenjs`. |
| [`feedback-report.tex`](./deck-source/feedback-report.tex) | Source of `FEEDBACK.pdf`, compiled with `tectonic`. |
| [`capture-explorer.mjs`](./deck-source/capture-explorer.mjs) | Explorer screenshots through headless Chrome, written to `shots/`. |
| [`shots/`](./deck-source/shots) | The screenshots used by the deck and the PDF. |
