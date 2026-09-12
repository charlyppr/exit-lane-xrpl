# CHASSE.md — briefing pour la session de recherche de bugs

Écrit samedi 12/09 à 16h10, à lire **en entier** avant la première transaction.
Cette session a un seul but : **trouver des comportements que personne n'a
documentés**. Pas construire, pas refactorer, pas améliorer la démo.

---

## Règle n°1 — le budget XRP protège la démo de dimanche

État au 12/09 16h08 :

| Compte | Libre | OwnerCount | Rôle dans la démo |
|---|---|---|---|
| lender | 376,89 | 14 | **la vendeuse — compte critique** |
| broker | 440,76 | 60 | vault owner + loan broker |
| spare | 609,69 | 7 | l'acheteur |
| borrower | 665,42 | 11 | l'emprunteur |

Une démo coûte **~27 XRP au lender** (25 de dépôt immobilisé + 2 de réserve).
Il reste donc ~13 démos, et il en faut **au moins 6** d'ici dimanche 13h.

> **Plancher dur : ne jamais faire descendre `lender` sous 150 XRP libres.**
> Si un test a besoin d'un déposant, utiliser `spare` ou `borrower`, jamais
> `lender`. Le faucet **ne sait pas recharger un compte existant** (il ignore
> `destination` et crée un compte neuf, cf. FEEDBACK-RAW [15:21]) : le seul
> refinancement possible est un `Payment` depuis un autre de nos comptes.

Vérifier le budget avant de commencer et toutes les ~20 transactions.

---

## Règle n°2 — capture immédiate

Toute friction va dans `FEEDBACK-RAW.md` **avant** de chercher un contournement,
avec le hash. Format : copier un bloc existant. C'est 40 % de la note, et c'est
la seule chose que cette session produit qui compte vraiment.

## Règle n°3 — faille de sécurité = mentor en privé

Si un test ressemble à une faille exploitable du protocole (et pas à un bug de
confort) : **signalement privé à un mentor, avant toute présentation.** Jamais
dans le repo public, jamais dans le pitch, jamais dans `FEEDBACK.md`.
H8 ci-dessous est le candidat le plus probable.

---

## Ce qui est DÉJÀ testé — ne pas refaire

Confirmé, avec hash, dans `FEEDBACK-RAW.md` :

- Minimum bar 1→8 complet, dont 5 garde-fous provoqués + 1 contrôle positif
- **H13** doc V1.1 contredite par le ledger (`LoanBrokerSet` passe sur open-ended)
- **H14** codec binaire vs modèle TS sur les champs closed-ended
- **H1** `CoverRateLiquidation` n'absorbe que 0,5 % de la première perte
- **H3** infirmée : le surpaiement fonctionne, `tfLoanOverpayment` ne change rien
- **H5** infirmée : les 15 types Vault/Loan sont typés dans `xrpl@4.6.0`
- **H6** confirmée par calcul : ACT/365 + annuité constante, à 8,6e-12 près
- `signLoanSetByCounterparty` du SDK est cassé → contournement dans `raw-submit.mjs`
- `Payment` de parts sans opt-in → `tecNO_AUTH`
- `EscrowCreate` de parts vers un non-autorisé **réussit** (incohérent avec Payment)
- `OfferCreate` sur MPT → `temDISABLED`
- `AssetsAvailable` disparaît du nœud à zéro
- `GracePeriod` a un minimum non documenté de 60 s (`temINVALID` muet)
- `LoanManage tfLoanImpair` → `tecTOO_SOON` sans dire à partir de quand
- `LoanPay` accepte le paiement anticipé

## Pièges connus — pour ne pas y perdre 20 minutes

1. Montant dû par `LoanPay` = `ceil(PeriodicPayment) + LoanServiceFee`.
   Payer seulement `ceil(PeriodicPayment)` → `tecINSUFFICIENT_PAYMENT`.
2. `AssetsAvailable` **absent** du nœud ≠ erreur : il vaut zéro.
   Toujours lire `BigInt(v.AssetsAvailable ?? 0)`.
3. `LoanBroker` doit appartenir au **même compte** que le vault owner.
4. Tout destinataire de parts doit faire `MPTokenAuthorize` d'abord.
5. Le devnet peut cesser de répondre en gardant ses ports TCP ouverts
   (cf. [15:46]). Avant de soupçonner le wifi : `nc -z <host> 51233` puis
   `curl -m 15 -X POST https://<host>:51234`. Si TCP passe et pas HTTP,
   c'est le nœud, pas toi — attendre ~3 min.
