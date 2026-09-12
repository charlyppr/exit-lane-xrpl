// Deck Exit Lane — 10 slides, design system du deck officiel Ripple / XRPL
// Lending Protocol (« final lending intro.pdf »), relevé au pixel :
//
//   navy #001C5C · bleu #006AFF · ciel #6DC3FF · corps #5F666E · sourdine #AEB3B7
//   carte #FAFAFA bord #E2E5E8 · carte bleue #EBF4FF · puce code #BAEAFF/#0045C6
//   vert #E1F4EE/#5DC9A5 · pêche #FAEDE7/#F0997B
//   rail dégradé de 0,10" à gauche de chaque slide, 8 bandes
//   canevas 13,333 × 7,5" — 1 px du PDF de référence = 0,01"
//
// Règle de contenu : c'est un pitch deck, pas un rapport. Une idée par slide,
// un chiffre plutôt qu'une phrase, et toute sortie de commande passe par le
// composant `term` — un vrai terminal vaut mieux qu'un paragraphe.
//
// Typo du deck de référence : Plus Jakarta Sans Bold / Inter / JetBrains Mono.
// Aucune des trois n'est installée sur la machine de génération, donc on prend
// les plus proches qui le sont : Poppins (géométrique), Helvetica Neue
// (néo-grotesque), Menlo. Si les trois originales sont installées un jour,
// il suffit de changer FH / FB / FM ci-dessous.
//
//   npm install pptxgenjs          # dans un dossier temporaire, PAS dans le projet
//   node deck/build-deck.cjs deck/exit-lane.pptx

const mod = require("pptxgenjs");
const PptxGen = mod.default || mod;
const p = new PptxGen();

p.defineLayout({ name: "RIPPLE", width: 13.333, height: 7.5 });
p.layout = "RIPPLE";
p.author = "CY-HACK";
p.company = "CY-HACK";
p.title = "Exit Lane";
p.subject = "XRPL Lending Protocol Hackathon — Track 1";

/* ── design tokens ──────────────────────────────────────────────────────── */

const NAVY = "001C5C", BLUE = "006AFF", SKY = "6DC3FF", GREY = "5F666E",
      MUT  = "AEB3B7", CARD = "FAFAFA", LINE = "E2E5E8", BLUECARD = "EBF4FF",
      CHIPBG = "BAEAFF", CHIPTX = "0045C6", WHITE = "FFFFFF",
      GREENBG = "E1F4EE", GREEN = "1E8F6B", PEACHBG = "FAEDE7", CORAL = "C4553A",
      NAVYSOFT = "8FA6D8";

// terminal
const T = { bg: "001233", edge: "16306B", dim: "6E86B8", ink: "DCE6F7",
            ok: "35C48F", bad: "FF9E7E", cmd: "6DC3FF" };

const FH = "Poppins";         // titres      (réf. Plus Jakarta Sans Bold)
const FB = "Helvetica Neue";  // corps       (réf. Inter)
const FM = "Menlo";           // monospace   (réf. JetBrains Mono)

const ML = 0.88, MR = 12.45, CW = 11.57;   // marges et largeur de contenu
const BOTTOM = 7.08;                        // bandeau bas

// colonnes : n cartes égales sur la largeur de contenu
const cols = (n, gap = 0.26) => {
  const w = (CW - gap * (n - 1)) / n;
  return { w, x: (i) => ML + i * (w + gap) };
};

/* ── rail dégradé (PNG 24×1500 généré à partir des relevés du PDF) ───────── */

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

const slide = (dark) => {
  const sl = p.addSlide();
  sl.background = { color: dark ? NAVY : WHITE };
  sl.addImage({ data: RAIL, x: 0, y: 0, w: 0.10, h: 7.5 });
  return sl;
};

const txt = (sl, t, o) => sl.addText(t, {
  x: o.x, y: o.y, w: o.w, h: o.h ?? 0.3,
  fontSize: o.fs ?? 12.5, color: o.color ?? GREY, fontFace: o.ff ?? FB,
  bold: o.bold ?? false, italic: o.italic ?? false,
  align: o.align ?? "left", valign: o.valign ?? "top",
  lineSpacing: o.ls, charSpacing: o.cs, isTextBox: true, margin: 0,
});

const caps = (sl, t, o) => txt(sl, t.toUpperCase(), { fs: 8, bold: true, cs: 0.8, h: 0.16, ...o });

