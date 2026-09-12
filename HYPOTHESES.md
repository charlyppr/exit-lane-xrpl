# HYPOTHESES.md — pistes de feedback à tester

**Statut : hypothèses, pas conclusions.** Aucune ne va dans `FEEDBACK.md`
sans avoir été testée sur le Custom Hackathon Devnet, avec étapes de repro
et, quand c'est possible, un hash de transaction.

Une hypothèse infirmée est aussi une donnée : « testé, se comporte comme
documenté » est une information utile pour l'équipe Ripple. Ne pas la jeter.

Légende statut : `[ ]` à tester · `[~]` en cours · `[x]` confirmée · `[-]` infirmée

---

## Priorité 0 — divergence doc / ledger

### [x] H13 — La doc V1.1 interdit `LoanBrokerSet` sur vault open-ended ; le ledger l'autorise
**Catégorie :** documentation + protocole · **Sévérité pressentie :** haute
**Statut : divergence confirmée à l'exécution.** Ce n'est pas un blocage — c'est
un écart entre le comportement documenté et le comportement observé.

Quatre faits, tous sourcés :

1. `LendingProtocolV1_1` est **`enabled: true`** sur le Custom Hackathon Devnet
   (appel `feature`, 12/09 — la méthode est ouverte en lecture sur ce RPC, ce
   qui répond à une question laissée ouverte dans FEEDBACK-RAW).
2. La doc V1.1 dit, mot pour mot : *« A loan broker can only be attached to a
   closed-ended vault. This restriction only applies to loan brokers created
   after `LendingProtocolV1_1` is enabled. »* Et la matrice de compatibilité
   (annexe A) donne `LoanBrokerSet` → **❌ sur open-ended**.
3. Le code d'erreur documenté pour ce cas est **`tecNO_PERMISSION` — « The
   target vault isn't closed-ended »**.
4. **Observé : `tesSUCCESS`.** `LoanBrokerSet` sur un vault open-ended créé
   quelques secondes plus tôt, donc bien *après* l'activation de l'amendment —
   la clause de grand-père de la doc ne s'applique pas. Deux runs indépendants
   (entrée FEEDBACK-RAW [13:34]) :
   `781F54B5E77A768F4C02A54E3C55902AA9F1AC96AA04037AB97CE93FFB5DBDE4`
   et `1FBB8524C89CF1A850F26CE05A1F36CB80887A6605FA3A454A17AA14CBCDF320`.
   Le `LoanSet` qui suit passe également.

**Hypothèses d'explication, à départager avec un mentor :**
- (a) La doc V1.1 décrit un comportement *cible* pas encore implémenté dans
  `rippled 3.4.0-rc1`, la restriction n'étant pas encore branchée sur le flag.
- (b) La restriction existe mais est conditionnée à autre chose que la seule
  activation de l'amendment (`LEVersion` du vault ? le nœud Vault créé porte
  `LEVersion` — cf. [13:34]).
- (c) La doc `lending-protocol-v1-1` documente une version du protocole plus
  récente que le build déployé sur ce devnet.

Dans les trois cas c'est un item de rapport solide : **un développeur qui lit la
doc V1.1 et voit l'amendment actif conclura à tort que son architecture
open-ended est impossible, et refera son design pour rien.** C'est exactement ce
qui a failli nous arriver entre [13:05] et [13:34].

**Ce qui a été vérifié depuis, sans transaction (12/09) :**

- Build du devnet : **`rippled 3.4.0-rc1`**, `network_id 4001`,
  `complete_ledgers 3-64298`, `server_state full`. À joindre au rapport, sans
  quoi l'écart n'est pas reproductible.
- Les champs closed-ended **existent bel et bien dans les définitions
  binaires** livrées avec `ripple-binary-codec 2.11.0` :

  | Champ | Type | `nth` | Sérialisé |
  |---|---|---|---|
  | `VaultKind` | UInt8 | 22 | oui |
  | `SubscriptionDate` | UInt32 | 75 | oui |
  | `RedemptionDate` | UInt32 | 76 | oui |
  | `LEVersion` | UInt8 | 6 | oui |

  Donc **l'hypothèse (c) tombe** : le protocole connaît les vaults
  closed-ended, ce n'est pas une doc en avance sur un ledger qui ignorerait le
  concept. Reste (a) ou (b) : la restriction sur `LoanBrokerSet` n'est pas
  branchée dans ce build, ou elle dépend d'autre chose que le flag d'amendment.

