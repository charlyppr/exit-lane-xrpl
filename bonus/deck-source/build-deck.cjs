// Exit Lane deck, 10 slides.
//
// Two visual sources to reconcile: the official Ripple / XRPL Lending Protocol
// deck ("final lending intro.pdf", measured to the pixel) for the slides, and
// the XRPL explorer for the on-chain proofs (screenshots in bonus/deck-source/shots/).
//
//   slides   navy #001C5C · blue #006AFF · sky #6DC3FF · body #5F666E
//            gradient rail 0.10" wide on the left, canvas 13.333 × 7.5"
//   windows  background #000000 · edge #343437 · grey #A2A2A4 · orange #FF884B
//            mint #84F0B6 · purple #B480FF   (sampled from the screenshots)
//
// Terminal and screenshots share the same `win` component: the explorer's black
// background, a bar with traffic-light dots, a monospace address line. The
// explorer's orange marks every failure, on the slides as well as in the windows.
//
// Type: Poppins everywhere (Bold for titles and figures, Medium for labels,
// Regular for body, Light for long sentences), Menlo for code.
//
// Content rule: one idea per slide, a figure or a screenshot rather than a
// sentence. The small pieces of evidence (hash, flags, delay) live in the
// windows' address bar; a one-line caption under each window says what it
// proves. Page number bottom right, except on the title slide.
//
//   npm install pptxgenjs          # in a temporary folder, NOT in the project
//   node bonus/deck-source/build-deck.cjs deck/exit-lane.pptx

const mod = require("pptxgenjs");
const PptxGen = mod.default || mod;
const p = new PptxGen();
const fs = require("fs");
const path = require("path");

p.defineLayout({ name: "RIPPLE", width: 13.333, height: 7.5 });
p.layout = "RIPPLE";
p.author = "CY-HACK";
p.company = "CY-HACK";
p.title = "Exit Lane";
p.subject = "XRPL Lending Protocol Hackathon · Track 1";

/* ── design tokens ──────────────────────────────────────────────────────── */

const NAVY = "001C5C", BLUE = "006AFF", SKY = "6DC3FF", GREY = "5F666E",
      MUT = "8A9199", LINE = "E2E5E8", WHITE = "FFFFFF", SOFT = "C9D4E8",
      ORANGE = "F2703A",                                  // explorer orange, darkened for white backgrounds
      CHIP = { bg: "EBF4FF", tx: "0045C6" },
      CHIPFAIL = { bg: "FFEEE5", tx: "B8481A" },
      CHIPDARK = { bg: "12357E", tx: SKY };

// windows: explorer palette
const X = { bg: "000000", edge: "343437", dim: "A2A2A4", ink: "FFFFFF",
            ok: "84F0B6", bad: "FF884B", cmd: "B480FF" };

const FH = "Poppins";          // titles and figures, bold
const FB = "Poppins";          // body
const FMED = "Poppins Medium"; // labels
const FL = "Poppins Light";    // long sentences
const FM = "Menlo";            // code

const ML = 0.88, MR = 12.45, CW = 11.57;   // margins and content width

/* ── gradient rail (24×1500 PNG generated from the PDF measurements) ──────── */