const card = (sl, o) => sl.addShape(p.ShapeType.roundRect, {
  x: o.x, y: o.y, w: o.w, h: o.h,
  fill: { color: o.fill ?? CARD },
  line: o.noLine ? { type: "none" } : { color: o.line ?? LINE, width: 0.75 },
  rectRadius: o.r ?? 0.12,
});

const chip = (sl, t, o) => {
  const adv = (o.ff === FB ? 0.0062 : 0.0075) * (o.fs ?? 8.5);
  const w = o.w ?? t.length * adv + 0.3;
  sl.addShape(p.ShapeType.roundRect, {
    x: o.x, y: o.y, w, h: 0.26, fill: { color: o.fill ?? CHIPBG },
    line: { type: "none" }, rectRadius: 0.13,
  });
  sl.addText(t, {
    x: o.x, y: o.y, w, h: 0.26, fontSize: o.fs ?? 8.5, color: o.color ?? CHIPTX,
    fontFace: o.ff ?? FM, align: "center", valign: "middle", isTextBox: true, margin: 0,
  });
  return w;
};

const pill = (sl, t, o) => {
  sl.addShape(p.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h ?? 0.34, fill: { color: o.fill ?? BLUE },
    line: { type: "none" }, rectRadius: (o.h ?? 0.34) / 2,
  });
  sl.addText(t.toUpperCase(), {
    x: o.x, y: o.y, w: o.w, h: o.h ?? 0.34, fontSize: o.fs ?? 9, bold: true,
    color: o.color ?? WHITE, fontFace: FB, charSpacing: 0.8,
    align: "center", valign: "middle", isTextBox: true, margin: 0,
  });
};

const bullet = (sl, n, o) => {
  const d = o.d ?? 0.28;
  sl.addShape(p.ShapeType.ellipse, { x: o.x, y: o.y, w: d, h: d, fill: { color: o.fill ?? BLUE }, line: { type: "none" } });
  sl.addText(String(n), {
    x: o.x, y: o.y, w: d, h: d, fontSize: o.fs ?? 10, bold: true, color: o.color ?? WHITE,
    fontFace: FB, align: "center", valign: "middle", isTextBox: true, margin: 0,
  });
};

const rule = (sl, y, color, x, w) => sl.addShape(p.ShapeType.rect, {
  x: x ?? ML, y, w: w ?? CW, h: 0.008, fill: { color: color ?? LINE }, line: { type: "none" },
});

/* en-tête : eyebrow + pagination + kicker + titre. Sous-titre seulement si le
   titre ne suffit pas — par défaut il n'y en a pas. */
const head = (sl, o) => {
  caps(sl, o.eyebrow, { x: ML, y: 0.52, w: 7.5, color: o.dark ? NAVYSOFT : MUT });
  txt(sl, o.num, { x: MR - 2, y: 0.52, w: 2, h: 0.16, fs: 9, color: o.dark ? NAVYSOFT : MUT, ff: FM, align: "right" });
  caps(sl, o.kicker, { x: ML, y: 0.96, w: 7.5, fs: 9.5, color: o.dark ? SKY : BLUE });
  txt(sl, o.title, { x: ML, y: 1.18, w: CW, h: 0.56, fs: o.tfs ?? 29, bold: true, color: o.dark ? WHITE : NAVY, ff: FH });
};

const band = (sl, dark) => {
  caps(sl, "CY-HACK · Exit Lane", { x: ML, y: BOTTOM, w: 4, color: dark ? WHITE : MUT });
  caps(sl, "XRPL Lending Protocol · Hackathon", { x: MR - 5, y: BOTTOM, w: 5, color: dark ? WHITE : MUT, align: "right" });
};

/* faux terminal : barre à pastilles, titre, filet, lignes monospace colorées.
   `lines` = tableau de lignes ; chaque ligne = tableau de segments [texte, couleur, gras]. */