**Ce qu'il reste à faire pour verrouiller l'item :**
- Un `VaultCreate` avec `VaultKind: 1` + dates, en JSON brut (cf. H14), puis
  `LoanBrokerSet` dessus. Si les deux passent, on a les deux branches et on
  peut affirmer proprement que la matrice de l'annexe A ne décrit pas ce build.
  **Test décisif restant, ~10 minutes, avant d'écrire FEEDBACK.md.**
- Demander à un mentor quelle version du protocole ce build implémente
  réellement. C'est la question qui rend l'item actionnable pour Ripple.

**Note sur `tecNO_PERMISSION`.** D'après la doc, ce même code couvre au moins
deux causes distinctes sur `LoanBrokerSet` : « le vault n'est pas closed-ended »
(V1.1) et la contrainte propriétaire observée en [13:26] (`tecNO_PERMISSION`
quand un tiers soumet, `tesSUCCESS` depuis le propriétaire). Le code ne nomme
jamais le champ fautif. Renforce la proposition de [13:26] : un code dédié, ou
un message qui nomme la cause.

**Résultat observé :** divergence confirmée — voir hashes ci-dessus.

---

### [x] H14 — `ripple-binary-codec` sérialise les champs closed-ended, le modèle TS ne les expose pas
**Catégorie :** client libraries · **Sévérité pressentie :** moyenne à haute
**Statut : confirmée par inspection statique** (xrpl@4.6.0 / ripple-binary-codec 2.11.0).

Les deux couches du même SDK ne sont pas d'accord :

- `ripple-binary-codec 2.11.0` définit `VaultKind`, `SubscriptionDate` et
  `RedemptionDate`, tous `isSerialized: true` (table en H13). La couche de
  sérialisation sait donc encoder un vault closed-ended.
- L'interface TypeScript `VaultCreate` de `xrpl@4.6.0` ne déclare que
  `Asset`, `Data`, `AssetsMaximum`, `MPTokenMetadata`, `WithdrawalPolicy`,
  `DomainID`, `Scale`. **Aucun des trois champs V1.1**, et zéro occurrence de
  `VaultKind` dans tout `models/`.

Conséquence pratique : créer un vault closed-ended avec le SDK stable exige de
contourner ses propres types — donc du JSON brut, alors que le wire format est
prêt. Il faut aussi vérifier si `validateVaultCreate()` rejette les champs
inconnus, ce qui déciderait entre « types incomplets mais runtime permissif »
et « blocage dur ».

**Ceci lève la réserve de H5.** H5 concluait que les 15 transactions sont typées
et que `raw-submit.mjs` ne servirait à rien ; la réserve « un modèle TS présent
n'implique pas que le codec suive » était la bonne intuition, mais l'écart va
dans l'autre sens : c'est le codec qui est en avance sur les types.
`raw-submit.mjs` a donc bien une raison d'exister.

**Protocole de test :** `VaultCreate` avec `VaultKind: 1` via `raw-submit.mjs`,
puis via le client typé avec un `as any`, et comparer. Relever si l'erreur vient
du SDK (validation locale) ou du ledger (`tem*` / `tec*`).

**Proposition :** aligner les modèles TS sur les définitions du codec dès
qu'un amendment est déployé, ou a minima documenter le décalage. Un test de
non-régression comparant `definitions.json` aux interfaces déclarées
attraperait cette classe de bug automatiquement — c'est un candidat de PR.

**Résultat observé :** écart confirmé statiquement. Exécution à faire.
**Tx :**

---

## Priorité 1 — à tester dans les 2 premières heures

Rapides, et elles touchent à de l'argent.

### [x] H1 — `CoverRateLiquidation` ne fait pas ce que son nom suggère
**CONFIRMÉE par la mesure le 12/09** — défaut de 50 XRP : 0,25 XRP ponctionné sur
le first-loss capital, 49,75 XRP encaissés par les déposants, 49,75 XRP de
couverture restés intacts. Valeur de la part 1,000000000 → 0,751250000.
Hash `91F458E3E6244E1C3005345C5C83CDFAF0E8A1AF6E5587E100C302CA56743BC7`.
Détail complet dans FEEDBACK-RAW.
**Catégorie :** UX (nommage) + documentation · **Sévérité pressentie :** haute

Le brief du hackathon pose lui-même la question : *« Did first-loss-capital
parameters behave as their names suggested? »*

