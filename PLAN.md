# PLAN.md — exécution jusqu'au freeze

Écrit samedi 12/09 14h30. Freeze dimanche 12h30, soumission 13h00.
Temps réel restant : **6h30 sur le campus**, nuit remote optionnelle,
**4h dimanche** dont 90 min réservées aux livrables.


> ## Règle de cadrage — non négociable
>
> **Le produit est open-ended, exclusivement.** `VaultCreate` sans `VaultKind`.
> Aucun code closed-ended, aucune mention de closed-ended dans le README,
> le deck ou le pitch.
>
> Deux axes à ne jamais confondre devant le jury :
> - **Track 1 vs Track 2** = réseau et librairie. Nous : Custom Hackathon Devnet
>   + `xrpl@4.6.0` stable. Le Track 2, c'est le Devnet public + `5.2.0-beta.0`.
> - **Open-ended vs closed-ended** = type de vault, *à l'intérieur* du Track 1.
>
> Si on demande « pourquoi pas closed-ended ? » : « le Track 1 porte sur
> l'open-ended ». Jamais « c'est l'autre track ».
>
> **Seule exception, dans `FEEDBACK.md` uniquement** : une phrase expliquant que
> la doc V1.1 annonce `LoanBrokerSet` interdit sur open-ended, alors que le
> ledger l'accepte (`tesSUCCESS`, hash `781F54B5…`). Sans elle, un juré qui
> connaît cette doc croira à une erreur de notre part. C'est une justification
> d'architecture, pas un mélange.

---

## 1. Le projet en une phrase

Un **Single Asset Vault** open-ended qui finance des prêts à terme fixe via un
**Loan Broker**. Quand la totalité du capital est prêtée, le vault ne peut plus
honorer les retraits : nous ouvrons une seconde sortie en rendant les **parts de
vault** cessibles de gré à gré, par échange atomique.

Use case narratif : crédit aux PME. Les déposants sont des trésoriers
d'entreprise qui placent un excédent. L'un d'eux doit payer une facture
imprévue, le vault est à sec, il cède ses parts avec décote plutôt que
d'attendre l'échéance des prêts.

Noms candidats pour le repo : `vault-exit-lane` · `second-door` · `liquid-shares`.

---

## 2. Glossaire opérationnel

**À partir d'ici, plus de métaphores.** Ces termes sont ceux de la doc XRPL et
ceux à employer devant le jury.

### XLS-65 — Single Asset Vault

| Terme | Ce que c'est |
|---|---|
| `Vault` | Objet du ledger. Agrège les dépôts, expose le capital à un protocole tiers. |
| `VaultCreate` | Crée le vault. Sans `VaultKind`, il est **open-ended** — c'est le défaut, pas une option. |
| `VaultDeposit` | Un déposant apporte de l'actif, reçoit des parts en échange. |
| `VaultWithdraw` | Un porteur rend des parts, reçoit de l'actif. Plafonné à `AssetsAvailable`. |
| `AssetsTotal` | Tout l'actif du vault, prêté ou non. |
| `AssetsAvailable` | Ce qui n'est pas prêté, donc seul retirable. **Le champ disparaît du nœud quand il vaut 0.** |
| `ShareMPTID` | Identifiant de l'émission des parts. |
| Parts de vault (*vault shares*) | Un **MPT** (Multi-Purpose Token). Représente une créance proportionnelle sur le vault. |
| `OutstandingAmount` | Nombre de parts en circulation. |
| Valeur d'une part | `AssetsTotal / OutstandingAmount`. Vaut 1,000000 à l'ouverture, monte avec les intérêts. C'est le **rendement**. |
| `WithdrawalPolicy` | Ordre de service des retraits. `1` = premier arrivé, premier servi. |

### XLS-66 — Lending Protocol