const term = (sl, o) => {
  const fs = o.fs ?? 10.5, step = o.step ?? 0.25;
  card(sl, { x: o.x, y: o.y, w: o.w, h: o.h, fill: T.bg, line: T.edge, r: 0.1 });
  ["FF5F57", "FEBC2E", "28C840"].forEach((c, i) =>
    sl.addShape(p.ShapeType.ellipse, { x: o.x + 0.26 + i * 0.21, y: o.y + 0.21, w: 0.115, h: 0.115,
      fill: { color: c }, line: { type: "none" } }));
  txt(sl, o.title, { x: o.x + 1.0, y: o.y + 0.19, w: o.w - 1.3, h: 0.2, fs: 8.5, color: T.dim, ff: FM });
  rule(sl, o.y + 0.5, T.edge, o.x, o.w);
  o.lines.forEach((segs, i) => {
    if (!segs) return;
    sl.addText(segs.map(([t, c, b]) => ({ text: t, options: { color: c || T.ink, bold: !!b } })), {
      x: o.x + 0.3, y: o.y + 0.66 + i * step, w: o.w - 0.6, h: step,
      fontSize: fs, fontFace: FM, isTextBox: true, margin: 0, valign: "middle",
    });
  });
};

/* ══ 1 — titre ═══════════════════════════════════════════════════════════ */
{
  const sl = slide(true);
  caps(sl, "CY-HACK", { x: ML, y: 0.82, w: 4, fs: 11, color: WHITE });
  caps(sl, "Track 1 · Vault open-ended", { x: MR - 5, y: 0.84, w: 5, fs: 9, color: SKY, align: "right" });

  pill(sl, "XLS-65 + XLS-66 + TokenEscrow", { x: ML, y: 2.05, w: 3.5 });
  caps(sl, "Custom Hackathon Devnet · 12-13 septembre 2026", { x: ML + 3.75, y: 2.13, w: 6.5, fs: 9, color: WHITE });

  txt(sl, "Exit Lane.", { x: ML - 0.06, y: 2.72, w: 9, h: 1.1, fs: 54, bold: true, color: WHITE, ff: FH });
  txt(sl, "Un vault open-ended promet le retrait à tout moment.\nIl ne peut plus le tenir dès qu'il fonctionne bien.",
    { x: ML, y: 3.92, w: 8.6, h: 0.8, fs: 16, color: "C9D4E8", ls: 26 });

  txt(sl, "Lending Protocol V1   ·   xrpl@4.6.0   ·   network_id 4001   ·   rippled 3.4.0-rc1",
    { x: ML, y: 6.3, w: 10, h: 0.3, fs: 10.5, color: SKY, ff: FM });
  band(sl, true);
}

/* ══ 2 — le problème ═════════════════════════════════════════════════════ */
{
  const sl = slide();
  head(sl, { eyebrow: "Exit Lane", num: "02 · 10", kicker: "Le problème", title: "Ouvert en droit, fermé en fait" });

  const c = cols(3);
  [["100 %", BLUE, "du vault prêté en une transaction"],
   ["0", CORAL, "XRP encore retirables"],
   ["4 mois", NAVY, "de capital immobilisé"]].forEach(([n, col, l], i) => {
    const x = c.x(i);
    card(sl, { x, y: 2.0, w: c.w, h: 1.5 });
    txt(sl, n, { x: x + 0.26, y: 2.24, w: c.w - 0.5, h: 0.6, fs: 34, bold: true, color: col, ff: FH });
    txt(sl, l, { x: x + 0.26, y: 2.92, w: c.w - 0.5, h: 0.4, fs: 12, color: GREY });
  });

  term(sl, { x: ML, y: 3.86, w: CW, h: 2.44, title: "scripts/demo.mjs — scène 1/4", lines: [
    [["$ ", T.cmd], ["node scripts/demo.mjs", T.ink]],
    [],
    [["  Actif total        ", T.dim], ["25.000000 XRP", T.ink]],
    [["  Prêté              ", T.dim], ["25.000000 XRP", T.ink], ["   (100.0 % du vault)", T.dim]],
    [["  Disponible         ", T.dim], ["—", T.bad, true], ["   ← champ ABSENT du nœud, pas zéro explicite", T.bad]],
    [["  Valeur d'une part  ", T.dim], ["1.000000000", T.ink]],
  ] });

  txt(sl, "Rencontré en écrivant la démo, pas mis en scène.", { x: ML, y: 6.48, w: 8, h: 0.26, fs: 11.5, color: GREY, italic: true });
  band(sl);
}

