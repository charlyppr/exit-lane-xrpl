const pptxgen = require("pptxgenjs");
const p = new pptxgen();
p.layout = "LAYOUT_16x9";           // 10" x 5.625"
p.author = "CY-HACK";
p.title = "Exit Lane";

const BG="0E1117", CARD="1A2130", CARD2="222B3D", INK="EDF1F7", MUT="8C97AB",
      AMBER="F2A104", GREEN="35C48F", RED="E8595C", LINE="2C3448";
const H="Cambria", B="Calibri", M="Courier New";

const s = (bg) => { const x = p.addSlide(); x.background = { color: bg || BG }; return x; };
const title = (sl, t, y) => sl.addText(t, { x:0.55, y:y??0.46, w:8.9, h:0.7, fontSize:34, bold:true,
  color:INK, fontFace:H, isTextBox:true, margin:0 });
const kicker = (sl, t, y) => sl.addText(t.toUpperCase(), { x:0.55, y:y??0.3, w:8.9, h:0.25, fontSize:11,
  bold:true, color:AMBER, fontFace:B, charSpacing:2, isTextBox:true, margin:0 });
const card = (sl, o) => sl.addShape(p.ShapeType.roundRect, { x:o.x, y:o.y, w:o.w, h:o.h,
  fill:{ color:o.fill||CARD }, rectRadius:0.06, line:{ color:o.line||LINE, width:0.75 },
  shadow:{ type:"outer", angle:90, blur:6, offset:1, color:"000000", opacity:0.35 } });
const mono = (sl, t, o) => sl.addText(t, { x:o.x, y:o.y, w:o.w, h:o.h||0.24, fontSize:o.fs||9,
  color:o.color||MUT, fontFace:M, isTextBox:true, margin:0, align:o.align||"left" });
const body = (sl, t, o) => sl.addText(t, { x:o.x, y:o.y, w:o.w, h:o.h, fontSize:o.fs||14,
  color:o.color||INK, fontFace:B, isTextBox:true, margin:0, lineSpacing:o.ls||20, align:o.align||"left",
  bold:o.bold||false, italic:o.italic||false });
const foot = (sl, t) => sl.addText(t, { x:0.55, y:5.06, w:8.9, h:0.25, fontSize:9, color:"5C677D",
  fontFace:B, isTextBox:true, margin:0 });

/* 1 — Titre */
{ const sl = s();
  body(sl,"CY-HACK",{x:0.55,y:0.45,w:4,h:0.3,fs:12,color:AMBER,bold:true});
  sl.addText("Exit Lane",{x:0.55,y:1.25,w:9,h:1.0,fontSize:60,bold:true,color:INK,fontFace:H,isTextBox:true,margin:0});
  body(sl,"Un vault open-ended promet le retrait à tout moment.\nIl cesse de pouvoir tenir cette promesse dès qu'il fonctionne bien.",
    {x:0.55,y:2.35,w:8.2,h:0.9,fs:17,color:MUT,ls:26});
  card(sl,{x:0.55,y:3.6,w:8.9,h:0.95});
  body(sl,"Track 1 — Open-ended vault",{x:0.85,y:3.82,w:3.2,h:0.3,fs:13,bold:true});
  body(sl,"Lending Protocol V1",{x:0.85,y:4.12,w:3.2,h:0.3,fs:12,color:MUT});
  body(sl,"Flavour Loaded",{x:4.2,y:3.82,w:2.4,h:0.3,fs:13,bold:true});
  body(sl,"XLS-65 · XLS-66 · TokenEscrow",{x:4.2,y:4.12,w:2.6,h:0.3,fs:12,color:MUT});
  body(sl,"xrpl@4.6.0 stable",{x:7.0,y:3.82,w:2.3,h:0.3,fs:13,bold:true});
  mono(sl,"network_id 4001",{x:7.0,y:4.14,w:2.3,h:0.25,fs:10});
  foot(sl,"Custom Hackathon Devnet · rippled 3.4.0-rc1 · 12-13 septembre 2026"); }

