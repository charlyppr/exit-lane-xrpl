// Deck Exit Lane — 10 slides.
//
// Deux sources visuelles à réconcilier : le deck officiel Ripple / XRPL Lending
// Protocol (« final lending intro.pdf », relevé au pixel) pour les slides, et
// l'explorer XRPL pour les preuves on-chain (captures deck/shots/).
//
//   slides   navy #001C5C · bleu #006AFF · ciel #6DC3FF · corps #5F666E
//            rail dégradé de 0,10" à gauche, canevas 13,333 × 7,5"
//   fenêtres fond #000000 · bord #343437 · gris #A2A2A4 · orange #FF884B
//            menthe #84F0B6 · violet #B480FF   (relevés sur les captures)
//
// Terminal et captures partagent le même composant `win` : fond noir de
// l'explorer, barre à pastilles, adresse en monospace. L'orange de l'explorer
// marque tout échec, sur les slides comme dans les fenêtres.
//
// Typo : Poppins partout (Bold titres et chiffres, Medium intitulés, Regular
// corps, Light phrases longues), Menlo pour le code.
//
// Règle de contenu : une idée par slide, un titre et rien en bordure, un chiffre
// ou une capture plutôt qu'une phrase. Les petites informations qui servent la
// preuve (hash, flags, délai) vivent dans la barre d'adresse des fenêtres.
//
//   npm install pptxgenjs          # dans un dossier temporaire, PAS dans le projet
//   node deck/build-deck.cjs deck/exit-lane.pptx

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
      ORANGE = "F2703A",                                  // orange explorer, assombri pour le blanc
      CHIP = { bg: "EBF4FF", tx: "0045C6" },
      CHIPFAIL = { bg: "FFEEE5", tx: "B8481A" },
      CHIPDARK = { bg: "12357E", tx: SKY };

// fenêtres : palette de l'explorer
const X = { bg: "000000", edge: "343437", dim: "A2A2A4", ink: "FFFFFF",
            ok: "84F0B6", bad: "FF884B", cmd: "B480FF" };

const FH = "Poppins";          // titres et chiffres, en gras
const FB = "Poppins";          // corps
const FMED = "Poppins Medium"; // intitulés
const FL = "Poppins Light";    // phrases longues
const FM = "Menlo";            // code

const ML = 0.88, MR = 12.45, CW = 11.57;   // marges et largeur de contenu

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