/* ══ 3 — le mur ══════════════════════════════════════════════════════════ */
{
  const sl = slide();
  head(sl, { eyebrow: "Exit Lane", num: "03 · 10", kicker: "La découverte", title: "Le protocole dit non" });

  term(sl, { x: ML, y: 1.98, w: CW, h: 2.5, title: "scripts/demo.mjs — scène 2/4", fs: 11.5, step: 0.3, lines: [
    [["VaultWithdraw", T.ink], ["   7 500 000 parts", T.dim]],
    [],
    [["⛔ tecINSUFFICIENT_FUNDS", T.bad, true]],
    [["   7AB5622EAEFC70A6B005EAED9411EA3D62539A16E5EF5D8C8E33F8BE493CF934", T.dim]],
  ] });

  const c = cols(2);
  card(sl, { x: c.x(0), y: 4.76, w: c.w, h: 1.1, fill: GREENBG, noLine: true });
  txt(sl, "tec", { x: c.x(0) + 0.3, y: 4.96, w: 1.2, h: 0.32, fs: 18, bold: true, color: GREEN, ff: FM });
  txt(sl, "Écrite dans le ledger, avec un hash. Vérifiable.", { x: c.x(0) + 0.3, y: 5.34, w: c.w - 0.6, h: 0.3, fs: 12.5, color: NAVY });
  card(sl, { x: c.x(1), y: 4.76, w: c.w, h: 1.1 });
  txt(sl, "tem", { x: c.x(1) + 0.3, y: 4.96, w: 1.2, h: 0.32, fs: 18, bold: true, color: MUT, ff: FM });
  txt(sl, "Rejet local. Aucune trace, aucun hash.", { x: c.x(1) + 0.3, y: 5.34, w: c.w - 0.6, h: 0.3, fs: 12.5, color: GREY });

  txt(sl, "Nos cinq garde-fous sont des tec.", { x: ML, y: 6.2, w: 8, h: 0.26, fs: 11.5, color: GREY, italic: true });
  band(sl);
}

/* ══ 4 — la réponse ══════════════════════════════════════════════════════ */
{
  const sl = slide();
  head(sl, { eyebrow: "Exit Lane", num: "04 · 10", kicker: "La réponse", title: "Céder la part, jamais la créance" });

  const c = cols(2);
  [[PEACHBG, CORAL, "Non cessible", "Loan", "Aucune des 15 transactions XLS-65 / XLS-66 ne la transfère. L'emprunteur ne voit rien.",
    ["aucun transfert de créance"], "F6DCD1", "9C4026"],
   [GREENBG, GREEN, "Cessible", "Part de vault", "Un MPT. Transférable, escrowable, et il porte le rendement avec lui.",
    ["MPTokenAuthorize", "EscrowCreate", "EscrowFinish"], "C9EDE1", "0E6B4E"],
  ].forEach(([bg, acc, tag, t, body, chips, cbg, ctx], i) => {
    const x = c.x(i);
    card(sl, { x, y: 2.1, w: c.w, h: 3.45, fill: bg, noLine: true });
    caps(sl, tag, { x: x + 0.34, y: 2.4, w: 3, fs: 9, color: acc });
    txt(sl, t, { x: x + 0.34, y: 2.7, w: c.w - 0.68, h: 0.45, fs: 23, bold: true, color: NAVY, ff: FH });
    txt(sl, body, { x: x + 0.34, y: 3.32, w: c.w - 0.68, h: 0.8, fs: 13, color: GREY, ls: 19 });
    let cx = x + 0.34;
    chips.forEach((t2) => { cx += chip(sl, t2, { x: cx, y: 4.96, fill: cbg, color: ctx }) + 0.14; });
  });

  txt(sl, "Vendre une part de fonds obligataire ne vend pas les obligations du portefeuille.",
    { x: ML, y: 5.95, w: CW, h: 0.3, fs: 14, color: NAVY });
  band(sl);
}