/* 2 — Le problème */
{ const sl = s();
  kicker(sl,"Le problème");
  title(sl,"Ouvert en droit, fermé en fait");
  body(sl,"Le vault finance des prêts à terme fixe. Un seul LoanSet peut absorber la totalité de la liquidité — sans avertissement, sans plancher, sans plafond.",
    {x:0.55,y:1.2,w:8.9,h:0.7,fs:15,color:MUT,ls:22});
  const K=[["100 %",AMBER,"du capital prêté\nen une transaction"],
           ["0,000000",RED,"XRP encore\nretirables"],
           ["4",INK,"échéances avant\nle prochain remboursement"]];
  K.forEach(([n,c,l],i)=>{ const x=0.55+i*3.03;
    card(sl,{x,y:2.1,w:2.83,h:1.75});
    sl.addText(n,{x:x+0.22,y:2.32,w:2.4,h:0.62,fontSize:n.length>5?30:42,bold:true,color:c,fontFace:H,isTextBox:true,margin:0});
    body(sl,l,{x:x+0.22,y:3.05,w:2.45,h:0.65,fs:12,color:MUT,ls:16}); });
  body(sl,"Le champ AssetsAvailable ne tombe pas à zéro : il disparaît du nœud. Un client naïf affiche NaN au moment précis où le déposant en a le plus besoin.",
    {x:0.55,y:4.15,w:8.9,h:0.6,fs:13,color:INK,ls:19,italic:true});
  foot(sl,"Rencontré en écrivant la démo, pas mis en scène."); }

/* 3 — Le mur */
{ const sl = s();
  kicker(sl,"La découverte");
  title(sl,"Le protocole dit non");
  body(sl,"La trésorière a une facture à payer. Elle demande ses 30 XRP.",{x:0.55,y:1.2,w:8.9,h:0.3,fs:15,color:MUT});
  card(sl,{x:0.55,y:1.75,w:8.9,h:1.45,fill:CARD2});
  mono(sl,"VaultWithdraw  →  30 000 000 shares",{x:0.85,y:2.0,w:5.5,h:0.3,fs:14,color:INK});
  sl.addText("tecINSUFFICIENT_FUNDS",{x:0.85,y:2.42,w:5.5,h:0.45,fontSize:24,bold:true,color:RED,fontFace:M,isTextBox:true,margin:0});
  mono(sl,"72A5FD04EF0B190B4E01F1E7\nDA508CD6423CCB62811AE34D",{x:6.5,y:2.08,w:2.7,h:0.6,fs:9,align:"right"});
  body(sl,"vérifiable on-chain",{x:6.5,y:2.72,w:2.7,h:0.25,fs:10,color:MUT,align:"right"});
  const R=[["tec","inscrit dans le ledger, avec un hash — ce que le jury peut vérifier",GREEN],
           ["tem","rejet local, aucune trace, aucun hash",MUT]];
  R.forEach(([k,v,c],i)=>{ const y=3.5+i*0.62;
    sl.addText(k,{x:0.55,y,w:0.7,h:0.35,fontSize:17,bold:true,color:c,fontFace:M,isTextBox:true,margin:0});
    body(sl,v,{x:1.35,y:y+0.05,w:8.0,h:0.3,fs:13,color:c===GREEN?INK:MUT}); });
  foot(sl,"Nos cinq garde-fous de l'étape 7 sont des tec. La distinction compte."); }

/* 4 — La solution */
{ const sl = s();
  kicker(sl,"La réponse");
  title(sl,"Céder la part, jamais la créance");
  const C=[["Loan","La dette de l'emprunteur.","Aucune des 15 transactions XLS-65/66 ne la transfère. Elle ne bouge pas.",RED,"non cessible"],
           ["Part de vault","La quote-part du déposant.","Un MPT. Transférable, escrowable, et elle porte le rendement avec elle.",GREEN,"cessible"]];
  C.forEach(([t,d,x2,c,tag],i)=>{ const x=0.55+i*4.6;
    card(sl,{x,y:1.3,w:4.33,h:2.5});
    sl.addText(t,{x:x+0.28,y:1.55,w:3.7,h:0.4,fontSize:22,bold:true,color:INK,fontFace:H,isTextBox:true,margin:0});
    sl.addText(tag.toUpperCase(),{x:x+0.28,y:2.02,w:3.7,h:0.25,fontSize:10,bold:true,color:c,fontFace:B,charSpacing:1.5,isTextBox:true,margin:0});
    body(sl,d,{x:x+0.28,y:2.38,w:3.75,h:0.3,fs:14,bold:true});
    body(sl,x2,{x:x+0.28,y:2.75,w:3.75,h:0.85,fs:13,color:MUT,ls:18}); });
  body(sl,"Vendre une part de fonds obligataire ne vend pas les obligations du portefeuille. L'emprunteur ne voit même pas la transaction.",
    {x:0.55,y:4.1,w:8.9,h:0.6,fs:14,ls:20,italic:true});
  foot(sl,"XLS-66 n'offre aucune cession de créance — item du rapport."); }

