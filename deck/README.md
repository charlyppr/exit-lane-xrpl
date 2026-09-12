# Deck — Exit Lane

`exit-lane.pptx` : 9 slides, 16:9 en 13,333 × 7,5 pouces, notes orateur minutées dans chaque slide.
`exit-lane.pdf` — le même deck exporté par PowerPoint, filet de sécurité pour
projeter sans dépendre d'une machine qui ait les bonnes polices.

## Design system

Deux sources à réconcilier : le deck officiel Ripple / XRPL Lending Protocol
(« final lending intro.pdf ») pour les slides, l'explorer XRPL pour les preuves.

| Rôle | Valeur |
|---|---|
| Fond sombre / titres | `#001C5C` |
| Accent | `#006AFF`, sur fond sombre `#6DC3FF` |
| Texte courant | `#5F666E` |
| Échec (chiffres, capsules) | `#F2703A`, l'orange de l'explorer assombri pour le blanc |
| Capsule de code | fond `#EBF4FF`, texte `#0045C6`, hauteur 0,32", 0,22" de marge de chaque côté |
| Fenêtre (terminal et explorer) | fond `#000000`, bord `#343437`, gris `#A2A2A4`, menthe `#84F0B6`, orange `#FF884B`, violet `#B480FF` |
| Rail de gauche | dégradé 8 bandes, 0,10" de large, pleine hauteur |

Les couleurs des fenêtres sont relevées sur les captures elles-mêmes : le
terminal et l'explorer partagent le composant `win` (fond noir, pastilles,
barre d'adresse en monospace). La barre d'adresse porte les petites
informations de preuve : hash abrégé, flags, délai.

**Polices.** Poppins partout : Bold pour les titres et les chiffres, Medium pour
les intitulés, Regular pour le corps, Light pour les phrases longues. Menlo pour
le code. Les quatre graisses de Poppins sont installées sur la machine et
embarquées dans le PDF.

Règle de contenu : un titre et rien d'autre en bordure (ni surtitre, ni numéro
de page, ni légende, ni bandeau), « CY-HACK » une seule fois sur la slide 1,
aucun emoji, un chiffre ou une capture plutôt qu'une phrase.

Grille : marge gauche 0,88", bord droit 12,45".

## Régénérer

```bash
npm install pptxgenjs      # dans un dossier temporaire, PAS dans le projet
node deck/build-deck.cjs deck/exit-lane.pptx
```

`pptxgenjs` n'est volontairement pas une dépendance du projet : `package.json`
fige `xrpl` et ne doit rien résoudre d'autre.

Réexporter le PDF, PowerPoint étant installé sur la machine :

```bash
osascript -e 'tell application "Microsoft PowerPoint"
  open POSIX file "/Users/charlypupier/Documents/Hackathon XRPL/xrpl-lending/deck/exit-lane.pptx"
  save active presentation in POSIX file "/Users/charlypupier/Documents/Hackathon XRPL/xrpl-lending/deck/exit-lane.pdf" as save as PDF
  close active presentation saving no
end tell'
```

## Pitch en 4 minutes

Le texte à dire est dans les notes de chaque slide (mode présentateur).

| # | Slide | Temps | Contenu |
|---|---|---|---|
| 1 | Exit Lane | 0:00 → 0:15 | Track, promesse du vault open-ended |
| 2 | Ouvert en droit, fermé en fait | 0:15 → 0:40 | 100 % prêté, retrait refusé (capture `7AB5622E`) |
| 3 | Céder la part de vault, pas le prêt | 0:40 → 1:00 | Les 4 transactions de l'échange |
| 4 | Démo live | 1:00 → 2:00 | `node scripts/demo.mjs --auto`, 56 s mesurées |
| 5 | Minimum bar : 8 sur 8 | 2:00 → 2:15 | 8 étapes, 15/15 types |
| 6 | First-loss capital : 0,5 % d'un prêt en défaut | 2:15 → 2:50 | Finding 3, captures `923F7D61` et `68DD97D9` |
| 7 | Un LoanPay en retard exige tfLoanLatePayment | 2:50 → 3:15 | Finding 2, captures `96C38704` et `EFAD383F` |
| 8 | Huit autres constats | 3:15 → 3:45 | Findings 1, 4 à 10 |
| 9 | Dix constats, trois pages | 3:45 → 3:55 | 143/143 hashes, repo |

Avant de monter sur scène : terminal ouvert à la racine du repo, commande
`node scripts/demo.mjs --auto` déjà tapée, `node scripts/check-connection.mjs`
passé dans les 10 minutes précédentes. Si la démo ne bouge pas pendant 15 s :
Ctrl+C, revenir à la slide 4, dont le terminal est le run de référence.

## État de vérification

Rendu par Microsoft PowerPoint et relu slide par slide sur le PDF exporté :
pas de débordement, pas de chevauchement. À refaire après toute modification
de `build-deck.cjs`.

Contenu aligné sur `FEEDBACK.md` au 12/09 23h. Retirés du deck parce que
l'audit de 22h45 les a invalidés : prix de part « surévalué de 150 % »,
« `AssetsMaximum: 0` non documenté », « flag V1.1 qui ment », « `tfLoanLatePayment`
non documenté », « PR xrpl.js pour signer `LoanSet` », « 8 appels RPC ».

Capture supplémentaire du deck : `node deck/capture-explorer.mjs d-`.

## `feedback-report.pdf` — le rapport de feedback

Même contenu que `FEEDBACK.md`, dans la DA du deck, avec de vraies captures de
l'explorer. Trois pages, faits uniquement, sans recommandation.

```bash
node deck/capture-explorer.mjs                             # captures → deck/shots/
tectonic -X compile deck/feedback-report.tex --outdir deck
```

`capture-explorer.mjs` pilote Chrome headless (protocole DevTools, sans
dépendance), refuse le bandeau cookies, et recadre chaque capture sur un élément
du DOM de l'explorer. Viewport 460 px, rendu ×5,25 : le PDF place toutes les
captures au même grossissement.

Taille des captures dans le rapport : 460 px CSS pour la largeur d'une colonne,
soit ≈ 0,56 pt par px CSS. Le texte de l'explorer sort alors entre 7 et 10 pt,
comme les tableaux et le corps. Le titre de transaction de l'explorer
(≈ 40 px CSS, donc ≈ 22 pt) n'est pas repris : le rapport utilise la pastille
de statut seule (`*-badge`) et nomme la transaction dans la légende. Le deck,
lui, garde les titres (`*-type`). Chaque capture forme un bloc insécable avec
sa légende et son hash.

```bash
node deck/capture-explorer.mjs 'badge$'    # ne refaire qu'une famille de captures
```

Pièges rencontrés, notés dans les fichiers :

1. Option `Color=` de fontspec : casse `xdvipdfmx` avec `tcolorbox`
   (`typecheck: Invalid object type`). Colorer avec `\color`.
2. `HelveticaNeue.ttc` sans faces déclarées : `\bfseries` sort en *Bold Italic*.
3. `new URL(...).pathname` garde l'espace du chemin encodé en `%20` ; utiliser
   `fileURLToPath`.