/* ══ 5 — le mécanisme ════════════════════════════════════════════════════ */
{
  const sl = slide();
  head(sl, { eyebrow: "Exit Lane", num: "05 · 10", kicker: "Le mécanisme", title: "Deux coffres, une seule clé" });

  const c = cols(4, 0.20);
  [["L'acheteur bloque", "EscrowCreate · +2 h", "Il s'engage en premier."],
   ["La vendeuse bloque", "EscrowCreate · +1 h", "Expiration plus courte : elle garde le temps d'encaisser."],
   ["L'acheteur prend", "EscrowFinish", "Pour prendre les parts, il doit publier la clé."],
   ["La vendeuse encaisse", "EscrowFinish", "Le secret est relu dans le ledger."],
  ].forEach(([t, tx, d], i) => {
    const x = c.x(i);
    card(sl, { x, y: 2.1, w: c.w, h: 3.05 });
    bullet(sl, i + 1, { x: x + 0.26, y: 2.34 });
    txt(sl, t, { x: x + 0.26, y: 2.76, w: c.w - 0.52, h: 0.44, fs: 14, bold: true, color: NAVY, ff: FH, ls: 17 });
    txt(sl, d, { x: x + 0.26, y: 3.3, w: c.w - 0.52, h: 0.9, fs: 12, color: GREY, ls: 17 });
    chip(sl, tx, { x: x + 0.26, y: 4.66 });
  });

  txt(sl, "Une seule condition PREIMAGE-SHA-256 pour les deux escrows. Inverser les durées casse l'échange.",
    { x: ML, y: 5.55, w: CW, h: 0.3, fs: 14, color: NAVY });
  txt(sl, "Ni notaire, ni séquestre, ni confiance.", { x: ML, y: 5.97, w: 8, h: 0.26, fs: 11.5, color: GREY, italic: true });
  band(sl);
}

/* ══ 6 — démo ════════════════════════════════════════════════════════════ */
{
  const sl = slide(true);
  caps(sl, "Maintenant", { x: ML, y: 1.9, w: 4, fs: 10, color: SKY });
  txt(sl, "Démo live.", { x: ML - 0.06, y: 2.25, w: 6, h: 1.0, fs: 50, bold: true, color: WHITE, ff: FH });
  txt(sl, "13 transactions\n56 secondes\nen direct sur le devnet",
    { x: ML, y: 3.5, w: 4.5, h: 1.1, fs: 16, color: "C9D4E8", ls: 26 });

  term(sl, { x: 5.95, y: 1.8, w: 6.5, h: 4.5, title: "node scripts/demo.mjs", lines: [
    [["  CE QU'ON VIENT DE PROUVER, EN 13 TRANSACTIONS", T.dim]],
    [],
    [["   VaultCreate          ", T.ink], ["tesSUCCESS", T.ok]],
    [["   VaultDeposit         ", T.ink], ["tesSUCCESS", T.ok]],
    [["   LoanBrokerSet        ", T.ink], ["tesSUCCESS", T.ok]],
    [["   LoanSet 100%         ", T.ink], ["tesSUCCESS", T.ok]],
    [["⛔ ", T.bad], ["VaultWithdraw        ", T.ink], ["tecINSUFFICIENT_FUNDS", T.bad]],
    [["   EscrowCreate ×2      ", T.ink], ["tesSUCCESS", T.ok]],
    [["   EscrowFinish ×2      ", T.ink], ["tesSUCCESS", T.ok]],
    [["   LoanPay              ", T.ink], ["tesSUCCESS", T.ok]],
    [["   VaultWithdraw        ", T.ink], ["tesSUCCESS", T.ok]],
    [],
    [["  Durée totale : 00:56", T.dim]],
  ] });
  band(sl, true);
}

/* ══ 7 — exécution ═══════════════════════════════════════════════════════ */
{
  const sl = slide();
  head(sl, { eyebrow: "Exit Lane", num: "07 · 10", kicker: "Exécution", title: "Minimum bar : 8 sur 8" });

  term(sl, { x: ML, y: 2.0, w: 7.5, h: 3.9, title: "8 étapes, un seul run, chaque hash dans le README", lines: [
    [["1  Vault open-ended        ", T.ink], ["VaultCreate", T.cmd]],
    [["2  Dépôt de la prêteuse    ", T.ink], ["VaultDeposit", T.cmd]],
    [["3  Broker + first-loss     ", T.ink], ["LoanBrokerSet", T.cmd]],
    [["4  Origination + drawdown  ", T.ink], ["LoanSet", T.cmd]],
    [["5  Remboursement           ", T.ink], ["LoanPay", T.cmd]],
    [["6  Capital + rendement     ", T.ink], ["VaultWithdraw", T.cmd]],
    [["7  Garde-fous provoqués    ", T.ink], ["5 × tec", T.bad], [" + contrôle positif", T.dim]],
    [["8  Use case                ", T.ink], ["Exit Lane", T.cmd]],
    [],
    [["   valeur de part  1.000000000 → ", T.dim], ["1.006443880", T.ok]],
  ] });

  const R = [["15 / 15", "types XLS-65 et XLS-66 soumis au ledger"],
             ["0", "JSON à la main : tout est typé en 4.6.0"],
             ["1", "helper de signature réécrit"]];
  R.forEach(([n, l], i) => {
    const y = 2.0 + i * 1.34;
    card(sl, { x: 8.68, y, w: 3.77, h: 1.2 });
    txt(sl, n, { x: 8.96, y: y + 0.18, w: 3.2, h: 0.45, fs: 24, bold: true, color: BLUE, ff: FH });
    txt(sl, l, { x: 8.96, y: y + 0.68, w: 3.3, h: 0.4, fs: 11.5, color: GREY, ls: 15 });
  });
  band(sl);
}

