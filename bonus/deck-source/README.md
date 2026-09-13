# Deck: Exit Lane

Sources of the deck and of `FEEDBACK.pdf`. The delivered files live in [`deck/`](../../deck)
and at the repository root; every command below runs from the root.

[`deck/exit-lane.pptx`](../../deck/exit-lane.pptx): 10 slides, 16:9 at 13.333 × 7.5 inches, timed speaker notes in every slide.
[`deck/exit-lane.pdf`](../../deck/exit-lane.pdf): the same deck exported by PowerPoint, a safety net for
projecting without depending on a machine that has the right fonts.

## Design system

Two sources to reconcile: the official Ripple / XRPL Lending Protocol deck
("final lending intro.pdf") for the slides, the XRPL explorer for the proofs.

| Role | Value |
|---|---|
| Dark background / titles | `#001C5C` |
| Accent | `#006AFF`, on a dark background `#6DC3FF` |
| Body text | `#5F666E` |
| Failure (figures, chips) | `#F2703A`, the explorer's orange darkened for white backgrounds |
| Code chip | background `#EBF4FF`, text `#0045C6`, height 0.32", 0.22" of padding on each side |
| Window (terminal and explorer) | background `#000000`, edge `#343437`, grey `#A2A2A4`, mint `#84F0B6`, orange `#FF884B`, purple `#B480FF` |
| Left rail | 8-band gradient, 0.10" wide, full height |

The window colors are sampled from the screenshots themselves: the terminal
and the explorer share the `win` component (black background, traffic-light
dots, monospace address bar). The address bar carries the small pieces of
evidence: shortened hash, flags, delay.

**Fonts.** Poppins everywhere: Bold for titles and figures, Medium for labels,
Regular for body, Light for long sentences. Menlo for code. All four Poppins
weights are installed on the machine and embedded in the PDF.

Language: all visible text and the speaker notes are in English.

Content rule: one title, no kicker and no banner, "CY-HACK" only once on
slide 1, no emoji, a figure or a screenshot rather than a sentence. Every
window (screenshot or terminal) carries a one-line caption, Poppins Light
11.5 pt, that says what it proves. Page number `n / 10` bottom right, except
on the title slide.

Grid: left margin 0.88", right edge 12.45".

## Rebuild

```bash
npm install pptxgenjs      # in a temporary folder, NOT in the project
node bonus/deck-source/build-deck.cjs deck/exit-lane.pptx
```

`pptxgenjs` is deliberately not a project dependency: `package.json` pins
`xrpl` and must resolve nothing else.

Re-export the PDF, with PowerPoint installed on the machine:

```bash
osascript -e 'tell application "Microsoft PowerPoint"
  open POSIX file "/Users/charlypupier/Documents/Hackathon XRPL/xrpl-lending/deck/exit-lane.pptx"
  save active presentation in POSIX file "/Users/charlypupier/Documents/Hackathon XRPL/xrpl-lending/deck/exit-lane.pdf" as save as PDF
  close active presentation saving no
end tell'
```

## The 4-minute pitch

The script is in the notes of each slide (presenter view).

| # | Slide | Time | Content |
|---|---|---|---|
| 1 | Exit Lane | 0:00 → 0:15 | Track, the open-ended vault's promise |
| 2 | Open on paper, closed in practice | 0:15 → 0:40 | 100% lent, withdrawal refused (screenshot `7AB5622E`) |
| 3 | Sell the vault share, not the loan | 0:40 → 1:00 | The 4 transactions of the exchange |
| 4 | Live demo | 1:00 → 2:00 | `node scripts/demo.mjs --auto`, 56 s measured |
| 5 | Minimum bar: 8 of 8 | 2:00 → 2:10 | 8 steps, 15/15 types |
| 6 | fixCleanup3_4_0: enabled, missing from xrpl.org | 2:10 → 2:40 | Friction 1 and its fix, `tecTOO_SOON` and signature terminals |
| 7 | A late LoanPay requires tfLoanLatePayment | 2:40 → 3:05 | Friction 2 and its fix, screenshots `96C38704` and `EFAD383F` |
| 8 | First-loss capital: 0.5% of a defaulted loan | 3:05 → 3:35 | Friction 3 and its fix, screenshots `923F7D61` and `68DD97D9` |
| 9 | Six more findings | 3:35 → 3:50 | Findings 4 to 9 |
| 10 | Nine findings, three pages | 3:50 → 4:00 | 143/143 transactions verified on-chain, repo, `FEEDBACK.pdf` |