La doc XRPL donne cet exemple :
```
DebtTotal            = 1 090
CoverRateMinimum     = 10 %
CoverRateLiquidation = 10 %
CoverAvailable       = 1 000

DefaultCovered = min((DebtTotal x CoverRateMinimum) x CoverRateLiquidation, DefaultAmount)
               = min((1 090 x 0,1) x 0,1 , 1 090) = 10,9
```
Un défaut de 1 090 est couvert à hauteur de 10,9, soit 1 %, alors que 989,1
de first-loss capital restent intacts et que les déposants encaissent 1 079,1
de perte.

Deux griefs distincts à séparer dans le rapport :
- **Nommage** : « CoverRateLiquidation = 10 % » se lit comme « 10 % du défaut
  est couvert ». C'est en réalité 10 % du *minimum requis*, donc un produit de
  deux taux. Erreur d'un ordre de grandeur facile pour un broker.
- **Design** : du capital dit « de première perte » n'absorbe pas la première
  perte alors qu'il est disponible. Si c'est intentionnel (plafonner la ponction
  pour préserver la couverture des prêts restants), ce n'est documenté nulle part.

**Protocole de test :** créer un broker avec ces paramètres, provoquer un défaut,
relever `CoverAvailable` avant/après et la perte du vault. Comparer au calcul.

**Proposition :** renommer en `CoverLiquidationFractionOfMinimum`, ou changer la
sémantique pour une fraction du montant en défaut, ou documenter l'intention avec
un second exemple. Et exposer le montant couvert en simulation avant transaction.

**Résultat observé :**
**Tx :**

---

### [~] H2 — Le paiement en retard doit être exact, mais le montant exact bouge
**Catégorie :** missing primitive · **Sévérité pressentie :** haute

Doc : un paiement en retard doit correspondre à un montant exact,
`totalDue = periodicPayment + loanServiceFee + latePaymentFee + latePaymentInterest`,
et les excédents sur paiement en retard sont ignorés.

Or `latePaymentInterest` dépend du temps écoulé. On lit l'état, on calcule, on
signe, le ledger avance, le montant est périmé. Condition de course probable,
plus obligation de réimplémenter côté client une formule du protocole avec
risque de divergence d'arrondi.

**Protocole de test :** laisser une échéance passer, calculer le dû, attendre
30 s, soumettre. Relever le code d'erreur. Recommencer en soumettant
immédiatement pour comparer.

**Proposition :** un flag `tfLoanPayExactDue` où le protocole calcule lui-même
le dû et débite le compte, ou a minima une méthode RPC retournant le montant
exact payable pour un ledger donné.

**Résultat observé :** [17:20] **MI-INFIRMÉE, MI-CONFIRMÉE EN PIRE.**
Pas de condition de course : sur un prêt à `LateInterestRate` 30 %, aucun champ
du nœud ne bouge pendant 95 s de retard (dérive **0 drop**). Un montant lu 85 s
plus tôt vaut celui lu à l'instant.
Mais le montant reconstruit depuis les champs du nœud
(`ceil(PeriodicPayment) + LoanServiceFee + LatePaymentFee` = 765001) est
**rejeté** `tecINSUFFICIENT_PAYMENT` : l'intérêt de retard couru (≈ 2,7 drops)
n'est exposé par **aucun** champ. Le dû est donc incalculable depuis le ledger.
Ce qui sauve la situation et n'est écrit nulle part : **`Amount` est un
plafond.** En envoyant 2 765 001 drops, seuls 765 015 ont été débités (frais de
tx compris) — l'excédent n'est pas prélevé. Bonne pratique : surpayer largement.
Nuance : avec `tfLoanLatePayment` le surpaiement n'impute **qu'une** échéance,
alors que sans flag sur un prêt à jour il en impute plusieurs (cf. H3).
**Tx :** `9A7589384C5142703AFFACBB91B12E223EC734F7ACBE51272A87525FE4EE9CA8`
(accepté, plafond) · rejets `tecINSUFFICIENT_PAYMENT` sur 765001, deux fois.
Détail complet : FEEDBACK-RAW [17:20].

---

### [-] H3 — Succès silencieux partiel sur surpaiement
**INFIRMÉE le 12/09.** Un `LoanPay` de 3 × l'échéance impute bien trois
échéances (4 → 1), avec ou sans les flags, à 2 drops près. Aucun succès
silencieux partiel. À déplacer dans « ce qui marche ».
**Catégorie :** UX · **Sévérité pressentie :** haute