/* ══ 8 — feedback, item phare ════════════════════════════════════════════ */
{
  const sl = slide();
  head(sl, { eyebrow: "Feedback · 40 % de la note", num: "08 · 10", kicker: "Item n°1",
    title: "« First-loss capital » : le nom ment" });

  const cell = (t, o = {}) => ({ text: t, options: {
    fontFace: o.mono ? FM : FB, fontSize: o.fs ?? 11.5, bold: o.bold ?? false,
    color: o.color ?? GREY, align: o.align ?? "left", valign: "middle",
    fill: { color: o.fill ?? WHITE }, margin: [0, 0.14, 0, 0.14],
    border: [{ type: "none" }, { type: "none" }, { type: "solid", color: LINE, pt: 0.75 }, { type: "none" }],
  } });
  const h = (t, align) => ({ text: t.toUpperCase(), options: {
    fontFace: FB, fontSize: 8.5, bold: true, color: WHITE, charSpacing: 0.6,
    align: align ?? "left", valign: "middle", fill: { color: NAVY }, margin: [0, 0.14, 0, 0.14],
  } });

  sl.addTable([
    [h("Décor"), h("Vault"), h("Prêt"), h("Couverture postée"), h("Couverture ponctionnée", "right"), h("Perte du déposant", "right"), h("Valeur de la part", "right")],
    [cell("A", { bold: true, color: NAVY }), cell("200 XRP"), cell("50 XRP"), cell("50 XRP"),
     cell("0,25 XRP", { mono: true, bold: true, color: CORAL, align: "right" }),
     cell("49,75 XRP", { mono: true, bold: true, color: NAVY, align: "right" }),
     cell("1,000 → 0,751", { mono: true, align: "right" })],
    [cell("B", { bold: true, color: NAVY, fill: CARD }), cell("5 XRP", { fill: CARD }), cell("4 XRP", { fill: CARD }), cell("1 XRP", { fill: CARD }),
     cell("0,02 XRP", { mono: true, bold: true, color: CORAL, align: "right", fill: CARD }),
     cell("3,98 XRP · 79,6 %", { mono: true, bold: true, color: NAVY, align: "right", fill: CARD }),
     cell("1,000 → 0,204", { mono: true, align: "right", fill: CARD })],
  ], { x: ML, y: 2.1, w: CW, colW: [0.95, 1.35, 1.15, 1.9, 2.2, 2.32, 1.7], rowH: [0.38, 0.46, 0.46] });

  term(sl, { x: ML, y: 3.62, w: CW, h: 2.06, title: "le nom, et ce qu'il fait", fs: 11.5, step: 0.3, lines: [
    [["CoverRateLiquidation: 5 %", T.ink], ["   se lit  « 5 % du défaut »", T.dim]],
    [["                         ", T.ink], ["   c'est   « 5 % du minimum requis »", T.bad, true]],
    [],
    [["deux ordres de grandeur, et les trois taux du broker sont figés à sa création", T.dim]],
  ] });

  txt(sl, "Dans la minute, le broker a repris les 98 % intacts : le défaut met DebtTotal à zéro, donc le plancher aussi.",
    { x: ML, y: 5.9, w: CW, h: 0.3, fs: 12, color: NAVY });
  band(sl);
}

