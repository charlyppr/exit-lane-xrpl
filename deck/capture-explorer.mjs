// Captures de l'explorer XRPL pour feedback-report.pdf.
//   node deck/capture-explorer.mjs          → deck/shots/*.png
// Chrome headless piloté par le protocole DevTools : aucune dépendance (fetch et
// WebSocket sont natifs dans Node ≥ 22). Chaque capture est un recadrage
// rectangulaire d'une vraie page de l'explorer ; rien n'est retouché. Le bandeau
// cookies est refusé (« Reject All »). Vue zoomée : viewport 460 px, rendu ×5,25 ; le hash figure dans la légende du PDF.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EXPLORER = "https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/";
// fileURLToPath, pas .pathname : le chemin du repo contient un espace, que
// .pathname laisse encodé en %20 — et mkdirSync crée alors un faux dossier.
const OUT = fileURLToPath(new URL("./shots/", import.meta.url));
const PROFILE = mkdtempSync(join(tmpdir(), "xrpl-shots-"));
const W = 460, DPR = 5.25, port = 9340;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Une page = une transaction dans un onglet ; chaque crop est une expression JS
// qui renvoie la liste des éléments à englober.
// Gabarits de recadrage : titre (type + statut), ligne du hash, section de
// l'onglet Detailed, ligne clé/valeur de l'onglet Simple.
const T = { e: `titleRow()`, px: 12, py: [6, 6] };
const H = { e: `[hashRow()]`, px: 12, py: [3, 3] };
const S = (name) => ({ e: `[section('${name}')]`, px: 12, py: [2, 4] });
const K = (label) => ({ e: `[kv('${label}')]`, px: 8, py: [-12, -22] });

const PAGES = [
  { hash: "96C3870480E4CB0C9E3B925F2965347DA0815A486CDB4B49545928E32D6B0BA4", tab: "Detailed", crops: {
    "f1a-type": T, "f1a-status": S("Status") } },
  { hash: "EFAD383F9B622357CE67CBB0518D9F9F5FC27BE611D43F26FD69427713FB608F", tab: "Detailed", crops: {
    "f1b-type": T, "f1b-flags": S("Flags") } },
  { hash: "C8678C1C0A10BE889124F40C03017038654B278E2D464FAC54784F55B35318FC", tab: "Detailed", crops: {
    "f2-type": T,
    "f2-meta": { e: `metaItems(/^It modified a node with type (Loan|Vault)$/)`, px: 22, py: [-1, 1] } } },
  { hash: "C8678C1C0A10BE889124F40C03017038654B278E2D464FAC54784F55B35318FC", tab: "Raw", expand: true, crops: {
    "f2-raw": { e: `vaultPairs(['AssetsAvailable','AssetsTotal','LossUnrealized'])`, px: 14, py: [1, 1] } } },
  { hash: "923F7D616B094C82197506CF2867907A93067041E3990D24BD07A19035F73EAC", tab: "Detailed", crops: {
    "f3a-type": T, "f3a-status": S("Status"), "f3a-flags": S("Flags"),
    "f3a-meta": { e: `metaItems(/^It modified the AccountRoot node of r(sR4Q|bhF8)/)`, px: 22, py: [3, 0] } } },
  { hash: "68DD97D949602FD470E0FA80B2526C3FDCFA3449095F7A7879F4D4430845D45E", tab: "Simple", crops: {
    "f3b-amount": K("Amount"), "f3b-date": K("DATE/TIME (UTC)") } },
  { hash: "5DC3A6E00F31DA82C69AB77669C64691BD71CAC49C169736F53D7C724147618B", tab: "Detailed", crops: {
    "f6a-type": T, "f6a-status": S("Status") } },
  { hash: "B92A90F59EBF79108B5414F61A12656F321EBC264E1BB186FCC14CAF259F9CAA", tab: "Detailed", crops: {
    "f6b-type": T, "f6b-status": S("Status") } },
  // « LoanBrokerCoverWithdraw » ne tient pas en 540 px : le titre seul, en 820.
  { hash: "68DD97D949602FD470E0FA80B2526C3FDCFA3449095F7A7879F4D4430845D45E", tab: "Simple", w: 820, crops: {
    "f3b-type": T } },
  { hash: "A336D71E738AA27C2B449DE05A0FE5C8945733A53420B9B4D8390172404CC1E2", tab: "Simple", crops: {
    "f5a-type": T, "f5a-max": K("Assets Maximum"), "f5a-date": K("DATE/TIME (UTC)") } },
  { hash: "D27E21CBB4C55F70963BEDB00DFDB28A4C25B8A355619CAE85566CA63E25B956", tab: "Simple", crops: {
    "f5b-type": T, "f5b-amount": K("Amount"), "f5b-date": K("DATE/TIME (UTC)") } },
];