/* 5 — Le mécanisme */
{ const sl = s();
  kicker(sl,"Le mécanisme");
  title(sl,"Deux coffres, une seule clé");
  const S=[["1","L'acheteur verrouille son paiement","EscrowCreate · expire à +2 h","Il s'engage en premier : la vendeuse n'expose rien avant de voir l'argent bloqué."],
           ["2","La vendeuse verrouille ses parts","EscrowCreate · expire à +1 h","Expiration plus courte : une fois le secret révélé, elle a le temps d'encaisser."],
           ["3","L'acheteur prend les parts","EscrowFinish · le secret devient public","Pour les prendre, il est obligé de publier la clé qui libère le paiement."],
           ["4","La vendeuse encaisse","EscrowFinish · secret relu dans le ledger","Aucune variable locale. C'est la publication on-chain qui prouve l'atomicité."]];
  S.forEach(([n,t,tx,d],i)=>{ const y=1.2+i*0.93;
    sl.addShape(p.ShapeType.ellipse,{x:0.55,y:y+0.06,w:0.42,h:0.42,fill:{color:AMBER}});
    sl.addText(n,{x:0.55,y:y+0.06,w:0.42,h:0.42,fontSize:15,bold:true,color:BG,fontFace:B,align:"center",valign:"middle",isTextBox:true,margin:0});
    body(sl,t,{x:1.2,y:y+0.02,w:4.3,h:0.3,fs:15,bold:true});
    body(sl,d,{x:1.2,y:y+0.35,w:5.15,h:0.5,fs:12,color:MUT,ls:15});
    mono(sl,tx,{x:6.5,y:y+0.1,w:2.95,h:0.3,fs:10,align:"right",color:GREEN}); });
  foot(sl,"Ni notaire, ni séquestre, ni confiance. Le DEX refuse les MPT : temDISABLED."); }

/* 6 — Démo */
{ const sl = s("151C2B");
  body(sl,"MAINTENANT",{x:0.55,y:1.55,w:4,h:0.3,fs:12,color:AMBER,bold:true});
  sl.addText("Démo live",{x:0.55,y:2.0,w:6,h:0.9,fontSize:54,bold:true,color:INK,fontFace:H,isTextBox:true,margin:0});
  body(sl,"13 transactions · 1 min 13 s · sur le devnet, en direct",{x:0.55,y:3.0,w:6.5,h:0.35,fs:17,color:MUT});
  const D=["Le vault tourne et se vide","Le mur : le retrait est refusé","La cession atomique","Le vault paie l'acheteur"];
  D.forEach((t,i)=>{ const y=1.55+i*0.72;
    card(sl,{x:6.6,y,w:2.85,h:0.6,fill:CARD});
    body(sl,`${i+1}.  ${t}`,{x:6.85,y:y+0.18,w:2.5,h:0.3,fs:12}); });
  foot(sl,"node scripts/demo.mjs"); }

/* 7 — Minimum bar */
{ const sl = s();
  kicker(sl,"Exécution");
  title(sl,"Minimum bar : 8 étapes sur 8");
  const rows=[["1","Vault open-ended","VaultCreate"],["2","Dépôt du prêteur","VaultDeposit"],
    ["3","Broker + first-loss","LoanBrokerSet"],["4","Origination et drawdown","LoanSet"],
    ["5","Remboursement","LoanPay"],["6","Capital + rendement","VaultWithdraw"],
    ["7","Garde-fous provoqués","5 × tec + contrôle positif"],["8","Use case","Exit Lane"]];
  rows.forEach(([n,t,tx],i)=>{ const col=i%2, row=Math.floor(i/2);
    const x=0.55+col*4.6, y=1.25+row*0.83;
    card(sl,{x,y,w:4.33,h:0.68});
    sl.addText(n,{x:x+0.2,y:y+0.17,w:0.3,h:0.34,fontSize:15,bold:true,color:AMBER,fontFace:H,isTextBox:true,margin:0});
    body(sl,t,{x:x+0.6,y:y+0.09,w:2.3,h:0.25,fs:13,bold:true});
    mono(sl,tx,{x:x+0.6,y:y+0.36,w:3.5,h:0.22,fs:9}); });
  body(sl,"Rendement démontré, pas raconté : la part passe de 1,000000000 à 1,000214800 après une seule échéance.",
    {x:0.55,y:4.7,w:8.9,h:0.35,fs:13,italic:true});
  foot(sl,"Chaque étape a son lien explorer dans le README."); }