Doc : quand un excédent est « ignoré », la transaction réussit mais l'emprunteur
n'est débité que du montant attendu. Et accepter un surpaiement exige **deux
flags à deux endroits** : `lsfLoanOverpayment` sur l'objet `Loan` ET
`tfLoanOverpayment` sur `LoanPay`.

Un emprunteur qui envoie de quoi solder son prêt, reçoit `tesSUCCESS`, et
découvre que seule une échéance a été imputée : pire résultat possible pour un
produit de crédit.

**Protocole de test :** un `LoanPay` largement surpayé sans les flags. Relever
le code retour et le delta réel sur `PrincipalOutstanding`. Puis refaire avec
les deux flags.

**Proposition :** code de résultat distinct (`tecPARTIAL_PAYMENT_APPLIED`), ou
échec par défaut (`temBAD_AMOUNT`) si le montant dépasse le dû sans flag, et
exposition de `ValueChange` en clair dans les métadonnées.

**Résultat observé :**
**Tx :**

---

## Priorité 2 — pendant la construction

### [ ] H4 — Pas de primitif offre/acceptation pour `LoanSet`
**Catégorie :** missing primitive · **Sévérité pressentie :** haute

Question posée explicitement par le brief : *« How did broker and borrower
coordinate the multi-party LoanSet signature? »* — signe que c'est un point
douloureux connu.

Créer un prêt exige la signature du broker ET de l'emprunteur sur la même
transaction. Prédiction : coordination off-chain bricolée, aucun objet
d'offre, aucune expiration.

**Protocole de test :** implémenter le flux à deux clés. Chronométrer.
Noter chaque aller-retour nécessaire et chaque échec de signature.

**Proposition :** pattern en deux temps à la `NFTokenCreateOffer` /
`NFTokenAcceptOffer` — un objet `LoanOffer` avec `Expiration` que l'emprunteur
accepte par une transaction séparée.

**Résultat observé :**
**Tx :**

---

### [-] H5 — Le SDK stable ne supporte pas tous les types de transaction
**Catégorie :** client libraries · **Sévérité pressentie :** moyenne à haute

Question du brief : *« Did the SDK support the needed transaction types, or did
you construct raw JSON? »*

À vérifier type par type. Cocher au fur et à mesure :

Rempli le 12/09 à 12:28 par inspection statique de
`node_modules/xrpl/dist/npm/models/transactions/` en xrpl@4.6.0.
Colonne « exéc. » = confirmé par une soumission réelle : **rien encore**,
le réseau est injoignable (cf. FEEDBACK-RAW [12:26]).

| Transaction | Typée dans le SDK ? | JSON brut requis ? | Exéc. | Note |
|---|---|---|---|---|
| `VaultCreate` | oui | non | ☐ | |
| `VaultSet` | oui | non | ☐ | absent du tableau d'origine |
| `VaultDeposit` | oui | non | ☐ | |
| `VaultWithdraw` | oui | non | ☐ | |
| `VaultDelete` | oui | non | ☐ | |
| `VaultClawback` | oui | non | ☐ | absent du tableau d'origine |
| `LoanBrokerSet` | oui | non | ☐ | |
| `LoanBrokerDelete` | oui | non | ☐ | absent du tableau d'origine |
| `LoanBrokerCoverDeposit` | oui | non | ☐ | |
| `LoanBrokerCoverWithdraw` | oui | non | ☐ | |
| `LoanBrokerCoverClawback` | oui | non | ☐ | absent du tableau d'origine ; cf. H8 |
| `LoanSet` | oui | non | ☐ | multi-signature à vérifier, cf. H4 |
| `LoanPay` | oui | non | ☐ | flags `tfLoanOverpayment`, cf. H3 |
| `LoanManage` | oui | non | ☐ | |
| `LoanDelete` | oui | non | ☐ | |

Ce tableau rempli est à lui seul un excellent item de rapport.

**Résultat observé :** **INFIRMÉE au niveau statique.** Les 15 types ont un
modèle dédié en xrpl@4.6.0 stable — dont 4 que ce tableau ne listait même pas.
`raw-submit.mjs` ne devrait donc servir à rien, ce qui est la bonne nouvelle
du jour. **Réserve :** un modèle TS présent n'implique pas que
`ripple-binary-codec` sérialise tous les champs ; à reconfirmer par une vraie
soumission avant d'écrire quoi que ce soit de définitif dans FEEDBACK.md.

---