| Terme | Ce que c'est |
|---|---|
| `LoanBroker` | Objet du ledger. Intermédiaire qui origine les prêts sur le capital d'un vault. Doit appartenir au **même compte** que le vault owner. |
| `LoanBrokerSet` | Crée ou met à jour le broker. |
| First-loss capital | Capital propre du broker, absorbe les défauts avant les déposants. |
| `LoanBrokerCoverDeposit` | Alimente ce capital. **Seul le propriétaire du broker peut le faire** — pas de mutualisation possible. |
| `CoverRateMinimum` | Ratio de couverture sous lequel le broker ne peut plus prêter. |
| `CoverRateLiquidation` | Fraction du minimum ponctionnée en cas de défaut. Nom trompeur, cf. H1. |
| `Loan` | Objet du ledger. Terme fixe, échéancier fixe. |
| `LoanSet` | Origine un prêt. Exige la signature du broker **et** de l'emprunteur sur la même transaction. |
| `LoanPay` | Remboursement. Le montant doit correspondre exactement à l'échéance. |
| `LoanManage` | Gestion du risque : `tfLoanImpair`, `tfLoanUnimpair`, `tfLoanDefault`. |
| `PrincipalOutstanding` | Capital restant dû. |

### MPT et échange

| Terme | Ce que c'est |
|---|---|
| `MPTokenAuthorize` | **Opt-in du destinataire.** Sans lui, tout `Payment` de parts échoue en `tecNO_AUTH`. |
| `lsfMPTCanTransfer` / `CanEscrow` / `CanTrade` | Flags de l'émission. Nos parts portent les trois (`Flags: 56`). |
| `EscrowCreate` / `EscrowFinish` | Verrouillage conditionnel d'un actif. Supporte les MPT depuis l'amendment `TokenEscrow`. |
| `Condition` PREIMAGE-SHA-256 | Serrure cryptographique. S'ouvre en fournissant le `Fulfillment`, dont l'empreinte SHA-256 correspond. |
| **HTLC** | *Hash Time-Locked Contract*. Deux escrows croisés partageant la même `Condition` = échange atomique sans tiers de confiance. C'est notre mécanisme de cession. |
| `CancelAfter` | Expiration. Au-delà, l'escrow est annulable et l'actif revient à son propriétaire. |

### Codes de résultat — distinction à maîtriser pour le pitch

| Préfixe | Sens | Trace on-chain |
|---|---|---|
| `tes` | Succès. | Oui, avec hash. |
| `tec` | Échec **applicatif** : la transaction est valide, une règle métier la rejette. | **Oui, avec hash.** C'est ce qui rend l'étape 7 démontrable. |
| `tem` | Transaction malformée ou logique désactivée. | **Non.** Rejet local, aucun hash. |

---

## 3. Architecture des scripts

```
scripts/
  config.mjs               [FAIT] endpoints, helpers de taux (1/10 pdb)
  setup-accounts.mjs       [FAIT] finance lender / borrower / broker / spare
  check-connection.mjs     [FAIT] vérifie réseau + version de lib
  test-v11-blocking.mjs    [FAIT] étapes 1-3 + verdict V1.1
  steps-4-6.mjs            [FAIT] drawdown, LoanPay, VaultWithdraw
  step-7-guardrails.mjs    [FAIT] 5 rejets + 1 contrôle positif
  _probe-shares*.mjs       [FAIT] sondes jetables — à fondre dans step-8

  step-8-secondary.mjs     [À ÉCRIRE] cession de parts par HTLC, bout en bout
  lib/nav.mjs              [À ÉCRIRE] valeur de la part + liquidité disponible
  demo.mjs                 [À ÉCRIRE] enchaînement complet pour le pitch
```

### `step-8-secondary.mjs` — spécification

Rejouable d'un seul jet, sortie lisible à l'écran, un hash par ligne.