/* 8 — Feedback H1 */
{ const sl = s();
  kicker(sl,"Feedback — item n°1");
  title(sl,"« First-loss capital » : le nom ment");
  body(sl,"Il n'absorbe pas la première perte. Décor isolé : 200 XRP de vault, un prêt de 50 XRP, 50 XRP de couverture. Nous provoquons le défaut.",
    {x:0.55,y:1.28,w:8.9,h:0.34,fs:14,color:MUT});
  const K=[["0,25 XRP",RED,"ponctionnés sur le\nfirst-loss capital"],
           ["49,75 XRP",AMBER,"encaissés par\nles déposants"],
           ["49,75 XRP",MUT,"de couverture restée\nintacte et disponible"]];
  K.forEach(([n,c,l],i)=>{ const x=0.55+i*3.03;
    card(sl,{x,y:1.85,w:2.83,h:1.6});
    sl.addText(n,{x:x+0.22,y:2.05,w:2.45,h:0.55,fontSize:27,bold:true,color:c,fontFace:H,isTextBox:true,margin:0});
    body(sl,l,{x:x+0.22,y:2.68,w:2.45,h:0.6,fs:12,color:MUT,ls:16}); });
  card(sl,{x:0.55,y:3.65,w:8.9,h:1.05,fill:CARD2});
  body(sl,"Conforme à la formule documentée — et c'est bien le problème.",{x:0.85,y:3.82,w:8.3,h:0.28,fs:14,bold:true});
  mono(sl,"CoverRateLiquidation: 5 %  se lit « 5 % du défaut ».  C'est 5 % du minimum requis.",{x:0.85,y:4.14,w:8.3,h:0.25,fs:11,color:AMBER});
  body(sl,"Deux ordres de grandeur. La part du déposant tombe de 1,000000000 à 0,751250000.",{x:0.85,y:4.4,w:8.3,h:0.25,fs:12,color:MUT});
  foot(sl,"Paramètres figés à la création du broker : l'erreur est irrattrapable."); }

/* 9 — Autres items */
{ const sl = s();
  kicker(sl,"Feedback — la suite");
  title(sl,"Quatre autres, tous reproductibles");
  const F=[["lsfMPTCanTrade posé, DEX indisponible","Le protocole marque lui-même les parts comme échangeables. OfferCreate renvoie temDISABLED : XLS-82 n'est pas déployé."],
           ["tecNO_AUTH non documenté","Transférer des parts exige un MPTokenAuthorize du destinataire. Absent des cinq causes d'échec que la doc énumère."],
           ["GracePeriod : plancher à 60 s","59 s renvoie temINVALID, qui ne nomme ni le champ ni la borne. Trouvé par dichotomie, en sept essais."],
           ["tfLoanImpair : tecTOO_SOON","Avant l'échéance et après. Le seul outil de gestion du risque du broker est resté inutilisable."]];
  F.forEach(([t,d],i)=>{ const col=i%2, row=Math.floor(i/2);
    const x=0.55+col*4.6, y=1.25+row*1.72;
    card(sl,{x,y,w:4.33,h:1.55});
    body(sl,t,{x:x+0.28,y:y+0.2,w:3.8,h:0.5,fs:14,bold:true,ls:18});
    body(sl,d,{x:x+0.28,y:y+0.72,w:3.8,h:0.72,fs:11.5,color:MUT,ls:15}); });
  foot(sl,"FEEDBACK.md — 3 pages, tri par sévérité. Journal brut : 1 620 lignes."); }

/* 10 — Propositions */
{ const sl = s("151C2B");
  kicker(sl,"Ce qu'on propose");
  title(sl,"Trois corrections, une contribution");
  const P=["Renommer CoverRateLiquidation, ou exposer la couverture effective par unité de dette sur le nœud LoanBroker.",
           "Un LiquidityBufferMinimum sur le broker : aujourd'hui un seul prêt peut enfermer tous les déposants.",
           "Faire dire aux erreurs quel champ est en cause. temINVALID sur dix champs numériques se debug à l'aveugle."];
  P.forEach((t,i)=>{ const y=1.3+i*0.85;
    sl.addShape(p.ShapeType.ellipse,{x:0.55,y:y+0.04,w:0.38,h:0.38,fill:{color:AMBER}});
    sl.addText(String(i+1),{x:0.55,y:y+0.04,w:0.38,h:0.38,fontSize:14,bold:true,color:BG,fontFace:B,align:"center",valign:"middle",isTextBox:true,margin:0});
    body(sl,t,{x:1.15,y:y+0.02,w:8.3,h:0.6,fs:14.5,ls:19}); });
  card(sl,{x:0.55,y:3.9,w:8.9,h:0.85,fill:CARD});
  body(sl,"Une PR de doc prête à partir",{x:0.85,y:4.06,w:4.2,h:0.28,fs:14,bold:true,color:GREEN});
  body(sl,"depostitor · PrincipleOutstanding · l'opt-in manquant",{x:0.85,y:4.36,w:5.5,h:0.25,fs:12,color:MUT});
  body(sl,"github.com/charlyppr/xrpl-lending",{x:5.6,y:4.2,w:3.6,h:0.3,fs:12,color:INK,align:"right"});
  foot(sl,"CY-HACK — Exit Lane"); }

p.writeFile({ fileName: process.argv[2] }).then(f => console.log("écrit :", f));