Slides 6 to 8 are the three most important frictions the brief asks for, in
the report's order, each with its proposed fix.

Before going on stage: terminal open at the repository root, the command
`node scripts/demo.mjs --auto` already typed, `node scripts/check-connection.mjs`
passed within the previous 10 minutes. If the demo does not move for 15 s:
Ctrl+C, go back to slide 4, whose terminal is the reference run.

## Verification status

Rendered by Microsoft PowerPoint and proofread slide by slide on the exported
PDF: no overflow, no overlap. To redo after any change to `build-deck.cjs`.

Content aligned with `FEEDBACK.md` as of 13/09 11h40 (severities, official categories, proposed fixes).
Finding 7 replaced on 13/09 11h40: the V1.1 `LoanBrokerSet` revert exists only on the
`ripple/lending-hackathon` branch of `rippled`, so it concerns no other network. Findings
re-sorted on 13/09 at noon: by severity; within Medium, the two docs that contradict the ledger
first (4, 5), then 6 to 8 in the order that leaves no gap in the three-page PDF. Removed from the deck because
the 22h45 audit invalidated them: share price "overvalued by 150%",
"`AssetsMaximum: 0` undocumented", "V1.1 flag that lies", "`tfLoanLatePayment`
undocumented", "xrpl.js PR to sign `LoanSet`", "8 RPC calls".

Extra screenshot for the deck: `node bonus/deck-source/capture-explorer.mjs d-`.

## `FEEDBACK.pdf`: the feedback report

Same content as `FEEDBACK.md`, in the deck's visual style, with real explorer
screenshots. Three pages: for each finding, category, severity, library,
description, repro steps, clickable transactions and proposed fix; plus the
brief's six questions and three minor issues. Source
`bonus/deck-source/feedback-report.tex`, PDF published at the repository root.

```bash
node bonus/deck-source/capture-explorer.mjs                             # screenshots → bonus/deck-source/shots/
tectonic -X compile bonus/deck-source/feedback-report.tex --outdir bonus/deck-source && mv bonus/deck-source/feedback-report.pdf FEEDBACK.pdf
```

`capture-explorer.mjs` drives headless Chrome (DevTools protocol, no
dependency), declines the cookie banner, and crops each screenshot to an
element of the explorer's DOM. 460 px viewport, rendered at ×5.25: the PDF
places every screenshot at the same magnification.

Screenshot size in the report: 460 CSS px for the width of one column,
about 0.56 pt per CSS px. The explorer's text then comes out between 7 and 10 pt,
like the tables and the body. The explorer's transaction title
(about 40 CSS px, so about 22 pt) is not reused: the report uses the status
badge alone (`*-badge`) and names the transaction in the caption. The deck,
on the other hand, keeps the titles (`*-type`). Each screenshot forms an
unbreakable block with its caption and its hash.

```bash
node bonus/deck-source/capture-explorer.mjs 'badge$'    # redo only one family of screenshots
```

Pitfalls met along the way, noted in the files:

1. fontspec's `Color=` option: breaks `xdvipdfmx` with `tcolorbox`
   (`typecheck: Invalid object type`). Color with `\color` instead.
2. `HelveticaNeue.ttc` without declared faces: `\bfseries` comes out as *Bold Italic*.
3. `new URL(...).pathname` keeps the path's space encoded as `%20`; use
   `fileURLToPath`.