const RAIL = "image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAXcCAIAAAC3VNmqAAADoklEQVR42u3dwXHTQQzF4V2PZzikAwqhBTrImSszudMSfaSE" +
  "NMCFJmDCcsoxibFlo5U+F/Cbt2+lJ/3txJ73P55GxOswgl5ANwQdxyp7tOX6W1f2mDxq2/2Vb02waVoeAQH1i9qw7rcfAQF1" +
  "Hdl2SCAgCzvQ1fcjUatpgYA8HOt+ICCgay1aPstWkEAWdh4JNiBNaz9SkEB5o1b37wiaXz8vHtmPSk5ala2ygYBUtqhVkMwG" +
  "UtlAMvt0j5bKBhK1zBa1KhsISEGKWiCVDaSymS2zFSQQkMoWtUAqG0hBAolalQ2kIGNixF/Vi1pRCwSksmW2guQRkMpmtqhV" +
  "2Zt69Pj8k0dAlwfb9F0aEhIISIwAAQGJEbMfCEiMMBsISIyY/UBAQGfHSBTI9x4DAXlc93QEBAQkRoCAzH4xoiCBgMQIj4DM" +
  "fiAxAnTG9X/5/TEGNNMdjSKKKKKIIor+vyJmU0RRX0WLRxRRZGRTRBFFFFFEEUVGNkUUUUQRRRQZkBRRVEeRN30posiApIgi" +
  "iiiiiCKKXhQdxp8YUNR31R9n0MYeqCjK7JHwaKvs0dSROsp1tJFNUbpby3e0fDGijtRRrq3WOOo8jkpvbOpowzoyjm55NDGi" +
  "jtTRTcx2tBOOZhy13thGWbMto53HkSVix4caZnceR5XfY7OMKki35mge/Fy/o+1wtMAvLHVrjmatcWs8UtluzdEs7Apy+4Ss" +
  "+zX8CX9UOupnZQv/0G3c0VbCo+m1vr0mRraMkSFGxEjEOBIjYkSviRHbiBipM46YLdgEm2DTa/ajS8aRGBEjYuSN15wPyT47" +
  "ivyYfhQ9Go+2jJHJIx7xiNk8audR5W8+5dGGHjGbRzzStDziEbN5xCNN++9m82g/j/L9v4iC5FHNzd9bYzziEbN51NAjb43x" +
  "iEfM5hGPKpnNo9YeMZtHPOrbtDzaz6N59+l72c2/7McZgR4tZne+frf2rkerrNlh3a9F5BGz95v9zFbZQC1vLd/sT7gfLS0i" +
  "2CqabfNX2cxuvPm7NS1S0aPl1hrPfi3C7LIjm9laBKil2Ub2jqufFmG27lfZQG4tQfczW4vkOpo362z+up/ZQK93v1vTIkA9" +
  "96O6f6LnzTp5xOyum3/hW5sfvv1ya50Xdh7dzGxLBFCmps33e5BAQAakuQYEpGmBgDStuXYNs23+QCYtEFC7XvO8BgRkQAJZ" +
  "2D1maVogIJOW2UDF55qmBQLquvnrNSBzzYAEujroL0kxR9vjHnycAAAAAElFTkSuQmCC";

/* ── primitives ─────────────────────────────────────────────────────────── */