### [x] H6 — Unités en 1/10 de point de base
**CONFIRMÉE le 12/09 par calcul, sans transaction.** `InterestRate: 8000` = 8 %
annuel. Mais la vérification a révélé deux conventions non documentées qui
valent plus que H6 elle-même : base **ACT/365** et `PeriodicPayment` =
**annuité constante**, l'un et l'autre déduits à 8,6e-12 XRP près.
Cf. FEEDBACK-RAW [15:38].
**Catégorie :** UX + client libraries · **Sévérité pressentie :** moyenne

Les taux vont de 0 à 100000 pour 0 % à 100 %. Donc 10 % s'écrit `10000`. Avec
trois taux d'intérêt et cinq frais à configurer, la probabilité d'une erreur
d'un facteur 10 est élevée — et irrattrapable si un prêt est déjà originé.

**Protocole de test :** configurer un broker de tête sans relire la doc, puis
vérifier. Noter si on s'est trompé (c'est la donnée intéressante).

**Proposition :** helpers SDK (`percentToRate()` / `rateToPercent()`) et un
endpoint de simulation à sec renvoyant l'échéancier complet avant signature.

**Résultat observé :**

---

### [x] H7 — Vault Owner et Loan Broker forcés sur le même compte
**Catégorie :** missing primitive · **Sévérité pressentie :** moyenne

La spec l'impose et ajoute que ça pourrait changer. Blocage métier réel : dans
un fonds, l'administrateur et le gérant de crédit sont deux entités distinctes,
souvent par obligation réglementaire.

**Protocole de test :** tenter un `LoanBrokerSet` depuis un compte différent du
vault owner. Relever l'erreur.

**Proposition :** autoriser des comptes distincts, éventuellement en réutilisant
l'amendment `PermissionDelegation` existant plutôt qu'un nouveau mécanisme.

**Résultat observé :** [17:07] **CONFIRMÉE.** Deux comptes tiers ont tenté de
créer un `LoanBroker` sur le vault d'un troisième : `tecNO_PERMISSION` dans les
deux cas. La contrainte de la spec est appliquée par le ledger, et le code de
retour est correct (c'est bien un refus d'autorisation).
Le grief reste **métier** : un fonds régulé sépare l'administrateur du véhicule
et le gérant de crédit. Nous avons dû faire du compte `broker` le propriétaire
du vault alors que la narration distingue les deux rôles.
**Tx :** `6CDC55F8F62286CDB20E0F2D8002E29D4CD6DEEC5E23976803B880211801BBE0`
(par `spare`) · même code depuis `lender`. Détail : FEEDBACK-RAW [17:07].

---

### [-] H8 — Clawback de la couverture quand `DebtTotal = 0`
**Catégorie :** autre · **Sévérité pressentie :** à évaluer

L'émetteur peut reprendre le first-loss capital jusqu'à un minimum égal à
`DebtTotal x CoverRateMinimum`. Si aucun prêt n'est encore en cours, ce minimum
vaut 0 — l'émetteur pourrait donc vider 100 % de la couverture juste avant que
le broker n'origine.

**Protocole de test :** émettre un IOU, créer un vault et un broker sur cet
actif, déposer de la couverture, tenter `LoanBrokerCoverClawback` de la totalité
avant tout prêt.

⚠️ **Si ça ressemble à une faille exploitable : mentor en privé AVANT
présentation, et ne pas publier les détails dans le repo public.**

**Résultat observé :** [17:01] **INFIRMÉE — à retirer des soupçons.**
Le plancher de couverture est appliqué **au drop près** : sur un broker à dette
4 XRP / `CoverRateMinimum` 10 % (plancher 0,400000), retirer 0,6 XRP passe,
retirer **1 drop de plus** est refusé `tecINSUFFICIENT_FUNDS`.
Et les paramètres de risque sont **immuables** : `CoverRateMinimum`,
`CoverRateLiquidation` et `ManagementFeeRate` sont refusés en modification
(`temINVALID`) sur un broker vivant ; seuls `DebtMaximum` (jamais sous
`DebtTotal`) et `Data` bougent. Un broker ne peut donc ni abaisser la
protection promise, ni s'échapper sous le plancher.
`LoanBrokerCoverClawback` : `tecNO_PERMISSION` pour le broker, un déposant et
l'emprunteur — inapplicable sur un actif sans émetteur (XRP), comme
`VaultClawback`.
Seule libération observée : un **défaut** met `DebtTotal` à 0, donc le plancher
à 0, et le broker récupère alors sa couverture (98 % dans notre mesure, cf. H1).
C'est le point à garder pour le rapport — pas une faille, un choix de design.
**Tx :** `071BEB20D2D5C5264571FFA7383BACAEA2684758C2661802B6C2E9458679BDA9`
(0,9 refusé) · `4FB4A2B0D01DD2411A5E8592680D50B1F4CCA51ED97C243C2A506516262F1370`
(1 drop de trop) · `DBBBA2F3B1313BD205EE33AAA9091787954AA5410E2595ED32AE43562C0A0E8D`
(clawback). Détail : FEEDBACK-RAW [17:01].