1. Amener le vault à `AssetsAvailable = 0` (tout le capital prêté).
2. `VaultWithdraw` par le vendeur → `tecINSUFFICIENT_FUNDS`. **C'est le mur.**
3. `MPTokenAuthorize` par l'acheteur sur le `ShareMPTID`.
4. L'acheteur tire un secret de 32 octets, calcule la `Condition`.
5. `EscrowCreate` par l'**acheteur** : actif, destinataire = vendeur,
   `CancelAfter` = +2 h. *L'acheteur montre son argent en premier.*
6. `EscrowCreate` par le **vendeur** : parts, destinataire = acheteur,
   `CancelAfter` = **+1 h**. L'écart d'expiration protège le vendeur.
7. `EscrowFinish` par l'acheteur sur l'escrow de parts, avec le `Fulfillment`.
   Le secret devient public dans le ledger.
8. `EscrowFinish` par le vendeur sur l'escrow d'actif, en relisant le secret
   **depuis le ledger** — ne pas le passer en variable, la démo perdrait son sens.
9. `VaultWithdraw` par l'acheteur une fois la liquidité rétablie → `tesSUCCESS`.

Déjà prouvé on-chain : les points 3, 4, 6, 7 et 9. Reste à écrire : 5 et 8,
mécaniquement identiques à 6 et 7.

---

## 4. Inventaire sans complaisance

### Acquis, prouvé par un hash
- Minimum bar étapes 1 à 7, dont 5 garde-fous + 1 contrôle positif.
- Rendement réalisé et mesuré : +0,021480 XRP sur 300 déposés.
- Cession de parts : opt-in, transfert, escrow conditionnel, dénouement.
- Rachat par un porteur secondaire n'ayant jamais déposé.
- 4 items de feedback documentés avec repro et hashes.

### Écrit mais non vérifié
- `FEEDBACK.md` : squelette, tableau de synthèse vide.
- `README.md` : placeholders `[NOM DU PROJET]`, tableau d'équipe vide.
- H14 (écart codec / types TS) : confirmé statiquement, jamais exécuté.

### Pas commencé — par ordre de gravité
1. **Aucun commit. Aucun remote GitHub.** Tout vit sur un disque.
2. Deck 10 slides.
3. `step-8-secondary.mjs`, `lib/nav.mjs`, `demo.mjs`.
4. Use case incarné dans le README.
5. Formulaire DevEx : membres + handles GitHub.
6. Hook DevEx sur les machines 2, 3, 4.
7. H1, H2, H3, H4, H6, H9, H10, H11 non testés.

---

## 5. Stratégie feedback — 40 % de la note

Le livrable noté est `FEEDBACK.md`, 3 pages. `FEEDBACK-RAW.md` fait 1372 lignes :
le travail de dimanche est un travail de **tri**, pas de découverte. Ne jamais
inverser cet ordre.

### Tests restants, classés par rendement

| Test | Coût | Pourquoi il vaut le coup |
|---|---|---|
| **H1** `CoverRateLiquidation` | 30 min | Le brief pose la question mot pour mot. Un défaut provoqué, un calcul comparé : item de sévérité haute quasi garanti. |
| **H3** surpaiement silencieux | 15 min | Un `tesSUCCESS` qui n'impute qu'une échéance est le pire résultat possible pour un produit de crédit. |
| **H10** falaise de couverture | 20 min | Seuil binaire, erreur probablement opaque. Complète l'étape 7. |
| **H9** observabilité | 20 min | Compter les appels RPC et les lignes de calcul pour afficher 4 métriques. Phase « observabilité » que peu d'équipes documenteront. |
| **H2** montant de retard périmé | 25 min | Condition de course réelle. Plus coûteux car il faut laisser passer une échéance. |
| H4, H6, H11 | — | Déjà largement documentés par l'usage. Écrire depuis l'expérience, ne pas retester. |
| H8 clawback à `DebtTotal = 0` | — | **Si ça ressemble à une faille : mentor en privé, hors du repo public.** |

### Structure de FEEDBACK.md (3 pages)