const shot = (n) => path.join(__dirname, "shots", n + ".png");
const dim = (n) => { const b = fs.readFileSync(shot(n)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

const TOTAL = 10;
let pageNo = 0;
const slide = (dark) => {
  const sl = p.addSlide();
  sl.background = { color: dark ? NAVY : WHITE };
  sl.addImage({ data: RAIL, x: 0, y: 0, w: 0.10, h: 7.5 });
  if (++pageNo > 1)
    sl.addText(`${pageNo} / ${TOTAL}`, { x: MR - 1.2, y: 6.98, w: 1.2, h: 0.25, fontSize: 10,
      color: dark ? SOFT : MUT, fontFace: FB, align: "right", valign: "middle", isTextBox: true, margin: 0 });
  return sl;
};

const txt = (sl, t, o) => sl.addText(t, {
  x: o.x, y: o.y, w: o.w, h: o.h ?? 0.3,
  fontSize: o.fs ?? 13, color: o.color ?? GREY, fontFace: o.ff ?? FB,
  bold: o.bold ?? false, align: o.align ?? "left", valign: o.valign ?? "top",
  lineSpacing: o.ls, charSpacing: o.cs, isTextBox: true, margin: 0,
});

const rule = (sl, y, color, x, w) => sl.addShape(p.ShapeType.rect, {
  x: x ?? ML, y, w: w ?? CW, h: 0.01, fill: { color: color ?? LINE }, line: { type: "none" },
});

/* code chip: Menlo, width computed from the actual advance (0.6 em) + 0.22" on each side */
const chip = (sl, t, o) => {
  const fs = o.fs ?? 9.5, c = o.c ?? CHIP, h = 0.32;
  const w = t.length * 0.6 * fs / 72 + 0.44;
  sl.addShape(p.ShapeType.roundRect, { x: o.x, y: o.y, w, h, fill: { color: c.bg }, line: { type: "none" }, rectRadius: h / 2 });
  sl.addText(t, { x: o.x, y: o.y, w, h, fontSize: fs, color: c.tx, fontFace: FM,
    align: "center", valign: "middle", isTextBox: true, margin: 0 });
  return w;
};

const badge = (sl, n, o) => {
  const d = o.d ?? 0.34;
  sl.addShape(p.ShapeType.ellipse, { x: o.x, y: o.y, w: d, h: d, fill: { color: o.fill ?? BLUE }, line: { type: "none" } });
  sl.addText(String(n), { x: o.x, y: o.y, w: d, h: d, fontSize: o.fs ?? 11, bold: true, color: WHITE,
    fontFace: FH, align: "center", valign: "middle", isTextBox: true, margin: 0 });
};

const title = (sl, t, dark) =>
  txt(sl, t, { x: ML, y: 0.78, w: CW, h: 0.72, fs: 32, bold: true, color: dark ? WHITE : NAVY, ff: FH });

/* big figure + label */
const stat = (sl, n, l, o) => {
  const size = o.fs ?? 36;
  txt(sl, n, { x: o.x, y: o.y, w: o.w, h: size / 52, fs: size, bold: true, color: o.color ?? NAVY, ff: FH });
  txt(sl, l, { x: o.x, y: o.y + size / 52 + 0.02, w: o.w, h: 0.3, fs: 13, color: o.lcolor ?? GREY });
};

/* window shared by the terminal and the explorer: black background, dots, address */
const BAR = 0.42;
const win = (sl, o) => {
  sl.addShape(p.ShapeType.roundRect, { x: o.x, y: o.y, w: o.w, h: o.h,
    fill: { color: X.bg }, line: { color: X.edge, width: 0.75 }, rectRadius: 0.14 });
  ["FF5F57", "FEBC2E", "28C840"].forEach((c, i) =>
    sl.addShape(p.ShapeType.ellipse, { x: o.x + 0.24 + i * 0.2, y: o.y + BAR / 2 - 0.055, w: 0.11, h: 0.11,
      fill: { color: c }, line: { type: "none" } }));
  if (o.label) txt(sl, o.label, { x: o.x + 0.98, y: o.y, w: o.w - 1.2, h: BAR, fs: 9, color: X.dim, ff: FM, valign: "middle" });
  rule(sl, o.y + BAR, X.edge, o.x, o.w);
};

/* explorer screenshots inside a window. Same magnification for all of them
   (2415 px of screenshot = usable width), except one wider screenshot, scaled down. */
const explorer = (sl, o) => {
  const padX = 0.2, padY = 0.14, inner = o.w - 2 * padX, k = inner / 2415;
  const imgs = o.files.map((n) => { const [pw, ph] = dim(n); const s = Math.min(k, inner / pw); return { n, w: pw * s, h: ph * s }; });
  const h = Math.max(o.h ?? 0, BAR + 2 * padY + imgs.reduce((a, i) => a + i.h, 0));
  win(sl, { x: o.x, y: o.y, w: o.w, h, label: o.label });
  let y = o.y + BAR + padY;
  imgs.forEach((i) => { sl.addImage({ path: shot(i.n), x: o.x + padX, y, w: i.w, h: i.h }); y += i.h; });
  return h;
};

/* terminal: lines of [text, color] segments; a line marked fail gets an orange dot */
const term = (sl, o) => {
  const fs = o.fs ?? 11, step = o.step ?? 0.28;
  const h = BAR + 0.36 + o.lines.length * step;
  win(sl, { x: o.x, y: o.y, w: o.w, h, label: o.label });
  o.lines.forEach((segs, i) => {
    if (!segs) return;
    const y = o.y + BAR + 0.18 + i * step;
    if (segs.fail) sl.addShape(p.ShapeType.ellipse, { x: o.x + 0.3, y: y + step / 2 - 0.045, w: 0.09, h: 0.09,
      fill: { color: X.bad }, line: { type: "none" } });
    sl.addText(segs.map(([t, c]) => ({ text: t, options: { color: c || X.ink } })), {
      x: o.x + 0.52, y, w: o.w - 0.8, h: step, fontSize: fs, fontFace: FM, isTextBox: true, margin: 0, valign: "middle",
    });
  });
  return h;
};
const fail = (segs) => Object.assign(segs, { fail: true });

/* one-line caption under a window: what the screenshot proves */
const CAP = 0.3;
const caption = (sl, t, o) =>
  txt(sl, t, { x: o.x, y: o.y + 0.08, w: o.w, h: CAP - 0.08, fs: 11.5, color: GREY, ff: FL });

/* ── speaker notes: the timed pitch, exactly 4 min. ─────────────────────── */

const NOTES = [
`0:00 → 0:15 (15 s)

CY-HACK, track 1. An open-ended vault promises withdrawal at any time. It can no longer keep that promise once it works well. Here is why, what we built, and what the protocol taught us.`,

`0:15 → 0:40 (25 s)

A corporate treasurer deposits 25 XRP. A broker lends to small businesses, over four months. A single LoanSet takes 100% of the vault, with no warning. She wants to withdraw: tecINSUFFICIENT_FUNDS, here in the explorer. We hit it while writing the demo.`,

`0:40 → 1:00 (20 s)

No XLS-66 transaction transfers a loan. But the vault share is an MPT, so it can be transferred. She sells it over the counter, at 97% of its value, with two escrows under the same SHA-256 condition: to take the shares, the buyer publishes the secret that pays the seller.

Q&A: the seller's escrow expires before the buyer's so she has time to collect. Limit: the buyer holds a free one-hour option (README, Limits). BatchV1_1 is enabled, another atomic path, not tested.`,

`1:00 → 2:00 (60 s)

Switch to the terminal, command already typed: node scripts/demo.mjs --auto (56 s measured). One sentence per scene:
1. Vault, deposit, broker, cover, and a loan that takes everything.
2. She wants out: refused.
3. The buyer opts in, two escrows, he reveals the secret, she reads it back from the ledger and collects.
4. The borrower repays. The buyer, who never deposited, is the one who withdraws, with the yield.

If nothing moves for 15 s: Ctrl+C, come back to this slide. The terminal on the right is the reference run, hashes in the README.`,

`2:00 → 2:10 (10 s)

The eight minimum bar steps in a single run, every hash in the README. The fifteen XLS-65 and XLS-66 types submitted to the ledger, all typed in xrpl 4.6.0. Now, the three most important frictions, each with its fix.`,

`2:10 → 2:40 (30 s)

One: fixCleanup3_4_0 is enabled on the devnet and missing from xrpl.org. It changes two things. Impairment: the tutorial says to impair before the due date, the ledger answers tecTOO_SOON until the due date, on the left. The borrower's signature on LoanSet: a new prefix, which the xrpl 4.6.0 helper does not use, on the right.
Fix: list the amendment on xrpl.org, update the tutorial, sign with encodeForSigningCounterparty in xrpl.js.`,

`2:40 → 3:05 (25 s)

Two: a loan 11 seconds late, within its grace period. Without the flag: tecEXPIRED, on the left. Same amount with tfLoanLatePayment: success, on the right, and the explorer shows that flag in hex. The failure is defined in XLS-66, but not in the xrpl.org LoanPay reference.
Fix: add tecEXPIRED to the reference with the flag as the remedy, and name the flag in the explorer.`,

`3:05 → 3:35 (30 s)

Three: a broker with 10% minimum cover, 5% liquidation. Default on a 4 XRP loan. The explorer shows 0.02 XRP taken from the cover: 4 × 10% × 5%, to the drop. The depositor loses 3.98 XRP. That is the documented formula. Below: 21 seconds after the default, by ledger close time, the broker withdraws the remaining 0.98 XRP, because the debt, and so the floor, are at zero.
Fix: show the share of a default the cover absorbs, and a withdrawal delay after a default.`,

`3:35 → 3:50 (15 s)

Six more findings, each with its category, severity, repro steps and fix in the report. Only mention number 7: the hackathon branch reverted the V1.1 restriction on LoanBrokerSet, and the brief does not say so.`,

`3:50 → 4:00 (10 s)

Everything is in FEEDBACK.md, and in three pages in FEEDBACK.pdf. The 143 hashes cited were re-checked on the ledger before submission. Thank you.`,
];
let slideNo = 0;
const notes = (sl) => sl.addNotes(NOTES[slideNo++]);

/* ══ 1 - title ═══════════════════════════════════════════════════════════ */
{
  const sl = slide(true);
  let cx = ML;
  ["XLS-65", "XLS-66", "TokenEscrow"].forEach((t) => { cx += chip(sl, t, { x: cx, y: 2.25, c: CHIPDARK }) + 0.14; });
  txt(sl, "Exit Lane.", { x: ML - 0.05, y: 2.75, w: 9, h: 1.2, fs: 64, bold: true, color: WHITE, ff: FH });
  txt(sl, "An open-ended vault promises withdrawal at any time.\nIt can no longer keep that promise once it works well.",
    { x: ML, y: 4.1, w: 9.5, h: 0.9, fs: 19, color: SOFT, ff: FL, ls: 30 });
  txt(sl, "CY-HACK   ·   Track 1, open-ended vault   ·   Custom Hackathon Devnet   ·   xrpl@4.6.0",
    { x: ML, y: 6.45, w: CW, h: 0.3, fs: 11, color: SKY });
  notes(sl);
}

/* ══ 2 - the problem ═════════════════════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "Open on paper, closed in practice");

  [["100%", BLUE, "of the vault lent by a single LoanSet"],
   ["0 XRP", ORANGE, "withdrawable by the depositor"],
   ["4 months", NAVY, "until the last payment is due"]].forEach(([n, col, l], i) =>
    stat(sl, n, l, { x: ML, y: 2.0 + i * 1.4, w: 4.8, color: col }));

  const hw = explorer(sl, { x: MR - 6.4, y: 2.5, w: 6.4, files: ["d-wall-type", "d-wall-status"],
    label: "explorer  ›  VaultWithdraw  ›  7AB5622E…CF934" });
  caption(sl, "The depositor's withdrawal: refused, the loan took the whole vault.", { x: MR - 6.4, y: 2.5 + hw, w: 6.4 });
  notes(sl);
}

/* ══ 3 - the answer ══════════════════════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "Sell the vault share, not the loan");

  const cw = CW / 4;
  rule(sl, 2.62, LINE, ML + 0.25, cw * 3);
  [["The buyer locks the payment", "EscrowCreate · +2 h"],
   ["The seller locks her shares", "EscrowCreate · +1 h"],
   ["The buyer takes the shares and reveals the secret", "EscrowFinish"],
   ["The seller reads the secret and collects", "EscrowFinish"],
  ].forEach(([t, tx], i) => {
    const x = ML + i * cw;
    badge(sl, i + 1, { x, y: 2.37, d: 0.5, fs: 15 });
    txt(sl, t, { x, y: 3.2, w: cw - 0.3, h: 1.0, fs: 17, color: NAVY, ff: FMED, ls: 24 });
    chip(sl, tx, { x, y: 4.4 });
  });

  rule(sl, 5.35);
  txt(sl, "Price: 97% of share value.", { x: ML, y: 5.6, w: 5.6, h: 0.35, fs: 16, color: NAVY, ff: FMED });
  txt(sl, "One SHA-256 condition for both escrows.", { x: ML + 5.8, y: 5.6, w: 5.8, h: 0.35, fs: 16, color: GREY });
  notes(sl);
}

/* ══ 4 - demo ════════════════════════════════════════════════════════════ */
{
  const sl = slide(true);
  txt(sl, "Live demo.", { x: ML - 0.05, y: 2.75, w: 5.2, h: 1.0, fs: 56, bold: true, color: WHITE, ff: FH });
  txt(sl, "13 transactions in 56 seconds,\non the devnet, live.", { x: ML, y: 3.9, w: 5, h: 0.8, fs: 18, color: SOFT, ff: FL, ls: 28 });

  const L = (label, code) => [["" + label.padEnd(24), X.ink], [code, code === "tesSUCCESS" ? X.ok : X.bad]];
  term(sl, { x: 6.35, y: 1.55, w: 6.1, fs: 11.5, step: 0.31, label: "~/exit-lane-xrpl  $ node scripts/demo.mjs --auto", lines: [
    L("VaultCreate", "tesSUCCESS"),
    L("VaultDeposit", "tesSUCCESS"),
    L("LoanBrokerSet", "tesSUCCESS"),
    L("LoanBrokerCoverDeposit", "tesSUCCESS"),
    L("LoanSet 100%", "tesSUCCESS"),
    fail(L("VaultWithdraw", "tecINSUFFICIENT_FUNDS")),
    L("MPTokenAuthorize", "tesSUCCESS"),
    L("EscrowCreate ×2", "tesSUCCESS"),
    L("EscrowFinish ×2", "tesSUCCESS"),
    L("LoanPay", "tesSUCCESS"),
    L("VaultWithdraw", "tesSUCCESS"),
    null,
    [["Total time  00:56", X.dim]],
  ] });
  notes(sl);
}

/* ══ 5 - execution ═══════════════════════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "Minimum bar: 8 of 8");

  const S = (n, label, tx, c) => [[`${n}  ${label.padEnd(24)}`, X.ink], [tx, c ?? X.cmd]];
  term(sl, { x: ML, y: 1.95, w: 7.3, fs: 12, step: 0.34, label: "README.md  ›  one hash per step", lines: [
    S(1, "Open-ended vault", "VaultCreate"),
    S(2, "Deposit", "VaultDeposit"),
    S(3, "Broker + cover", "LoanBrokerSet"),
    S(4, "Origination + drawdown", "LoanSet"),
    S(5, "Repayment", "LoanPay"),
    S(6, "Principal + yield", "VaultWithdraw"),
    S(7, "Guardrails triggered", "12 × tec in the README", X.bad),
    S(8, "Use case", "Exit Lane"),
    null,
    [["   share value  1.000000000  →  ", X.dim], ["1.006443880", X.ok]],
  ] });

  stat(sl, "15 / 15", "XLS-65/66 types submitted to the ledger", { x: 8.85, y: 2.25, w: 3.6, fs: 44, color: BLUE });
  stat(sl, "0", "missing types in xrpl@4.6.0", { x: 8.85, y: 4.05, w: 3.6, fs: 44, color: BLUE });
  notes(sl);
}

/* "finding | detail" rows under the proofs, the last one carries the proposed fix */
const facts = (sl, y0, rows) => {
  rule(sl, y0 - 0.25);
  rows.forEach(([label, text], i) => {
    const fixRow = i === rows.length - 1;
    txt(sl, label, { x: ML, y: y0 + i * 0.47, w: 3.2, h: 0.35, fs: 15, color: fixRow ? BLUE : NAVY, ff: FMED });
    txt(sl, text, { x: ML + 3.2, y: y0 + i * 0.47, w: 8.3, h: 0.35, fs: 15, color: fixRow ? NAVY : GREY });
  });
};

/* ══ 6 - friction 1: fixCleanup3_4_0 ═════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "fixCleanup3_4_0: enabled, missing from xrpl.org");
  txt(sl, "Two lending behaviours change on the devnet.", { x: ML, y: 1.62, w: CW, h: 0.35, fs: 16, color: GREY, ff: FL });

  const W = (CW - 0.4) / 2;
  const ht = term(sl, { x: ML, y: 2.45, w: W, fs: 12, step: 0.36, label: "LoanManage tfLoanImpair  ›  due date T", lines: [
    fail([["T − 31 s    ", X.dim], ["tecTOO_SOON", X.bad]]),
    fail([["T − 13 s    ", X.dim], ["tecTOO_SOON", X.bad]]),
    [["T +  5 s    ", X.dim], ["tesSUCCESS", X.ok]],
    null,
  ] });
  term(sl, { x: ML + W + 0.4, y: 2.45, w: W, fs: 12, step: 0.36, label: "LoanSet  ›  CounterpartySignature", lines: [
    fail([["signLoanSetByCounterparty", X.ink]]),
    [["  Counterparty: Invalid signature.", X.bad]],
    [["encodeForSigningCounterparty", X.ink]],
    [["  tesSUCCESS   ", X.ok], ["23631C36…", X.dim]],
  ] });
  caption(sl, "Impairment refused before the due date, accepted 5 s after.", { x: ML, y: 2.45 + ht, w: W });
  caption(sl, "The xrpl@4.6.0 helper is rejected, the new encoding passes.", { x: ML + W + 0.4, y: 2.45 + ht, w: W });

  facts(sl, 5.45, [
    ["Manage a Loan tutorial", "“impair a loan before a payment due date passes”"],
    ["xrpl@4.6.0", "signLoanSetByCounterparty signs with the previous prefix."],
    ["Proposed fix", "list the amendment, sign with encodeForSigningCounterparty."],
  ]);
  notes(sl);
}

/* ══ 7 - friction 2: late payment ════════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "A late LoanPay requires tfLoanLatePayment");
  txt(sl, "Same loan, same amount, past its due date.", { x: ML, y: 1.62, w: CW, h: 0.35, fs: 16, color: GREY, ff: FL });

  const W = (CW - 0.4) / 2;
  const h = explorer(sl, { x: ML, y: 2.45, w: W, files: ["f1a-type", "f1a-status"], label: "Flags 0  ›  96C38704…" });
  explorer(sl, { x: ML + W + 0.4, y: 2.45, w: W, h, files: ["f1b-type", "f1b-flags"], label: "Flags 262144  ›  EFAD383F…" });
  caption(sl, "Same loan, same amount, no flag: tecEXPIRED.", { x: ML, y: 2.45 + h, w: W });
  caption(sl, "Same loan, same amount, with tfLoanLatePayment: success.", { x: ML + W + 0.4, y: 2.45 + h, w: W });

  facts(sl, 5.45, [
    ["XLS-66, §3.11.4.2", "the failure is defined (condition 11)."],
    ["LoanPay reference", "eight error codes listed on xrpl.org, tecEXPIRED is not one of them."],
    ["Proposed fix", "tecEXPIRED in the LoanPay reference, flag named in the explorer."],
  ]);
  notes(sl);
}

/* ══ 8 - friction 3: first-loss capital ══════════════════════════════════ */
{
  const sl = slide();
  title(sl, "First-loss capital: 0.5% of a defaulted loan");

  stat(sl, "1 XRP", "of cover posted by the broker", { x: ML, y: 1.85, w: 5.6 });
  stat(sl, "0.02 XRP", "taken from the cover at default", { x: ML, y: 2.95, w: 5.6, color: ORANGE });
  stat(sl, "3.98 XRP", "lost by the depositor, 79.6%", { x: ML, y: 4.05, w: 5.6 });

  rule(sl, 5.2, LINE, ML, 5.9);
  txt(sl, "4 XRP debt × CoverRateMinimum 10% × CoverRateLiquidation 5%",
    { x: ML, y: 5.36, w: 6.2, h: 0.25, fs: 10.5, color: GREY, ff: FM });
  txt(sl, "Same ratio on a 50 XRP loan: 0.25 XRP.", { x: ML, y: 5.68, w: 6, h: 0.3, fs: 12.5, color: MUT });
  txt(sl, "Proposed fix", { x: ML, y: 6.12, w: 5.9, h: 0.3, fs: 13, color: BLUE, ff: FMED });
  txt(sl, "Show the share of a default the cover absorbs.\nA delay on LoanBrokerCoverWithdraw after a default.",
    { x: ML, y: 6.44, w: 5.9, h: 0.62, fs: 13, color: NAVY, ls: 20 });

  const W = 4.7, x = MR - W, y1 = 1.7;
  const h1 = explorer(sl, { x, y: y1, w: W, files: ["f3a-type", "f3a-meta"], label: "LoanManage tfLoanDefault  ›  923F7D61…" });
  caption(sl, "Default: 0.02 XRP taken from the broker's cover.", { x, y: y1 + h1, w: W });
  const y2 = y1 + h1 + CAP + 0.1;
  const h2 = explorer(sl, { x, y: y2, w: W, files: ["f3b-type", "f3b-amount", "f3b-date"], label: "21 s after the default  ›  68DD97D9…" });
  caption(sl, "21 s later, the broker withdraws the remaining cover.", { x, y: y2 + h2, w: W });
  notes(sl);
}

/* ══ 9 - feedback: the six others ════════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "Six more findings");

  // number = section of FEEDBACK.md
  const F = [
    [4, "Sole-holder exception missing from xrpl.org", "LossUnrealized"],
    [5, "No loan_info or loan_broker_info", "unknownCmd"],
    [6, "Four codes, two or three causes each", "tecINSUFFICIENT_FUNDS"],
    [7, "V1.1 LoanBrokerSet restriction reverted", "tesSUCCESS"],
    [8, "Shares carry lsfMPTCanTrade, OfferCreate refused", "temDISABLED"],
    [9, "No flag closes a vault to deposits", "tecLIMIT_EXCEEDED"],
  ];
  const gap = 0.6, w = (CW - gap) / 2;
  F.forEach(([n, t, code], i) => {
    const x = ML + (i % 2) * (w + gap), y = 1.95 + Math.floor(i / 2) * 1.2;
    rule(sl, y, LINE, x, w);
    badge(sl, n, { x, y: y + 0.26, d: 0.34, fs: n > 9 ? 9.5 : 11, fill: NAVY });
    txt(sl, t, { x: x + 0.52, y: y + 0.26, w: w - 0.52, h: 0.34, fs: 14, color: NAVY, ff: FMED, valign: "middle" });
    chip(sl, code, { x: x + 0.52, y: y + 0.72, fs: 9 });
  });
  txt(sl, "Category, severity, repro steps and proposed fix for each in the report.",
    { x: ML + 0.52, y: 1.95 + 3 * 1.2 + 0.3, w: CW - 0.52, h: 0.6, fs: 13, color: GREY, ff: FL });
  notes(sl);
}

/* ══ 10 - closing ════════════════════════════════════════════════════════ */
{
  const sl = slide(true);
  title(sl, "Nine findings, three pages", true);

  txt(sl, "143 / 143", { x: ML - 0.04, y: 2.15, w: 8, h: 1.25, fs: 76, bold: true, color: SKY, ff: FH });
  txt(sl, "hashes cited, re-checked on the ledger before submission", { x: ML, y: 3.5, w: CW, h: 0.4, fs: 19, color: SOFT, ff: FL });

  rule(sl, 4.6, "1C3D85");
  txt(sl, "github.com/charlyppr/exit-lane-xrpl", { x: ML, y: 4.9, w: CW, h: 0.45, fs: 21, color: WHITE, ff: FM });
  let cx = ML;
  ["FEEDBACK.md", "FEEDBACK.pdf"].forEach((t) => { cx += chip(sl, t, { x: cx, y: 5.6, c: CHIPDARK }) + 0.14; });
  notes(sl);
}

p.writeFile({ fileName: process.argv[2] || "deck/exit-lane.pptx" }).then((f) => console.log("written:", f));