---

## Priorité 3 — observabilité, à la fin

### [x] H9 — Lire l'état exige de refaire les maths du protocole
**Catégorie :** missing primitive · **Sévérité pressentie :** moyenne

Question du brief : *« Could you read position value, utilisation, available
liquidity and accrued yield without guessing from ledger objects? »*

Prédiction : non. Il faudra récupérer `AssetsTotal`, `AssetsAvailable`,
`SharesTotal`, `DebtTotal`, `CoverAvailable` et tout recalculer côté client.
Chaque UI réimplémentera la même arithmétique et divergera.

**Protocole de test :** essayer d'afficher les 4 métriques. Compter les appels
RPC et les lignes de calcul nécessaires.

**Proposition :** une méthode RPC `vault_info` renvoyant les champs dérivés —
taux d'utilisation, NAV par part, rendement accru, liquidité disponible, ratio
de couverture et distance au minimum.

**Résultat observé :** [17:15] **CONFIRMÉE, mesurée.** Tableau de bord d'un
déposant sur un vault réel de 300 XRP portant un prêt de 100 XRP :
**8 appels RPC**, et **6 grandeurs à recalculer** (valeur de part brute, valeur
de part nette de `LossUnrealized`, valeur de ma position, retrait maximum, taux
d'utilisation, capacité de dette). `vault_info` renvoie 17 champs, tous bruts,
aucune grandeur dérivée.
Preuve à charge la plus forte : notre propre `lib/nav.mjs`, écrit exprès pour
ça, **a raté `LossUnrealized`** et surévaluait la part de 150 % (FEEDBACK-RAW
[16:44]). Deux implémentations dans ce dépôt, divergence facteur 2,5.
Chemin vault → prêts : aucun index. Il faut `account_objects` sur `Owner`
(39 objets à scanner), filtrer sur `VaultID`, puis `account_objects` sur le
**pseudo-compte** du broker avec `type: "loan"`. Ça marche — nous avions
d'abord cru que c'était impossible, c'est faux, mais ça coûte 3 requêtes et
deux savoirs implicites.
Absences franches : `loan_info` et `loan_broker_info` → `unknownCmd` (alors que
`vault_info` existe) ; `mpt_holders` → `unknownCmd`, donc **impossible**
d'énumérer les co-déposants, donc de raisonner sur `WithdrawalPolicy` = premier
arrivé premier servi.
**Tx :** n/a (lecture seule, `scripts/_probe-h9-observability.mjs`). ⚠️ **partiellement infirmée avant même le test.** Une
méthode RPC `vault_info` existe bel et bien dans la doc de référence
(`/docs/references/http-websocket-apis/public-api-methods/vault-methods/vault_info`) :
elle renvoie le vault, son owner, les actifs disponibles et le détail des parts
émises. Reformuler l'hypothèse avant de la tester : la question n'est plus
« existe-t-il un endpoint ? » mais « renvoie-t-il les champs *dérivés*
(taux d'utilisation, NAV par part, rendement accru) ou seulement les champs bruts
du ledger ? », et « existe-t-il l'équivalent côté `LoanBroker` / `Loan` ? ».
À vérifier par appel réel sur le devnet.

---

### [x] H10 — La falaise de couverture est silencieuse
**Catégorie :** UX · **Sévérité pressentie :** moyenne

Dès que la couverture passe sous le minimum, le broker ne peut plus prêter ET
ne perçoit plus aucun frais (tous les frais sont reversés à la couverture).
Effet de seuil binaire. Prédiction : aucun avertissement, découverte via un
`tec` opaque.

**Protocole de test :** amener volontairement la couverture juste sous le
minimum, puis tenter un `LoanSet`. Relever le code d'erreur et sa lisibilité.
C'est aussi un candidat pour l'étape 7 du minimum bar.

**Proposition :** exposer `CoverDeficit` et un ratio de santé sur l'objet
`LoanBroker`, et nommer le seuil dans le message d'erreur.

**Résultat observé :** [17:07] **CONFIRMÉE.** Les deux falaises isolées l'une de
l'autre renvoient le **même** code `tecINSUFFICIENT_FUNDS` :
- couverture saturée (capacité 2 XRP, demande 2,5) avec liquidité **ample**
  (8,5 XRP) → `tecINSUFFICIENT_FUNDS`
- liquidité insuffisante (7,5 XRP, demande 9) avec couverture **ample**
  (capacité 52 XRP) → `tecINSUFFICIENT_FUNDS`
Or les remèdes sont opposés : « dépose du first-loss capital » (à la main du
broker, immédiat) vs « attends des déposants » (hors de son contrôle).
La doc `LoanSet` liste les deux causes sous la même entrée : ambiguïté
**documentée**, donc facile à corriger.
Aggravant : la capacité de dette n'est exposée nulle part. Il faut 6 lectures
et une formule (`CoverAvailable × 100000 / CoverRateMinimum`, `AssetsAvailable`,
`DebtMaximum − DebtTotal`, puis le minimum des trois) pour répondre à « puis-je
prêter 5 XRP ? ».
**Tx :** `5DC3A6E00F31DA82C69AB77669C64691BD71CAC49C169736F53D7C724147618B`
(falaise de couverture) · `BB0CFCF87C045FA971CD601590B2D635398900791F9E902B50154A8C8F8D1803`
(falaise de liquidité) · `AE3DC594ED640F93D31DBDABE5D24732543B616B27C95DF2490120B8B3835A0C`
(contrôle positif). Détail : FEEDBACK-RAW [17:07].

---

### [ ] H11 — Explorer et doc vs comportement observé
**Catégorie :** documentation/tutorials · **Sévérité pressentie :** à évaluer

Question du brief : *« Did the explorer and documentation match the observed
ledger behaviour? »*

**Protocole de test :** ouvrir chaque objet créé (`Vault`, `LoanBroker`, `Loan`)
dans l'explorer custom. Est-ce lisible ou du JSON brut ? Les champs affichés
correspondent-ils aux noms de la doc ?

**Résultat observé :**

---

### [ ] H12 — Clarté de la doc sur la relation vault / broker / loan
**Catégorie :** documentation/tutorials · **Sévérité pressentie :** basse à moyenne

Première question du brief : *« Was the relationship between vault, loan broker
and loan clear from the documentation? »*

À répondre honnêtement, au moment de l'onboarding, avant que l'habitude ne
gomme la confusion initiale. **Écrire la réponse dans les 30 premières minutes**,
sinon elle est perdue.

**Résultat observé :**

---

## Bonus gratuit — contribution documentaire

Le brief prévoit un bonus pour une correction de doc, un exemple réutilisable,
une implémentation de référence ou une PR.

- [ ] La page concepts officielle contient `depostitor` (coquille).
- [x] L'exemple de first-loss capital utilise `PrincipleOutstanding`. En anglais
      financier le terme est *principal*, pas *principle*. **Vérifier si la faute
      est seulement dans la doc ou dans le nom du champ du protocole.**
      → **TRANCHÉ le 12/09 12:29 : c'est la DOC.** Grep sur xrpl@4.6.0 et
      `ripple-binary-codec` → 7 × `PrincipalOutstanding`, 0 × `PrincipleOutstanding`.
      Le champ du protocole est correctement nommé, donc pas de verrue d'API.
      Reste une PR de doc à ouvrir sur `XRPLF/xrpl-dev-portal` — à grouper avec
      la coquille `depostitor` ci-dessus : deux corrections, une seule PR.
      Au passage : `CoverRateMinimum` et `CoverRateLiquidation` confirmés comme
      noms de champs réels (18 occurrences chacun), ce qui valide la pertinence
      du grief de nommage de H1.

---

## Annexe A — Matrice de compatibilité V1.1 par type de vault

Source : `opensource.ripple.com/docs/lending-protocol-v1-1/closed-ended-vaults`,
récupérée le 12/09. **Cette table n'existe pas sur xrpl.org** — les pages de
référence des transactions vault/loan là-bas ne mentionnent pas le split
V1 / V1.1 (item de feedback `docs/doc_gap` déjà soumis).

Un vault closed-ended a un cycle de vie en trois phases ; un vault open-ended
n'en a pas et reste accessible en dépôt/retrait en permanence.

| Transaction | Open-ended | Subscription | Investment | Redemption |
|---|---|---|---|---|
| `VaultDeposit` | ✅ | ✅ | ❌ | ❌ |
| `VaultWithdraw` | ✅ | ✅ | ❌ | ✅ |
| `VaultClawback` | ✅ | ✅ | ✅ | ✅ |
| `LoanBrokerSet` | **❌** | ✅ | ✅ | ✅ |
| `LoanSet` | ✅ | ❌ | ✅ | ❌ |
| `LoanPay` | ✅ | ✅ | ✅ | ✅ |
| `LoanManage` | ✅ | ✅ | ✅ | ✅ |
| `LoanDelete` | ✅ | ✅ | ✅ | ✅ |

Note de la doc : `LoanBrokerSet` est la seule restreinte sur open-ended ; les
autres transactions de prêt restent ouvertes pour permettre la gestion des
prêts créés avant l'activation de l'amendment.

> ⚠️ **Cette table est la doc, pas le ledger.** La ligne `LoanBrokerSet` /
> open-ended ❌ est **contredite par l'observation** : `tesSUCCESS` sur ce
> devnet avec `LendingProtocolV1_1` actif (cf. H13 et FEEDBACK-RAW [13:34]).
> Ne pas citer cette table dans FEEDBACK.md sans la confronter à nos hashes.
> Les autres lignes n'ont **pas** été testées — elles sont des prédictions à
> vérifier, pas des faits acquis.

Lectures non évidentes de la table, à vérifier si on part en closed-ended :
- `VaultDeposit` ❌ en phase Investment **et** Redemption : la fenêtre de
  souscription est la seule occasion de déposer. Se tromper de timing coûte
  le vault entier.
- `VaultWithdraw` ❌ en Investment mais ✅ en Redemption : capital verrouillé
  pendant toute la phase d'investissement. C'est le point dur à narrer côté
  use case.
- `LoanSet` ❌ en Subscription et en Redemption : la fenêtre d'origination est
  strictement la phase Investment.

### Nouveaux champs du ledger entry `Vault` en V1.1

Tous optionnels, fixés à la création et immuables ensuite.

| Champ | JSON | Interne | Description |
|---|---|---|---|
| `LEVersion` | Number | UInt8 | `1` = comptabilité *cash-basis*. Omis = *whole-life*. |
| `VaultKind` | Number | UInt8 | `1` = closed-ended. **Omis = open-ended** — c'est le défaut, pas une option à demander. |
| `SubscriptionDate` | Number | UInt32 | *(closed-ended)* Fin de la fenêtre de souscription, en secondes depuis l'epoch Ripple. |
| `RedemptionDate` | Number | UInt32 | *(closed-ended)* Fin de la phase d'investissement, début du rachat des parts. |

Contraintes sur `VaultCreate` en closed-ended : les deux dates doivent être
dans le futur par rapport au *close time* du ledger, et la période de rachat
doit durer au moins 180 s et moins de 946 708 560 s.

⚠️ Ces champs sont absents de `VaultCreate` en `xrpl@4.6.0` d'après
l'inspection statique de H5 — **à revérifier**. Si le SDK stable ne les type
pas alors que l'amendment est actif sur le réseau, créer un vault
closed-ended exige du JSON brut, et c'est un item de feedback
`sdk` / `workaround` de premier ordre.

### Amendments actifs sur le Custom Hackathon Devnet

Relevés par `feature` le 12/09 — la méthode est ouverte en lecture sur ce RPC.

`LendingProtocol` · `LendingProtocolV1_1` · `SingleAssetVault` · `MPTokensV1` ·
`DynamicMPT` · `fixMPTDeliveredAmount` · `TokenEscrow` · `fixTokenEscrowV1` ·
`Credentials` · `PermissionedDomains` · `PermissionedDEX` ·
`PermissionDelegationV1_1` · `ConfidentialTransfer`

Commande de revérification :

    curl -s -X POST https://lending-hackathon.dev.ripplex.io:51234 \
      -H 'Content-Type: application/json' \
      -d '{"method":"feature","params":[{}]}'

Conséquence pour le choix de flavour : les primitives « Loaded » du brief
(Permissioned Domains & Credentials, TokenEscrow, MPT) sont **toutes
disponibles**. Aucune raison technique de rester Vanilla — seulement une
raison de use case.