const HELPERS = `
  window.__leaf = (re, root=document) => [...root.querySelectorAll('*')].filter(e => e.children.length===0 && re.test((e.innerText||'').trim()));
  window.hashRow = () => document.querySelector('.transaction .summary .txid');
  window.titleRow = () => [document.querySelector('.transaction .summary .type'), document.querySelector('.transaction .summary .tx-status')];
  window.section = (name) => __leaf(new RegExp('^'+name+'$'))[0].parentElement;
  window.kv = (label) => { const want=label.toUpperCase();
    const e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&(x.innerText||'').trim().toUpperCase()===want);
    if(!e) throw new Error('libellé introuvable: '+label);
    let p=e.parentElement; for(let i=0;i<3&&p&&(p.innerText||'').trim().length<=label.length+1;i++) p=p.parentElement; return p; };
  window.metaItems = (re) => [...document.querySelectorAll('li')].filter(li => re.test((li.innerText||'').trim().split('\\n')[0].trim()));
  window.vaultPairs = (props) => { const pairs=[...document.querySelectorAll('.json-view--pair')];
    const vault=pairs.find(p=>p.querySelector(':scope > .json-view--property')?.innerText==='LedgerEntryType'&&/"Vault"/.test(p.innerText));
    const obj=vault.parentElement; const ff=[...obj.children].find(c=>c.querySelector?.(':scope > .json-view--property')?.innerText==='FinalFields');
    const inner=[...ff.querySelectorAll('.json-view--pair')].filter(p=>props.includes(p.querySelector(':scope > .json-view--property')?.innerText));
    const first=inner[0], last=inner[inner.length-1];
    // englober toutes les lignes entre la première et la dernière propriété voulue
    const between=[...ff.querySelectorAll(':scope .json-view--pair')].filter(p=>{const a=first.compareDocumentPosition(p),b=last.compareDocumentPosition(p);
      return (p===first||p===last||((a & Node.DOCUMENT_POSITION_FOLLOWING)&&(b & Node.DOCUMENT_POSITION_PRECEDING))) && p.parentElement===first.parentElement;});
    return between; };
  window.__box = (els, px, py) => { if(!els||!els.length) throw new Error('crop vide'); const rs=els.map(e=>e.getBoundingClientRect());
    const [pt, pb] = Array.isArray(py) ? py : [py, py];
    const x=Math.max(0,Math.min(...rs.map(r=>r.left))-px), y=Math.min(...rs.map(r=>r.top))+scrollY-pt;
    const r=Math.min(innerWidth,Math.max(...rs.map(r=>r.right))+px), b=Math.max(...rs.map(r=>r.bottom))+scrollY+pb;
    return {x, y, width:r-x, height:b-y}; };
`;

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${PROFILE}`,
  "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
try {
  for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(250); } }
  for (const page of PAGES) {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
    let id = 0; const P = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m); P.delete(m.id); } };
    const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (x) => { const r = await cmd("Runtime.evaluate", { expression: x, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "eval error"); return r.result?.result?.value; };
    await cmd("Page.enable");
    await cmd("Emulation.setDeviceMetricsOverride", { width: page.w ?? W, height: 2400, deviceScaleFactor: DPR, mobile: false });
    await cmd("Page.navigate", { url: EXPLORER + page.hash + (page.tab === "Simple" ? "" : "/" + page.tab.toLowerCase()) });
    for (let i = 0; i < 80; i++) { await sleep(500); const tx = (await ev("document.body?.innerText||''")) ?? ""; if (/HASH:/.test(tx) && /(Success|Fail)/.test(tx)) break; }
    await sleep(1500);
    await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Reject All\\s*$/i.test(x.innerText));if(b)b.click()})()`);
    await sleep(800);
    await sleep(page.tab === "Simple" ? 0 : 1500);
    if (page.expand) for (let k = 0; k < 6; k++) {
      const n = await ev(`(()=>{const b=[...document.querySelectorAll('.json-view-container button.jv-button')];b.forEach(x=>x.click());return b.length})()`);
      await sleep(500); if (!n) break;
    }
    await ev(HELPERS);
    await ev("window.scrollTo(0,0)");
    for (const [name, spec] of Object.entries(page.crops)) {
      const { e: expr, px = 12, py = 12 } = typeof spec === "string" ? { e: spec } : spec;
      const clip = await ev(`__box(${expr}, ${px}, ${JSON.stringify(py)})`);
      const s = await cmd("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
      writeFileSync(`${OUT}${name}.png`, Buffer.from(s.result.data, "base64"));
      console.log(`✓ ${name.padEnd(11)} ${page.hash.slice(0, 8)} ${page.tab.padEnd(8)} ${Math.round(clip.width)}×${Math.round(clip.height)} css px`);
    }
    ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`);
  }
} finally { chrome.kill("SIGTERM"); await sleep(500); rmSync(PROFILE, { recursive: true, force: true }); }
