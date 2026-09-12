# Deck — Exit Lane

`exit-lane.pptx` — 10 slides, 16:9 en 13,333 × 7,5 pouces.
`exit-lane.pdf` — le même deck exporté par PowerPoint, filet de sécurité pour
projeter sans dépendre d'une machine qui ait les bonnes polices.

## Design system

Repris du deck officiel Ripple / XRPL Lending Protocol (« final lending
intro.pdf »), relevé au pixel sur le PDF plutôt qu'approché à l'œil :

| Rôle | Valeur |
|---|---|
| Fond sombre / titres | `#001C5C` |
| Accent (kickers, pastilles, puces) | `#006AFF` |
| Accent sur fond sombre | `#6DC3FF` |
| Texte courant | `#5F666E` |
| Sourdine (eyebrow, pagination) | `#AEB3B7` |
| Carte | `#FAFAFA`, bord `#E2E5E8`, rayon 0,12" |
| Carte bleue | `#EBF4FF` · vert `#E1F4EE` · pêche `#FAEDE7` |
| Puce de code | fond `#BAEAFF`, texte `#0045C6` |
| Rail de gauche | dégradé 8 bandes, 0,10" de large, pleine hauteur |

Composant maison en plus du système de référence : **`term`**, un faux
terminal (pastilles, titre, filet, lignes monospace colorées — vert
`tesSUCCESS`, corail `tec*`). Toute sortie de commande passe par lui : sur les
slides 2, 3, 6, 7 et 8 il remplace ce qui aurait été un paragraphe.

Règle de contenu : une idée par slide, un chiffre plutôt qu'une phrase, pas de
sous-titre qui répète le titre.

Grille : marge gauche 0,88", bord droit 12,45", bandeau bas à 7,08".
1 pixel du PDF de référence = 0,01" dans le pptx, donc toute mesure prise sur
le PDF se transpose telle quelle.

**Polices.** Le deck de référence utilise Plus Jakarta Sans Bold, Inter et
JetBrains Mono. Aucune des trois n'est installée sur la machine, donc le
générateur prend les plus proches qui le sont : **Poppins** (titres),
**Helvetica Neue** (corps), **Menlo** (mono). Pour revenir aux polices
d'origine : les installer, puis changer `FH` / `FB` / `FM` en tête de
`build-deck.cjs` et régénérer.

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

## Plan

| # | Slide | Rôle dans le pitch |
|---|---|---|
| 1 | Exit Lane | Titre, track, environnement, version de lib |
| 2 | Ouvert en droit, fermé en fait | Trois chiffres + l'état du vault en terminal |
| 3 | Le protocole dit non | Le refus en terminal, puis `tec` vs `tem` |
| 4 | Céder la part, jamais la créance | Ce qu'on vend, ce qu'on ne vend pas |
| 5 | Deux coffres, une seule clé | Le HTLC en quatre étapes |
| 6 | Démo live | Marqueur — lancer `node scripts/demo.mjs` |
| 7 | Minimum bar : 8 sur 8 | Les 8 étapes en terminal, 3 chiffres à droite |
| 8 | « First-loss capital » : le nom ment | Deux décors mesurés, et le nom vs ce qu'il fait |
| 9 | Six autres | Le reste du rapport, un code d'erreur par carte |
| 10 | Trois corrections, quatre contributions | Ce qu'on propose à Ripple |

Slides 8 à 10 = 40 % de la note. Ne pas les sacrifier si le temps manque :
couper dans 4 et 5, qui se racontent à l'oral pendant la démo.

## État de vérification

Rendu par Microsoft PowerPoint et relu slide par slide sur le PDF exporté :
pas de débordement, pas de chevauchement. À refaire après toute modification
de `build-deck.cjs` — c'est ce qui a rattrapé trois collisions lors de la
première passe.

Chiffres du deck synchronisés avec le dépôt au 12/09 19h30 : démo 13
transactions en 56 s, part 1,000000000 → 1,006443880, H13 et H14 tranchées.
Aucun compteur mouvant n'est écrit sur une slide — `FEEDBACK-RAW.md` grossit
encore, et un chiffre faux au pitch coûte plus que le chiffre ne rapporte.