1. En-tête + tableau de synthèse trié par sévérité — *le jury lit ça en premier*.
2. Onboarding (1/2 p) : ports 51233/51234 non routables, faucet excellent,
   script d'onboarding qui échoue 2 fois sur 2.
3. Construction (1 p) : bug SDK `signLoanSetByCounterparty`, écart codec/types TS,
   doc V1.1 contredite par le ledger, `tecNO_AUTH` non documenté,
   `CanTrade` posé sans DEX, incohérence Payment/Escrow.
4. Observabilité (3/4 p) : `AssetsAvailable` qui disparaît, champs dérivés absents,
   `tec` contre `tem` dans l'outillage.
5. Ce qui marche (1/4 p) : faucet, couverture SDK, vitesse du devnet, `feature`
   ouvert en lecture. **Un rapport uniquement à charge perd en crédibilité.**

### Contributions upstream — bonus explicite du brief
- PR doc sur `XRPLF/xrpl-dev-portal` : `depostitor`, `PrincipleOutstanding`,
  et l'opt-in `MPTokenAuthorize` absent des causes d'échec du transfert de parts.
  Trois corrections, une seule PR.
- Issue SDK sur `signLoanSetByCounterparty` si le bug est reproductible au propre.

---

## 6. Planning

### Samedi — campus, jusqu'à 21h
| Créneau | Quoi |
|---|---|
| 14h30 (5 min) | **`git commit` + repo GitHub public.** Avant tout le reste. |
| 14h35 | Hook DevEx sur les machines 2, 3, 4. |
| 14h45 | Use case incarné + nom du projet dans le README. |
| 15h00 | `step-8-secondary.mjs` — les deux escrows manquants. |
| 16h30 | Décision **Vanilla / Loaded** figée et écrite (deadline CLAUDE.md : 18h). |
| 16h45 | H1 et H3 — les deux tests à meilleur rendement. |
| 17h45 | `lib/nav.mjs` + `demo.mjs`. |
| 19h00 | Répétition chronométrée. 4 min, validations à ~5 s. |
| 20h00 | Squelette du deck, 10 slides. |
| 20h45 | Commit, push. |

### Dimanche
| Créneau | Quoi |
|---|---|
| 8h30 | H10 et H9 si et seulement si la démo est stable. |
| 9h30 | Deux répétitions complètes, dont une sur le wifi du campus. |
| **11h00** | **Livrables. Plus une ligne de code.** `FEEDBACK.md`, puis README, puis deck. |
| 12h15 | Relecture croisée, vérification des liens explorer. |
| 12h30 | **Freeze.** |
| 13h00 | Soumission + formulaire DevEx. |

### Répartition
- **À 2** : A = code (step-8, demo). B = feedback, README, deck. Répétition ensemble à 19h.
- **À 3** : + C = tests d'hypothèses H1/H3/H10 et capture dans FEEDBACK-RAW.
- **À 4** : + D = deck et narration, et tient le chronomètre pendant les répétitions.

---

## 7. Risques

| Risque | P × I | Parade |
|---|---|---|
| Perte du travail — aucun commit | Faible × **Total** | Commit maintenant. 5 minutes. |
| `FEEDBACK.md` bâclé à 12h20 | **Élevée** × Élevé | 11h00 est un mur. Personne ne code après. |
| Démo qui casse en live | Moyenne × Élevé | `demo.mjs` rejouable + captures d'écran de secours + hashes dans le deck. |
| Wifi du campus qui bloque 51233/51234 | Moyenne × Élevé | Partage de connexion 4G testé **avant** de monter sur scène. |
| Jury qui perçoit un hors-sujet | Moyenne × Moyen | Le vault occupe 2/3 de la démo. Dernière image = le vault qui paie l'acheteur. |
| Time-out des escrows pendant la démo | Faible × Moyen | `CancelAfter` à 2 h, jamais à 5 min. |
