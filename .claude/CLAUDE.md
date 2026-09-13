# CLAUDE.md — Contexte projet

Lis ce fichier en entier avant toute action. Il contient des contraintes qui,
si elles sont violées, font perdre des heures.

## L'événement

XRPL Lending Protocol Hackathon — DeVinci Blockchain x Ripple
IIM, Campus du Parc, Nanterre — 12-13 septembre 2026
Équipes de 2 à 4 personnes. Code freeze dimanche 12h30, soumission 13h00 CEST.
Pitch : 4 min de démo live + 2 min de Q&A.

## L'objectif réel (à ne jamais perdre de vue)

Ce n'est PAS un concours de startup. Grille de notation officielle :

| Critère                          | Poids |
|----------------------------------|-------|
| **Qualité du feedback dev**      | **40%** |
| Exécution technique sur XRPL     | 30%   |
| Créativité et use case           | 20%   |
| Présentation et démo live        | 10%   |

Citation du brief : « un prototype grossier avec du feedback spécifique et
reproductible vaut plus qu'une démo léchée avec un rapport maigre. »

Conséquence : le livrable principal est `FEEDBACK.md`. Le code est le moyen
de le produire, pas la fin. Chaque fois qu'une friction apparaît, elle est
consignée dans `bonus/notes/FEEDBACK-RAW.md` AVANT de chercher un contournement.

## Track choisi : TRACK 1 — Vault open-ended

Le Single Asset Vault standard reste ouvert aux dépôts et retraits pendant
toute sa durée de vie. Les prêts sont à terme fixe, le vault non.

### Environnement — NE JAMAIS MÉLANGER

| Paramètre | Valeur |
|---|---|
| Protocole | Lending Protocol **V1** (pas V1.1) |
| Réseau    | Custom Hackathon Devnet |
| Faucet    | https://lending-hackathon-faucet.dev.ripplex.io/accounts |
| RPC       | https://lending-hackathon.dev.ripplex.io:51234 |
| WSS       | wss://lending-hackathon.dev.ripplex.io:51233 |
| Explorer  | https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/ |
| Librairie | `xrpl` stable — **JAMAIS** `5.2.0-beta.0` (c'est le Track 2) |

### Règles dures

1. **Ne jamais** `npm i xrpl@latest` sans vérifier la version résolue. Version
   figée dans `package.json`, et reportée en tête de `FEEDBACK.md`.
2. **Ne jamais** pointer vers `s.devnet.rippletest.net` (Devnet public = Track 2).
3. **RLUSD n'existe pas ici.** Les tokens de test RLUSD sont Testnet-only, pas
   Devnet. Utiliser XRP, ou un IOU/MPT émis par nos soins. Ne pas construire un
   use case qui dépend de RLUSD on-chain — le nommer dans la narration si besoin.
4. Si des `LoanSet` commencent soudain à échouer sur un vault ouvert : possible
   activation de V1.1 sur le ledger, ce qui restreindrait les nouveaux prêts aux
   vaults fermés. Ce n'est pas notre bug → prévenir un mentor.
5. Faille de sécurité potentielle du protocole → signalement **privé à un mentor
   avant toute présentation**. Jamais dans le pitch, jamais dans un repo public.

### DevEx hook — obligatoire

https://github.com/RippleDevRel/xrpl-devex-hook/tree/main
Code d'invitation : `BFT-PARIS-26`
À installer sur la machine de **chaque** développeur de l'équipe. C'est la
moitié automatisée des 40%. Première tâche, avant même le faucet.

## Minimum bar Track 1 (= la note technique ET le script de démo)

Ces 8 étapes sont à exécuter dans l'ordre et à documenter avec un lien explorer :

1. Créer un Single Asset Vault open-ended
2. Déposer du capital depuis au moins un compte prêteur
3. Créer un loan broker et originer un prêt accepté par l'emprunteur
4. Exécuter un drawdown
5. Traiter au moins un remboursement
6. Retirer le capital + le rendement accru
7. **Démontrer une transaction rejetée par un garde-fou du protocole** :
   liquidité insuffisante, paiement hors calendrier, ou comportement du
   first-loss cover
8. Emballer le flux dans un use case crédible

L'étape 7 est un livrable, pas un accident. La provoquer volontairement,
capturer le code d'erreur et le hash.

## Flavour : Vanilla par défaut

- **Vanilla** : XLS-65 + XLS-66 avec un use case crédible.
- **Loaded** : Vanilla + une autre primitive (Permissioned Domains &
  Credentials, TokenEscrow, sponsored fees/reserves, MPT).

Le brief précise que Loaded n'est pas automatiquement mieux. Ne passer en
Loaded que si le use case l'exige naturellement. Décision à figer avant 18h
samedi, sinon on reste Vanilla.

## Livrables de soumission (dimanche 13h00)

- [ ] Repo GitHub public
- [ ] `README.md` : ce que fait le projet, setup, track, environnement,
      version de lib, **et chaque transaction XLS-65/66 utilisée**
- [ ] Liens vers les transactions on-chain vérifiées
- [ ] Deck de 10 slides maximum
- [ ] `FEEDBACK.md` à la racine du repo, 3 pages maximum
- [ ] Formulaire DevEx rempli (membres + handles GitHub)

Bonus explicitement prévu : correction de doc, exemple de code réutilisable,
implémentation de référence, ou pull request.

## Budget temps réel

Hacking 11h30 samedi → campus fermé 21h → reprise 8h30 dimanche → freeze 12h30.
Nuit en remote sur Discord. Soit ~10h de code utile une fois retirés le README,
les slides et le rapport. **Bloquer 90 minutes dimanche matin pour les livrables.**

## Style de collaboration attendu

- Français, direct, pas de préambule.
- Pas de refactoring spontané : on est en hackathon, le code jetable est
  acceptable, le feedback perdu ne l'est pas.
- Toute observation de friction → `bonus/notes/FEEDBACK-RAW.md` immédiatement, avec le
  hash de transaction si disponible.
- Quand le SDK ne supporte pas un type de transaction et qu'il faut construire
  du JSON brut : c'est un item de feedback catégorie `client libraries`, pas
  seulement un contournement.

## Fichiers du repo

Racine = livrables uniquement. Tout le reste va dans `bonus/` (index : `bonus/README.md`).

- `.claude/CLAUDE.md` — ce fichier
- `README.md` — trame de soumission
- `FEEDBACK.md` — rapport final, 3 pages, écrit dimanche matin
- `FEEDBACK.pdf` — le même rapport en 3 pages, compilé depuis `bonus/deck-source/feedback-report.tex`
- `deck/` — `exit-lane.pptx` et `exit-lane.pdf`, rien d'autre
- `scripts/` — ce que le README fait lancer : `check-connection`, `setup-accounts`,
  `demo`, `step-7-guardrails`, plus `config`, `raw-submit` et `lib/`
- `bonus/notes/` — `FEEDBACK-RAW.md` (journal brut, en continu), `HYPOTHESES.md`, `PLAN.md`, `CHASSE.md`
- `bonus/scripts/` — sondes `_probe-*` et scripts de repro ; importer `../../scripts/...`
- `bonus/deck-source/` — sources du deck et du PDF, captures `shots/`
