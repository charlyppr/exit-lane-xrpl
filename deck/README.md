# Deck — Exit Lane

`exit-lane.pptx` — 10 slides, à projeter. Palette sombre, lisible en salle.

Régénérer après modification de `build-deck.cjs` :

```bash
npm install pptxgenjs      # dans un dossier temporaire, PAS dans le projet
node deck/build-deck.cjs deck/exit-lane.pptx
```

`pptxgenjs` n'est volontairement pas une dépendance du projet : `package.json`
fige `xrpl` et ne doit rien résoudre d'autre.

## Plan

| # | Slide | Rôle dans le pitch |
|---|---|---|
| 1 | Exit Lane | Titre, track, environnement |
| 2 | Ouvert en droit, fermé en fait | Le problème, en trois chiffres |
| 3 | Le protocole dit non | Le refus on-chain, et la distinction `tec` / `tem` |
| 4 | Céder la part, jamais la créance | Ce qu'on vend, ce qu'on ne vend pas |
| 5 | Deux coffres, une seule clé | Le HTLC en quatre étapes |
| 6 | Démo live | Marqueur — lancer `node scripts/demo.mjs` |
| 7 | Minimum bar 8/8 | L'exécution technique |
| 8 | « First-loss capital » : le nom ment | Item de feedback n°1 |
| 9 | Quatre autres | Le reste du rapport |
| 10 | Trois corrections, une contribution | Ce qu'on propose à Ripple |

Slides 8 à 10 = 40 % de la note. Ne pas les sacrifier si le temps manque :
couper dans 4 et 5, qui se racontent à l'oral pendant la démo.

## À vérifier avant de projeter

Le fichier a été validé (schéma, relations, géométrie) mais **jamais rendu
visuellement** — pas de LibreOffice sur la machine de génération. Ouvrir le
`.pptx` une fois et vérifier les débordements de texte, surtout slides 5 et 9.