/* ══ 9 — feedback, la suite ══════════════════════════════════════════════ */
{
  const sl = slide();
  head(sl, { eyebrow: "Feedback", num: "09 · 10", kicker: "Six autres", title: "Toutes reproductibles, toutes avec leur hash" });

  const F = [
    ["Un retard d'une seconde bloque tout paiement", "Le flag tfLoanLatePayment est requis, et n'est pas documenté comme tel.", "tecEXPIRED", CORAL, PEACHBG],
    ["La valeur de part évidente est 150 % trop haute", "LossUnrealized n'est pas déduit d'AssetsTotal, et disparaît du nœud à zéro.", "LossUnrealized", CORAL, PEACHBG],
    ["AssetsMaximum: 0 désactive le plafond", "au lieu de geler les dépôts. Irréversible tant qu'il reste des déposants.", "tecLIMIT_EXCEEDED", CHIPTX, BLUECARD],
    ["Le flag d'amendment ne dit pas ce qui est appliqué", "V1.1 est enabled, sa restriction sur LoanBrokerSet ne l'est pas.", "tesSUCCESS × 2", CHIPTX, BLUECARD],
    ["Un tableau de bord = 8 appels RPC", "et 6 formules à la main. loan_info n'existe pas, vault → prêts n'a pas d'index.", "missing primitive", CHIPTX, BLUECARD],
    ["Un seul code pour deux remèdes opposés", "Déposer de la couverture, ou attendre des déposants.", "tecINSUFFICIENT_FUNDS", CHIPTX, BLUECARD],
  ];
  const c = cols(3);
  F.forEach(([t, d, code, col, bg], i) => {
    const cl = i % 3, row = (i - cl) / 3;
    const x = c.x(cl), y = 2.1 + row * 1.92;
    card(sl, { x, y, w: c.w, h: 1.8 });
    txt(sl, t, { x: x + 0.26, y: y + 0.22, w: c.w - 0.52, h: 0.54, fs: 13, bold: true, color: NAVY, ls: 17 });
    txt(sl, d, { x: x + 0.26, y: y + 0.82, w: c.w - 0.52, h: 0.6, fs: 11, color: GREY, ls: 15 });
    chip(sl, code, { x: x + 0.26, y: y + 1.44, color: col, fill: bg, fs: 8 });
  });

  txt(sl, "FEEDBACK.md — chaque item avec sa repro et son hash.", { x: ML, y: 6.2, w: 8, h: 0.3, fs: 12.5, color: NAVY });
  band(sl);
}

/* ══ 10 — propositions ═══════════════════════════════════════════════════ */
{
  const sl = slide(true);
  head(sl, { dark: true, eyebrow: "Feedback", num: "10 · 10", kicker: "Ce qu'on propose", title: "Trois corrections, quatre contributions" });

  [["Retourner les champs nuls, et les grandeurs dérivées.", "SharePriceNet, MaxWithdrawable, DebtCapacity. Supprime une classe entière de bugs clients silencieux — dont le nôtre."],
   ["Faire dire à chaque tec sa cause.", "Quatre codes couvrent deux à quatre situations, parfois de remèdes opposés."],
   ["Documenter le paiement en retard.", "tecEXPIRED dans la table de LoanPay, et le flag donné comme requis."],
  ].forEach(([t, d], i) => {
    const y = 2.25 + i * 1.1;
    bullet(sl, i + 1, { x: ML, y: y + 0.02, d: 0.32, fill: BLUE });
    txt(sl, t, { x: ML + 0.56, y, w: CW - 0.56, h: 0.3, fs: 15, bold: true, color: WHITE });
    txt(sl, d, { x: ML + 0.56, y: y + 0.36, w: CW - 0.8, h: 0.36, fs: 12, color: "A9BBDC" });
  });

  card(sl, { x: ML, y: 5.7, w: CW, h: 1.0, fill: "0A2A72", line: "1C3D85" });
  caps(sl, "Prêt à partir", { x: ML + 0.32, y: 5.9, w: 3, fs: 9, color: SKY });
  let cx = ML + 0.32;
  ["PR xrpl.js : signer LoanSet côté contrepartie", "PR doc : 2 typos", "fix 1 ligne validateVaultCreate", "_probe-inventory.mjs"]
    .forEach((t) => { cx += chip(sl, t, { x: cx, y: 6.2, fill: "12357E", color: SKY, ff: FB, fs: 9 }) + 0.16; });
  txt(sl, "github.com/charlyppr/xrpl-lending", { x: MR - 4.4, y: 5.9, w: 4.1, h: 0.3, fs: 11.5, color: WHITE, ff: FM, align: "right" });
  band(sl, true);
}

p.writeFile({ fileName: process.argv[2] || "deck/exit-lane.pptx" }).then((f) => console.log("écrit :", f));