6. `connectionTimeout` par défaut de xrpl.js est à 5 s, trop court ici.
   Toujours instancier `new Client(url, { connectionTimeout: 20000 })`.

---

## Zones vierges, par rendement décroissant

### A. Les 7 types de transaction jamais exercés — la plus grosse surface

Sur les 15 types XLS-65/66, **7 n'ont jamais été soumis**. Chacun est un bug
potentiel que personne n'a vu, et le brief valorise explicitement la couverture.

| Type | À provoquer | Question ouverte |
|---|---|---|
| `VaultSet` | modifier `AssetsMaximum`, `Data` | peut-on réduire `AssetsMaximum` sous `AssetsTotal` ? |
| `VaultDelete` | supprimer un vault non vide | le refus est-il clair ? et un vault vide avec parts en circulation ? |
| `VaultClawback` | rappeler de l'actif | qui a le droit ? que devient la part du déposant ? |
| `LoanBrokerCoverClawback` | rappeler le first-loss | **H8** — à `DebtTotal = 0`, est-ce libre ? ⚠️ candidat faille |
| `LoanBrokerDelete` | supprimer un broker avec prêts vivants | refus explicite ou état incohérent ? |
| `LoanManage` | `tfLoanUnimpair`, `tfLoanDefault` | seul `tfLoanImpair` a été tenté (`tecTOO_SOON`) |
| `LoanDelete` | supprimer un prêt soldé / non soldé | |

### B. Questions ouvertes laissées en suspens

- **`NextPaymentDueDate` après paiement anticipé** : l'échéance suivante
  glisse-t-elle, ou reste-t-elle au calendrier ? Laissé ouvert dans [16:04],
  et c'est la question qu'un prêteur pose en premier.
- **`WithdrawalPolicy` ≠ 1** : seule la valeur 1 a été utilisée. Les autres
  valeurs sont-elles acceptées ? documentées ? silencieusement ignorées ?
- **`AssetsMaximum` atteint** : déposer au-delà du plafond. Code retour ?
  message ? dépôt partiel ou rejet total ?
- **Deux prêts concurrents sur le même vault** : jamais testé. Le second
  voit-il correctement la liquidité restante ?
- **Deux déposants** : tout a été fait avec un seul. `WithdrawalPolicy 1`
  (premier arrivé premier servi) n'a donc jamais été réellement exercé.

### C. Hypothèses non tranchées

| # | Sujet | Coût estimé |
|---|---|---|
| **H10** | falaise de couverture silencieuse — seuil binaire, erreur probablement opaque | 20 min |
| **H2** | le montant de retard exact bouge pendant qu'on le lit | 25 min |
| **H9** | observabilité : compter les appels RPC pour afficher 4 métriques (`lib/nav.mjs` est déjà la moitié de la preuve) | 20 min |
| **H7** | vault owner et broker forcés sur le même compte — documenté ? contournable ? | 10 min |
| **H4** | pas de primitif offre/acceptation pour `LoanSet` | écrire depuis l'expérience |
| **H11**, **H12** | explorer vs comportement, clarté doc vault/broker/loan | écrire depuis l'expérience |

**H4, H11, H12 ne se testent pas — ils s'écrivent.** Ne pas dépenser de
transactions dessus.

### D. Défaut réel de bout en bout

H1 a été confirmée sur un défaut provoqué, mais le cycle complet
`tfLoanImpair` → `tfLoanDefault` → ponction du first-loss → effet sur la part
du déposant n'a jamais été joué en entier. C'est le scénario le plus riche qui
reste, et le plus proche d'un usage réel.

---

## Méthode

1. Un script jetable par sujet, préfixé `_probe-`, jamais dans la démo.
2. Réutiliser `submitRaw` de `raw-submit.mjs` : il ne lève pas sur `tec`/`tem`,
   ce qui est exactement ce qu'on veut ici.
3. Chaque `tec` est un résultat, pas un échec. Noter le code **et** le hash.
4. Un `tem` ne laisse **aucune trace on-chain** — noter la transaction envoyée,
   sinon l'observation est irrécupérable.
5. **Ne pas toucher** à `scripts/lib/scenario.mjs`, `demo.mjs`,
   `step-7-guardrails.mjs` : la démo est validée et chronométrée à 56 s.