const shot = (n) => path.join(__dirname, "shots", n + ".png");
const dim = (n) => { const b = fs.readFileSync(shot(n)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

const slide = (dark) => {
  const sl = p.addSlide();
  sl.background = { color: dark ? NAVY : WHITE };
  sl.addImage({ data: RAIL, x: 0, y: 0, w: 0.10, h: 7.5 });
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

/* capsule de code : Menlo, largeur calculée sur l'avance réelle (0,6 em) + 0,22" de chaque côté */
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

/* grand chiffre + libellé */
const stat = (sl, n, l, o) => {
  const size = o.fs ?? 36;
  txt(sl, n, { x: o.x, y: o.y, w: o.w, h: size / 52, fs: size, bold: true, color: o.color ?? NAVY, ff: FH });
  txt(sl, l, { x: o.x, y: o.y + size / 52 + 0.02, w: o.w, h: 0.3, fs: 13, color: o.lcolor ?? GREY });
};

/* fenêtre commune au terminal et à l'explorer : fond noir, pastilles, adresse */
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

/* captures de l'explorer dans une fenêtre. Même grossissement pour toutes
   (2415 px de capture = largeur utile), sauf une capture plus large, réduite. */
const explorer = (sl, o) => {
  const padX = 0.2, padY = 0.14, inner = o.w - 2 * padX, k = inner / 2415;
  const imgs = o.files.map((n) => { const [pw, ph] = dim(n); const s = Math.min(k, inner / pw); return { n, w: pw * s, h: ph * s }; });
  const h = Math.max(o.h ?? 0, BAR + 2 * padY + imgs.reduce((a, i) => a + i.h, 0));
  win(sl, { x: o.x, y: o.y, w: o.w, h, label: o.label });
  let y = o.y + BAR + padY;
  imgs.forEach((i) => { sl.addImage({ path: shot(i.n), x: o.x + padX, y, w: i.w, h: i.h }); y += i.h; });
  return h;
};

/* terminal : lignes de segments [texte, couleur] ; une ligne marquée fail reçoit une pastille orange */
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

/* ── notes orateur : le pitch minuté, 4 min pile. ───────────────────────── */

const NOTES = [
`0:00 → 0:15 (15 s)

CY-HACK, track 1. Un vault open-ended promet le retrait à tout moment. Il ne peut plus tenir cette promesse dès qu'il fonctionne bien. Voici pourquoi, ce qu'on a construit, et ce que le protocole nous a appris.`,

`0:15 → 0:40 (25 s)

Une trésorière d'entreprise dépose 25 XRP. Un broker prête à des PME, sur quatre mois. Un seul LoanSet prend 100 % du vault, sans avertissement. Elle veut retirer : tecINSUFFICIENT_FUNDS, ici dans l'explorer. On l'a rencontré en écrivant la démo.`,

`0:40 → 1:00 (20 s)

Aucune transaction XLS-66 ne transfère un prêt. Mais la part de vault est un MPT, donc cessible. On la vend de gré à gré, à 97 % de sa valeur, avec deux escrows sous la même condition SHA-256 : pour prendre les parts, l'acheteur publie le secret qui paie la vendeuse.

Q&A : l'escrow de la vendeuse expire avant celui de l'acheteur pour qu'elle ait le temps d'encaisser. Limite : l'acheteur détient une option gratuite d'une heure (README, Known limitations). BatchV1_1 est actif, autre chemin atomique, non testé.`,

`1:00 → 2:00 (60 s)

Passer au terminal, commande déjà tapée : node scripts/demo.mjs --auto (56 s mesurées). Une phrase par scène :
1. Vault, dépôt, broker, couverture, et un prêt qui prend tout.
2. Elle veut sortir : refusé.
3. L'acheteur s'inscrit, deux escrows, il révèle le secret, elle le relit dans le ledger et encaisse.
4. L'emprunteur rembourse. C'est l'acheteur, qui n'a jamais déposé, qui retire, avec le rendement.

Si rien ne bouge pendant 15 s : Ctrl+C, revenir sur cette slide. Le terminal de droite est le run de référence, hashes dans le README.`,

`2:00 → 2:10 (10 s)

Les huit étapes du minimum bar dans un seul run, chaque hash dans le README. Les quinze types XLS-65 et XLS-66 soumis au ledger, tous typés dans xrpl 4.6.0. Maintenant, les trois frictions les plus importantes, chacune avec sa correction.`,

`2:10 → 2:40 (30 s)

Un : fixCleanup3_4_0 est actif sur le devnet et absent d'xrpl.org. Il change deux choses. L'impairment : le tutoriel dit d'impairer avant l'échéance, le ledger répond tecTOO_SOON jusqu'à l'échéance, à gauche. La signature de l'emprunteur sur LoanSet : nouveau préfixe, que le helper de xrpl 4.6.0 n'utilise pas, à droite.
Correction : lister l'amendement sur xrpl.org, mettre à jour le tutoriel, signer avec encodeForSigningCounterparty dans xrpl.js.`,

`2:40 → 3:05 (25 s)

Deux : un prêt 10 secondes en retard, dans son délai de grâce. Sans flag : tecEXPIRED, à gauche. Avec tfLoanLatePayment : succès, à droite, et l'explorer affiche ce flag en hexadécimal. L'échec est défini dans XLS-66, mais pas dans la référence LoanPay d'xrpl.org.
Correction : ajouter tecEXPIRED à la référence avec le flag comme remède, et nommer le flag dans l'explorer.`,

`3:05 → 3:35 (30 s)

Trois : broker à couverture minimale 10 %, liquidation 5 %. Défaut sur un prêt de 4 XRP. L'explorer montre 0,02 XRP pris sur la couverture : 4 × 10 % × 5 %, au drop près. Le déposant perd 3,98 XRP. C'est la formule documentée. En dessous : 21 secondes après le défaut, le broker retire les 0,98 XRP restants, parce que la dette, et donc le plancher, sont à zéro.
Correction : afficher la part d'un défaut que la couverture absorbe, et un délai de retrait après un défaut.`,

`3:35 → 3:50 (15 s)

Sept autres constats, chacun avec sa sévérité et sa correction dans le rapport. Citer seulement le 7 : la branche du hackathon a retiré la restriction V1.1 sur LoanBrokerSet, et le brief ne le dit pas.`,

`3:50 → 4:00 (10 s)

Tout est dans FEEDBACK.md, et en trois pages dans FEEDBACK.pdf. Les 143 hashes cités ont été relus sur le ledger avant soumission. Merci.`,
];
let slideNo = 0;
const notes = (sl) => sl.addNotes(NOTES[slideNo++]);

/* ══ 1 — titre ═══════════════════════════════════════════════════════════ */
{
  const sl = slide(true);
  let cx = ML;
  ["XLS-65", "XLS-66", "TokenEscrow"].forEach((t) => { cx += chip(sl, t, { x: cx, y: 2.25, c: CHIPDARK }) + 0.14; });
  txt(sl, "Exit Lane.", { x: ML - 0.05, y: 2.75, w: 9, h: 1.2, fs: 64, bold: true, color: WHITE, ff: FH });
  txt(sl, "Un vault open-ended promet le retrait à tout moment.\nIl ne peut plus le tenir dès qu'il fonctionne bien.",
    { x: ML, y: 4.1, w: 9.5, h: 0.9, fs: 19, color: SOFT, ff: FL, ls: 30 });
  txt(sl, "CY-HACK   ·   Track 1, vault open-ended   ·   Custom Hackathon Devnet   ·   xrpl@4.6.0",
    { x: ML, y: 6.45, w: CW, h: 0.3, fs: 11, color: SKY });
  notes(sl);
}

/* ══ 2 — le problème ═════════════════════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "Ouvert en droit, fermé en fait");

  [["100 %", BLUE, "du vault prêté par un seul LoanSet"],
   ["0 XRP", ORANGE, "retirable par la déposante"],
   ["4 mois", NAVY, "avant la dernière échéance"]].forEach(([n, col, l], i) =>
    stat(sl, n, l, { x: ML, y: 2.0 + i * 1.4, w: 4.8, color: col }));

  explorer(sl, { x: MR - 6.4, y: 2.5, w: 6.4, files: ["d-wall-type", "d-wall-status"],
    label: "explorer  ›  VaultWithdraw  ›  7AB5622E…CF934" });
  notes(sl);
}

/* ══ 3 — la réponse ══════════════════════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "Céder la part de vault, pas le prêt");

  const cw = CW / 4;
  rule(sl, 2.62, LINE, ML + 0.25, cw * 3);
  [["L'acheteur verrouille son paiement", "EscrowCreate · +2 h"],
   ["La vendeuse verrouille ses parts", "EscrowCreate · +1 h"],
   ["L'acheteur prend les parts et révèle le secret", "EscrowFinish"],
   ["La vendeuse relit le secret et encaisse", "EscrowFinish"],
  ].forEach(([t, tx], i) => {
    const x = ML + i * cw;
    badge(sl, i + 1, { x, y: 2.37, d: 0.5, fs: 15 });
    txt(sl, t, { x, y: 3.2, w: cw - 0.3, h: 1.0, fs: 17, color: NAVY, ff: FMED, ls: 24 });
    chip(sl, tx, { x, y: 4.4 });
  });

  rule(sl, 5.35);
  txt(sl, "Prix : 97 % de la valeur de part.", { x: ML, y: 5.6, w: 5.6, h: 0.35, fs: 16, color: NAVY, ff: FMED });
  txt(sl, "Une seule condition SHA-256 pour les deux escrows.", { x: ML + 5.8, y: 5.6, w: 5.8, h: 0.35, fs: 16, color: GREY });
  notes(sl);
}

/* ══ 4 — démo ════════════════════════════════════════════════════════════ */
{
  const sl = slide(true);
  txt(sl, "Démo live.", { x: ML - 0.05, y: 2.75, w: 5.2, h: 1.0, fs: 56, bold: true, color: WHITE, ff: FH });
  txt(sl, "13 transactions en 56 secondes,\nsur le devnet, en direct.", { x: ML, y: 3.9, w: 5, h: 0.8, fs: 18, color: SOFT, ff: FL, ls: 28 });

  const L = (label, code) => [["" + label.padEnd(24), X.ink], [code, code === "tesSUCCESS" ? X.ok : X.bad]];
  term(sl, { x: 6.35, y: 1.55, w: 6.1, fs: 11.5, step: 0.31, label: "~/xrpl-lending  $ node scripts/demo.mjs --auto", lines: [
    L("VaultCreate", "tesSUCCESS"),
    L("VaultDeposit", "tesSUCCESS"),
    L("LoanBrokerSet", "tesSUCCESS"),
    L("LoanBrokerCoverDeposit", "tesSUCCESS"),
    L("LoanSet 100 %", "tesSUCCESS"),
    fail(L("VaultWithdraw", "tecINSUFFICIENT_FUNDS")),
    L("MPTokenAuthorize", "tesSUCCESS"),
    L("EscrowCreate ×2", "tesSUCCESS"),
    L("EscrowFinish ×2", "tesSUCCESS"),
    L("LoanPay", "tesSUCCESS"),
    L("VaultWithdraw", "tesSUCCESS"),
    null,
    [["Durée totale  00:56", X.dim]],
  ] });
  notes(sl);
}

/* ══ 5 — exécution ═══════════════════════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "Minimum bar : 8 sur 8");

  const S = (n, label, tx, c) => [[`${n}  ${label.padEnd(24)}`, X.ink], [tx, c ?? X.cmd]];
  term(sl, { x: ML, y: 1.95, w: 7.3, fs: 12, step: 0.34, label: "README.md  ›  un hash par étape", lines: [
    S(1, "Vault open-ended", "VaultCreate"),
    S(2, "Dépôt", "VaultDeposit"),
    S(3, "Broker + couverture", "LoanBrokerSet"),
    S(4, "Origination + drawdown", "LoanSet"),
    S(5, "Remboursement", "LoanPay"),
    S(6, "Capital + rendement", "VaultWithdraw"),
    S(7, "Garde-fous provoqués", "5 × tec + 1 contrôle", X.bad),
    S(8, "Use case", "Exit Lane"),
    null,
    [["   valeur de part  1.000000000  →  ", X.dim], ["1.006443880", X.ok]],
  ] });

  stat(sl, "15 / 15", "types XLS-65/66 soumis au ledger", { x: 8.85, y: 2.25, w: 3.6, fs: 44, color: BLUE });
  stat(sl, "0", "type manquant dans xrpl@4.6.0", { x: 8.85, y: 4.05, w: 3.6, fs: 44, color: BLUE });
  notes(sl);
}

/* lignes « constat | détail » sous les preuves, la dernière porte la correction proposée */
const facts = (sl, y0, rows) => {
  rule(sl, y0 - 0.25);
  rows.forEach(([label, text], i) => {
    const fixRow = i === rows.length - 1;
    txt(sl, label, { x: ML, y: y0 + i * 0.47, w: 3.2, h: 0.35, fs: 15, color: fixRow ? BLUE : NAVY, ff: FMED });
    txt(sl, text, { x: ML + 3.2, y: y0 + i * 0.47, w: 8.3, h: 0.35, fs: 15, color: fixRow ? NAVY : GREY });
  });
};

/* ══ 6 — friction 1 : fixCleanup3_4_0 ════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "fixCleanup3_4_0 : actif, absent d'xrpl.org");
  txt(sl, "Deux comportements de prêt changent sur le devnet.", { x: ML, y: 1.62, w: CW, h: 0.35, fs: 16, color: GREY, ff: FL });

  const W = (CW - 0.4) / 2;
  term(sl, { x: ML, y: 2.45, w: W, fs: 12, step: 0.36, label: "LoanManage tfLoanImpair  ›  échéance T", lines: [
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

  facts(sl, 5.45, [
    ["Tutoriel Manage a Loan", "« impair a loan before a payment due date passes »"],
    ["xrpl@4.6.0", "signLoanSetByCounterparty signe avec l'ancien préfixe."],
    ["Correction proposée", "lister l'amendement, signer avec encodeForSigningCounterparty."],
  ]);
  notes(sl);
}

/* ══ 7 — friction 2 : paiement en retard ═════════════════════════════════ */
{
  const sl = slide();
  title(sl, "Un LoanPay en retard exige tfLoanLatePayment");
  txt(sl, "Prêt en retard, encore dans son délai de grâce.", { x: ML, y: 1.62, w: CW, h: 0.35, fs: 16, color: GREY, ff: FL });

  const W = (CW - 0.4) / 2;
  const h = explorer(sl, { x: ML, y: 2.45, w: W, files: ["f1a-type", "f1a-status"], label: "Flags 0  ›  96C38704…" });
  explorer(sl, { x: ML + W + 0.4, y: 2.45, w: W, h, files: ["f1b-type", "f1b-flags"], label: "Flags 262144  ›  EFAD383F…" });

  facts(sl, 5.45, [
    ["XLS-66, §3.11.4.2", "l'échec est défini (condition 11)."],
    ["Référence LoanPay", "huit codes d'erreur listés sur xrpl.org, tecEXPIRED n'y figure pas."],
    ["Correction proposée", "tecEXPIRED dans la référence LoanPay, flag nommé dans l'explorer."],
  ]);
  notes(sl);
}

/* ══ 8 — friction 3 : first-loss capital ═════════════════════════════════ */
{
  const sl = slide();
  title(sl, "First-loss capital : 0,5 % d'un prêt en défaut");

  stat(sl, "1 XRP", "de couverture posée par le broker", { x: ML, y: 1.85, w: 5.6 });
  stat(sl, "0,02 XRP", "prélevés sur la couverture au défaut", { x: ML, y: 2.95, w: 5.6, color: ORANGE });
  stat(sl, "3,98 XRP", "perdus par le déposant, 79,6 %", { x: ML, y: 4.05, w: 5.6 });

  rule(sl, 5.2, LINE, ML, 5.9);
  txt(sl, "4 XRP de dette × CoverRateMinimum 10 % × CoverRateLiquidation 5 %",
    { x: ML, y: 5.36, w: 6.2, h: 0.25, fs: 10.5, color: GREY, ff: FM });
  txt(sl, "Même ratio sur un prêt de 50 XRP : 0,25 XRP.", { x: ML, y: 5.68, w: 6, h: 0.3, fs: 12.5, color: MUT });
  txt(sl, "Correction proposée", { x: ML, y: 6.12, w: 5.9, h: 0.3, fs: 13, color: BLUE, ff: FMED });
  txt(sl, "Afficher la part d'un défaut que la couverture absorbe.\nUn délai sur LoanBrokerCoverWithdraw après un défaut.",
    { x: ML, y: 6.44, w: 5.9, h: 0.62, fs: 13, color: NAVY, ls: 20 });

  const W = 5.0, x = MR - W;
  const h1 = explorer(sl, { x, y: 1.8, w: W, files: ["f3a-type", "f3a-meta"], label: "LoanManage tfLoanDefault  ›  923F7D61…" });
  explorer(sl, { x, y: 1.8 + h1 + 0.22, w: W, files: ["f3b-type", "f3b-amount", "f3b-date"], label: "21 s après le défaut  ›  68DD97D9…" });
  notes(sl);
}

/* ══ 9 — feedback : les sept autres ══════════════════════════════════════ */
{
  const sl = slide();
  title(sl, "Sept autres constats");

  // numéro = section de FEEDBACK.md
  const F = [
    [4, "Exception du porteur unique absente d'xrpl.org", "LossUnrealized"],
    [5, "loan_info et loan_broker_info absents", "unknownCmd"],
    [6, "Quatre codes, deux à trois causes chacun", "tecINSUFFICIENT_FUNDS"],
    [7, "Restriction V1.1 de LoanBrokerSet retirée", "tesSUCCESS"],
    [8, "Devnet sur les ports 51233 et 51234 seulement", "réseau"],
    [9, "Aucun flag ne ferme un vault aux dépôts", "tecLIMIT_EXCEEDED"],
    [10, "Parts de vault lsfMPTCanTrade, OfferCreate refusé", "temDISABLED"],
  ];
  const gap = 0.6, w = (CW - gap) / 2;
  F.forEach(([n, t, code], i) => {
    const x = ML + (i % 2) * (w + gap), y = 1.95 + Math.floor(i / 2) * 1.2;
    rule(sl, y, LINE, x, w);
    badge(sl, n, { x, y: y + 0.26, d: 0.34, fs: n > 9 ? 9.5 : 11, fill: NAVY });
    txt(sl, t, { x: x + 0.52, y: y + 0.26, w: w - 0.52, h: 0.34, fs: 14, color: NAVY, ff: FMED, valign: "middle" });
    chip(sl, code, { x: x + 0.52, y: y + 0.72, fs: 9 });
  });
  txt(sl, "Sévérité et correction proposée pour chacun dans le rapport.",
    { x: ML + w + gap + 0.52, y: 1.95 + 3 * 1.2 + 0.3, w: w - 0.52, h: 0.6, fs: 13, color: GREY, ff: FL });
  notes(sl);
}

/* ══ 10 — clôture ════════════════════════════════════════════════════════ */
{
  const sl = slide(true);
  title(sl, "Dix constats, trois pages", true);

  txt(sl, "143 / 143", { x: ML - 0.04, y: 2.15, w: 8, h: 1.25, fs: 76, bold: true, color: SKY, ff: FH });
  txt(sl, "hashes cités, relus sur le ledger avant soumission", { x: ML, y: 3.5, w: CW, h: 0.4, fs: 19, color: SOFT, ff: FL });

  rule(sl, 4.6, "1C3D85");
  txt(sl, "github.com/charlyppr/xrpl-lending", { x: ML, y: 4.9, w: CW, h: 0.45, fs: 21, color: WHITE, ff: FM });
  let cx = ML;
  ["FEEDBACK.md", "FEEDBACK.pdf"].forEach((t) => { cx += chip(sl, t, { x: cx, y: 5.6, c: CHIPDARK }) + 0.14; });
  notes(sl);
}

p.writeFile({ fileName: process.argv[2] || "deck/exit-lane.pptx" }).then((f) => console.log("écrit :", f));
