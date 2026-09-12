# FEEDBACK-RAW.md — journal de capture

**Ce fichier ne se rend pas tel quel.** Il alimente `FEEDBACK.md`, écrit
dimanche matin. Le laisser dans le repo crédibilise le rapport final.

**Règle unique : on écrit ici AVANT de chercher un contournement.** Une
friction contournée puis oubliée est un point perdu sur les 40 %.

Ne pas filtrer, ne pas se censurer, ne pas trier. Le tri se fait dimanche.
Même une remarque qui semble bête va ici.

---

## Format d'une entrée — copier-coller ce bloc

```
### [HH:MM] Titre court et factuel
Phase : onboarding | construction | observabilite
Catégorie : client libraries | UX | missing primitive | documentation/tutorials | other
Sévérité : haute | moyenne | basse
Lib : xrpl@X.Y.Z

Tenté :
Attendu :
Obtenu :
Repro :
  1.
  2.
Tx / code :
Contournement trouvé :
Proposition :
```

---

## Métriques à relever une seule fois

- Heure de début réel du setup : **12:22** (samedi 12/09)
- **Time to first transaction** (du `git clone` à une tx visible dans l'explorer) :
  **~50 min de bout en bout** (12:22 → 13:12), dont ~45 min de blocage réseau
  (entrée [12:26]) et ~5 min sur le bug du script fourni (entrée [13:12]).
  Une fois les deux contournés, le script lui-même tourne en **13 s**, et un
  chemin minimal (faucet ×2 + Payment validé) en **10 s**.
  Première transaction réussie :
  `71100491B129511AFAB783E961AA4C326739026372482E1E2D1F2844334AED6F`
  Validation observée : **4,3 à 5,2 s** après soumission. Ledger ~**3,04 s**.
- Nombre de comptes financés au premier essai du faucet : **4/4** via
  `setup-accounts.mjs` à 13:15 (461 / 164 / 151 / 150 ms). Plus 1/1 testé
  manuellement en POST direct plus tôt (365 ms, balance 1000 XRP). Le faucet
  n'a jamais échoué : 5/5 au total, latence médiane ~160 ms.
- Version exacte de `xrpl` résolue par npm : **4.6.0**
- rippled du devnet : **3.4.0-rc1**, `network_id` **4001**, ledger ~3,04 s
- Amendments actifs : **48**, dont `LendingProtocol`, `SingleAssetVault`
  **et `LendingProtocolV1_1`** — cf. entrée [13:05], c'est un problème.
  (`package.json` épingle `^4.4.1` ; `latest` sur npm est **5.2.0 stable**)
- Temps d'installation du DevEx hook, par machine : **~4 min** sur la machine 1
  (12:39 → 12:43), dont une friction d'agent, cf. entrée [12:43]. Machines 2+
  restent à faire. Pseudonyme `late-quail-92`, équipe CY-HACK,
  événement `btf-paris-2026-09`, code `BFT-PARIS-26` accepté.

---

## Entrées

<!-- Coller les nouvelles entrées ci-dessous, dans l'ordre chronologique. -->

### [12:26] Les seuls endpoints documentés sont sur des ports non standard (51233/51234) — aucune alternative en 443
Phase : onboarding
Catégorie : documentation/tutorials + other (infrastructure)
Sévérité : haute
Lib : xrpl@4.6.0

Tenté :
  Se connecter au Custom Hackathon Devnet via le WSS documenté
  `wss://lending-hackathon.dev.ripplex.io:51233`, puis via le RPC
  `https://lending-hackathon.dev.ripplex.io:51234`.

Attendu :
  Un `server_info` en moins d'une seconde.

Obtenu :
  Les deux timeout au niveau applicatif. Détail du diagnostic :
  - DNS OK : l'hôte résout vers 5 IP (52.90.54.58, 54.175.94.154,
    18.207.127.254, 18.234.224.245, 100.26.45.99).
  - `nc -z` réussit sur 51233 ET 51234 → le SYN passe.
  - Mais aucune réponse applicative : `curl -X POST` sur les 5 IP en direct
    timeout à 12 s avec **0 octet reçu**. `client.connect()` de xrpl.js
    timeout à 20 s.
  - Un middlebox complète donc le handshake TCP puis jette le trafic.
    Signature classique d'un wifi invité / réseau d'entreprise qui filtre
    tout sauf 80/443.

  Preuve que le réseau hackathon lui-même est UP et sain :
  le faucet, qui est sur **443**, répond en **365 ms** et finance un compte
  du premier coup :
    POST https://lending-hackathon-faucet.dev.ripplex.io/accounts → HTTP 200
    {"account":{"address":"rEjAa5FUK149RC5SpH2JX58gj9A8N5NL1q",
                "secret":"<redacted>"},"balance":1000}
  Donc ce n'est pas le devnet qui est tombé. C'est le chemin réseau vers
  51233/51234 depuis notre poste.

Repro :
  1. Se placer sur un réseau qui ne laisse sortir que 80/443 (wifi invité,
     réseau d'entreprise, beaucoup de wifi de campus — donc potentiellement
     le wifi de l'IIM lui-même).
  2. `curl -m 20 -X POST https://lending-hackathon.dev.ripplex.io:51234 \
       -H 'Content-Type: application/json' \
       -d '{"method":"server_info","params":[{}]}'`
  3. → `curl: (28) Connection timed out`.
  4. `curl -m 15 -X POST https://lending-hackathon-faucet.dev.ripplex.io/accounts \
       -H 'Content-Type: application/json' -d '{}'`
  5. → HTTP 200 en ~0,3 s. Même infra, port différent, seul le 443 passe.

Tx / code : aucune — c'est précisément le problème.

Contournement trouvé :
  Aucun côté code. Testé et écarté :
  - `https://lending-hackathon.dev.ripplex.io` (443) → répond en TLS mais avec
    un certificat qui ne couvre pas ce nom d'hôte
    (`SSL: no alternative certificate subject name matches target host name`).
    C'est le LB partagé du faucet, pas un endpoint RPC.
  - `https://lending-hackathon-rpc.dev.ripplex.io` → NXDOMAIN.
  Reste donc : partage de connexion 4G, VPN, ou un mentor qui ouvre un
  endpoint 443. **À demander dès l'ouverture.**

Résolu à 13:14 — partage de connexion 4G. Confirmation en trois points :
  - IP publique passée de `89.30.29.100` (wifi) à `77.136.66.215` (4G).
  - **Témoin tiers, indépendant d'XRPL** : `http://portquiz.net:51234`
    renvoie `000` (timeout) sur le wifi et `200` en 4G, alors que
    `portquiz.net:80` répond en 0,3 s dans les deux cas. Le filtrage porte
    donc sur le PORT, pas sur la destination. Ce test est le bon réflexe à
    documenter : il sépare en 8 s « c'est mon réseau » de « c'est leur infra ».
  - Le devnet répond alors immédiatement : `build_version 3.4.0-rc1`,
    `network_id 4001`, `server_state full`, 4 peers.

  Piège de diagnostic à signaler : **`nc -z` donne un faux positif** sur ce
  réseau — « succeeded » sur 51233 et 51234 alors que rien ne passe. Le
  middlebox renvoie le SYN-ACK puis jette. Ne jamais conclure « le port est
  ouvert » avec `nc` derrière un wifi filtrant ; seul un échange applicatif
  fait foi. Le README du hackathon devrait donner le test `portquiz`, pas `nc`.

  Autre faux départ, coûteux : le Mac s'était **reconnecté automatiquement
  au wifi** après l'activation du partage 4G. Le premier « test en 4G » a donc
  été fait sur le wifi sans que personne s'en aperçoive, et a conclu à tort à
  une panne côté Ripple. Vérifier `route -n get default` + l'IP publique AVANT
  d'interpréter un test réseau, et couper le wifi avec
  `networksetup -setairportpower en0 off`.

Proposition :
  1. Exposer `wss://…:443` et `https://…:443` en plus des ports 51233/51234.
     C'est ce que font Testnet et Devnet publics via `s.altnet.rippletest.net`
     — l'absence sur le devnet hackathon est une régression d'expérience.
  2. À défaut, écrire **en tête du brief** que les ports 51233/51234 doivent
     être joignables, avec la commande de vérification à lancer AVANT de
     venir. Une équipe qui découvre ça samedi 11h30 perd sa matinée.
  3. Faire échouer `check-connection.mjs` avec ce diagnostic précis plutôt
     qu'un timeout générique de xrpl.js — le message actuel
     (« the rippled server may be blocked or inaccessible ») est correct mais
     ne distingue pas « serveur down » de « port filtré chez toi ».

---

### [12:27] `xrpl@latest` est passé en 5.2.0 stable — la consigne du brief devient ambiguë
Phase : onboarding
Catégorie : client libraries + documentation/tutorials
Sévérité : moyenne
Lib : xrpl@4.6.0

Tenté :
  Vérifier la version stable de `xrpl` au 12/09/2026, comme exigé avant de
  figer `package.json`.

Attendu :
  Une 4.x en `latest`, cohérente avec le `^4.4.1` du repo.

Obtenu :
  `npm view xrpl version` → **5.2.0**. Dist-tags :
    latest                     : 5.2.0
    beta-experimental          : 5.2.0-beta.1
  `^4.4.1` résout donc vers **4.6.0** (les préversions 4.7.0-smartcontract.0
  sont exclues du range semver).

  Le problème : CLAUDE.md dit « `xrpl` stable — JAMAIS `5.2.0-beta.0` (c'est
  le Track 2) ». Mais `5.2.0` **stable** existe désormais et n'est pas
  `5.2.0-beta.0`. La consigne, écrite quand 5.2.0 n'était qu'une beta, ne
  tranche plus le cas. Un dev qui lit « prends la stable » et fait
  `npm i xrpl` atterrit sur 5.2.0 et croit respecter la règle.

Repro :
  1. `npm view xrpl dist-tags`
  2. Comparer avec la formulation du brief.

Tx / code : n/a

Contournement trouvé :
  On reste sur ce que `package.json` résout, soit **4.6.0**, et on le reporte
  en tête de FEEDBACK.md. Décision à confirmer avec un mentor : est-ce que
  5.2.0 stable est autorisé en Track 1, ou est-ce que toute la ligne 5.x est
  réservée au Track 2 ?

Proposition :
  Épingler une version **exacte** dans le brief (`xrpl@4.6.0`), pas une
  consigne relative du type « la stable ». Une consigne relative se périme
  entre l'écriture du brief et le jour J ; un numéro exact, non.

---

### [12:28] Le SDK stable 4.6.0 type DÉJÀ les 15 transactions Vault/Loan — hypothèse H5 largement infirmée
Phase : construction
Catégorie : client libraries
Sévérité : basse (c'est une bonne nouvelle, à documenter comme telle)
Lib : xrpl@4.6.0

Tenté :
  Remplir le tableau de l'hypothèse H5 (« le SDK stable ne supporte pas tous
  les types de transaction ») sans attendre le réseau, en inspectant
  directement `node_modules/xrpl/dist/npm/models/transactions/`.

Attendu :
  D'après H5 : plusieurs types manquants, donc JSON brut via `raw-submit.mjs`.

Obtenu :
  **Les 15 types ont un fichier de modèle dédié** (`.js` + `.d.ts`) :
    vaultCreate, vaultSet, vaultDeposit, vaultWithdraw, vaultDelete,
    vaultClawback, loanBrokerSet, loanBrokerDelete, loanBrokerCoverDeposit,
    loanBrokerCoverWithdraw, loanBrokerCoverClawback, loanSet, loanPay,
    loanManage, loanDelete.
  Noter que `VaultSet`, `VaultClawback`, `LoanBrokerDelete` et
  `LoanBrokerCoverClawback` ne figuraient même pas dans le tableau H5 — le
  tableau du repo est incomplet, pas le SDK.

  ⚠️ Vérifié statiquement (présence des modèles + validateurs), PAS encore
  à l'exécution. Reste à confirmer une fois le réseau joignable :
  `autofill` + `submit` réels, et surtout si `ripple-binary-codec` sérialise
  correctement les champs (un modèle TS présent n'implique pas une définition
  de champ présente côté codec).

Repro :
  1. `npm install` (résout 4.6.0)
  2. `ls node_modules/xrpl/dist/npm/models/transactions/ | grep -iE "vault|loan"`

Tx / code : n/a (inspection statique)

Contournement trouvé : aucun nécessaire a priori.

Proposition :
  Le dire explicitement dans le brief du hackathon. Le brief demande « Did the
  SDK support the needed transaction types, or did you construct raw JSON? »,
  ce qui laisse entendre que non. Les équipes vont perdre du temps à écrire du
  JSON brut défensivement alors que le support typé est là depuis la 4.x.

---

### [12:29] Bonus doc : `PrincipleOutstanding` est bien une faute de la DOC, pas du protocole
Phase : construction
Catégorie : documentation/tutorials
Sévérité : basse — mais c'est un item de bonus « correction de doc » gratuit
Lib : xrpl@4.6.0

Tenté :
  Trancher la question laissée ouverte dans HYPOTHESES.md (section Bonus) :
  l'exemple de first-loss capital de la doc écrit `PrincipleOutstanding`
  (« principle » au lieu de « principal »). Est-ce la doc qui se trompe, ou
  le nom de champ réel du protocole ? Si c'est le champ, c'est une verrue
  d'API permanente une fois l'amendment activé.

Attendu :
  Incertain — d'où le test.

Obtenu :
  **C'est la doc.** Grep sur le SDK et sur `ripple-binary-codec` :
    7 occurrences de `PrincipalOutstanding` (orthographe correcte)
    0 occurrence de `PrincipleOutstanding`
  Le champ du protocole est donc correctement nommé. Au passage,
  `CoverRateMinimum` et `CoverRateLiquidation` sont confirmés comme noms de
  champs réels (18 occurrences chacun) — ce qui rend l'hypothèse H1 sur le
  nommage pertinente : ce sont bien les noms que verront les intégrateurs.

Repro :
  1. `grep -rohE "Princip[a-z]*Outstanding" node_modules/xrpl/dist/npm/ \
       node_modules/ripple-binary-codec/dist/ | sort | uniq -c`

Tx / code : n/a

Contournement trouvé : n/a

Proposition :
  PR sur `XRPLF/xrpl-dev-portal` corrigeant `PrincipleOutstanding` →
  `PrincipalOutstanding`, et dans la même PR la coquille `depostitor` déjà
  repérée sur la page concepts. Deux corrections, une PR, à citer dans
  FEEDBACK.md § Bonus contribution.

---

### [12:29] La constante d'index des amendments du repo est correcte — vérifiée par calcul
Phase : onboarding
Catégorie : documentation/tutorials
Sévérité : basse
Lib : xrpl@4.6.0

Tenté :
  Vérifier la constante hardcodée de `check-connection.mjs`
  (`7DB0788C…CD6EF4`), signalée comme potentiellement fausse.

Obtenu :
  Elle est **exacte**. `sha512half(0x0066)` — l'espace de ledger « Amendments »
  — redonne bit pour bit la constante. Pas de bug ici.

  En revanche la vraie friction est ailleurs : `ledger_entry` ne renvoie que
  des **IDs d'amendments**, jamais leurs noms. Pour répondre à « est-ce que
  LendingProtocolV1_1 est actif sur ce ledger ? » — soit exactement la règle
  n°4 de CLAUDE.md, celle qui décide si un `LoanSet` qui échoue est notre bug
  ou pas — il faut aller comparer 40+ hashes à la main contre une page web.

Repro :
  1. `node -e 'const c=require("crypto");
     console.log(c.createHash("sha512").update(Buffer.from([0x00,0x66]))
       .digest("hex").slice(0,64).toUpperCase())'`
  2. Comparer à la constante du script.

Tx / code : n/a

Contournement trouvé :
  `check-connection.mjs` réécrit avec trois niveaux de repli :
  `feature` (renvoie les NOMS) → `ledger_entry {amendments:true}` → index brut.
  Le script signale désormais explicitement si V1.1 semble actif.
  ⚠️ `feature` est admin-only sur beaucoup de serveurs : à confirmer sur ce
  devnet une fois le réseau joignable.

Proposition :
  Que `ledger_entry {amendments:true}` renvoie les noms en plus des IDs, ou
  que `feature` soit ouvert en lecture sur les devnets de hackathon. Savoir
  quelle version du protocole tourne ne devrait pas demander un accès admin
  ni une comparaison manuelle de hashes.

---

### [12:43] L'install du hook DevEx est écrite pour un agent, mais l'étape clé n'est pas exécutable par un agent sandboxé
Phase : onboarding
Catégorie : documentation/tutorials
Sévérité : basse
Lib : n/a (xrpl-devex-hook 2.4.0)

Tenté :
  Suivre `agent-instruction.md` de bout en bout en tant qu'agent, comme le
  fichier le demande explicitement (« MUST DO FOR AGENTS », « If you are an AI
  coding agent, install XRPL DevEx Capture before you start building »).

Attendu :
  Les 5 étapes exécutables par l'agent, puisque le document s'adresse à lui.

Obtenu :
  Les étapes 1, 2, 3 et 5 passent. **L'étape 4 a été refusée par le classifieur
  de permissions de Claude Code en mode auto** :
    INVITE_CODE="..." TEAM_NAME="..." CONSENT=yes \
      node xrpl-devex-hook/hook/setup.mjs --non-interactive --agent claude-code
  Probablement la conjonction « exécuter un script tout juste cloné » +
  « variable d'environnement qui ressemble à un secret ». Le développeur a dû
  copier-coller la commande dans son terminal. Elle a alors marché du premier
  coup, sans aucune friction.

  Ironie utile pour l'équipe DevEx : la commande qui enregistre le consentement
  est exactement celle qu'un agent correctement bridé refusera de lancer seul —
  et c'est probablement le bon comportement. Mais alors le document devrait le
  prévoir.

Repro :
  1. Lancer un agent en mode permissions automatiques.
  2. Lui donner `agent-instruction.md`.
  3. Étape 4 → refus du classifieur.

Tx / code : n/a

Contournement trouvé :
  L'agent affiche la commande, le développeur la lance lui-même. ~30 s perdues.
  `--non-interactive` reste le bon design : c'est le préfixe de variables
  d'environnement qui déclenche le refus, pas le flag.

Proposition :
  1. Ajouter à `agent-instruction.md` une note « si ton bac à sable refuse
     l'étape 4, affiche la commande au développeur et demande-lui de la lancer,
     puis reprends à l'étape 5 ». Trois lignes qui évitent qu'un agent
     abandonne ou tente de contourner sa propre sandbox.
  2. Accepter le code d'invitation via un fichier ou stdin plutôt qu'une
     variable d'environnement en préfixe de commande — ce motif est
     précisément ce que les classifieurs de secrets ciblent.

  À noter : cette friction porte sur l'outillage DevEx lui-même, pas sur XRPL.
  Elle est consignée ici parce que le hook est présenté comme la première
  tâche du hackathon et que tout retard dessus retarde la capture.

---

### [13:03] Le hook capture 0 événement si l'agent est lancé depuis le dossier parent — échec silencieux
Phase : onboarding
Catégorie : tooling
Sévérité : moyenne
Lib : n/a (xrpl-devex-hook 2.4.0)

Tenté :
  Vérifier que la capture tourne, une heure après l'install.

Attendu :
  Des événements pour la session en cours.

Obtenu :
  `node xrpl-devex-hook/hook/status.mjs` répond « Hooks: registered »,
  « Sent: 1 event(s) », « Buffered: 0 ». Mais l'unique événement envoyé date de
  10:53 UTC et porte le `session_id` 5839ef8f, celui de la session d'install.
  La session de travail en cours — plusieurs tours, plusieurs appels Bash —
  n'a produit aucun événement.

  Cause : `setup.mjs` écrit les hooks dans
  `<projet>/.claude/settings.local.json`, ici `Hackathon XRPL/xrpl-lending/`.
  L'agent a été rouvert depuis le dossier PARENT `Hackathon XRPL/`, qui n'a pas
  de `.claude/`. Claude Code ne charge pas les settings d'un sous-dossier :
  aucun hook n'est armé, et rien ne le signale.

Repro :
  1. Installer le hook dans `projet/sous-dossier/`.
  2. Relancer l'agent avec le cwd sur `projet/`.
  3. Travailler plusieurs tours → `sent.jsonl` n'augmente pas.

Tx / code : n/a

Contournement trouvé :
  Remettre le cwd de l'agent sur le dossier qui contient `.claude/`. Vérifié à
  11:04 UTC : un simple changement de dossier de travail en cours de session
  suffit, Claude Code recharge les settings projet et arme les hooks sans
  redémarrage — un `session_start` (3b9c56e5) est apparu dans le buffer
  immédiatement. Bon point pour Claude Code ; ne change rien au fait que
  l'heure précédente est perdue.

Proposition :
  1. `status.mjs` compare déjà le chemin des hooks au projet courant : qu'il
     affiche un AVERTISSEMENT quand aucun événement n'est arrivé depuis
     l'install, ou quand `current_session_id` est plus vieux que N minutes.
     Un « registered » vert alors que rien n'est capturé est le pire des états.
  2. `setup.mjs` pourrait détecter qu'il s'installe dans un sous-dossier d'un
     dépôt/dossier de travail plus large et proposer le niveau au-dessus.
  3. Documenter dans `INSTALL.md` : « installe depuis le dossier que tu ouvres
     dans ton agent, pas depuis le sous-dossier du code ».

  Impact hackathon : une heure de travail non capturée = une heure de preuve
  perdue sur les 40 % de la note. C'est exactement le mode de défaillance que
  l'outil doit rendre impossible.

---

### [13:05] ⚠️ `LendingProtocolV1_1` est ACTIF sur le devnet hackathon — la prémisse du Track 1 est en question
Phase : onboarding
Catégorie : other (configuration d'événement) + documentation/tutorials
Sévérité : **haute — bloquant potentiel de track**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1 · network_id 4001

Tenté :
  Vérifier quels amendments sont actifs avant de construire, via `feature`.

Attendu :
  `LendingProtocol` + `SingleAssetVault` actifs, et **V1.1 inactif** — le
  Track 1 est explicitement défini comme « Lending Protocol **V1** (pas V1.1) »
  dans CLAUDE.md, et porte sur un vault **open-ended**.

Obtenu :
  48 amendments actifs, dont les trois :
    ENABLED: LendingProtocol
    ENABLED: SingleAssetVault
    ENABLED: LendingProtocolV1_1
  Aucun amendment lending n'est désactivé.

  Or la règle n°4 de CLAUDE.md dit : « Si des `LoanSet` commencent soudain à
  échouer sur un vault ouvert : possible activation de V1.1 sur le ledger, ce
  qui restreindrait les nouveaux prêts aux vaults fermés. »

  V1.1 n'est donc pas « possiblement » activé : **il l'est déjà, au démarrage,
  avant qu'on ait écrit la moindre ligne**. Si la restriction annoncée est
  réelle, l'énoncé même du Track 1 (prêts sur vault open-ended) n'est pas
  réalisable sur ce ledger.

  ⚠️ NON ENCORE VÉRIFIÉ à l'exécution : aucun `LoanSet` n'a été tenté. Il est
  possible que V1.1 n'interdise rien de ce qu'on veut faire. **À tester en
  priorité absolue avant de construire quoi que ce soit d'autre.**

  ✅ **TRANCHÉ à 13:34 — voir l'entrée dédiée.** Un `LoanSet` de 100 XRP passe
  en `tesSUCCESS` sur un vault open-ended avec V1.1 actif. L'alerte est levée,
  le Track 1 est constructible. L'entrée reste au rapport : elle documente une
  ambiguïté réelle de configuration d'événement, et le fait qu'aucune
  documentation ne permettait de répondre autrement qu'en essayant.

Repro :
  1. `node scripts/check-connection.mjs`
  2. Section « amendments actifs » → les trois apparaissent.
  Ou directement :
  `client.request({command:"feature"})` puis filtrer `enabled === true`.

Tx / code : n/a — lecture d'état.

Contournement trouvé :
  Aucun possible côté client : un amendment actif ne se désactive pas depuis
  une application. C'est une décision de configuration de l'événement.

Proposition :
  1. **Action immédiate : prévenir un mentor** (règle n°4 de CLAUDE.md), et
     faire préciser si le Track 1 reste jouable tel qu'énoncé.
  2. Pour l'organisation : l'état des amendments du devnet devrait être publié
     dans le brief, et vérifié avant l'ouverture. Un track défini par une
     version de protocole ne devrait pas tourner sur un ledger où la version
     suivante est active.
  3. Pour le protocole : qu'un `LoanSet` refusé pour cause de vault ouvert
     renvoie un code explicite et distinct, pas un `tec` générique. C'est
     exactement le genre de situation où un développeur perd des heures à
     chercher son propre bug.

---

### [13:12] Le script d'onboarding du repo échoue 2 fois sur 2 : le faucet répond 200 avant que le compte soit utilisable
Phase : onboarding
Catégorie : UX + documentation/tutorials
Sévérité : haute
Lib : xrpl@4.6.0

Tenté :
  `node scripts/check-connection.mjs`, le script « vérifier une transaction
  basique avant de construire » fourni par le starter.

Attendu :
  Un `tesSUCCESS` et un hash.

Obtenu :
  Échec **2 fois sur 2**, à ~60 s :
    ÉCHEC : The latest ledger sequence 63667 is greater than the
    transaction's LastLedgerSequence (63666).
    Preliminary result: tesSUCCESS
  Message doublement trompeur :
  - il désigne `LastLedgerSequence`, donc une fenêtre trop courte ;
  - il affiche `Preliminary result: tesSUCCESS`, donc « ça a marché ».
  Un développeur va logiquement élargir la fenêtre. **C'est une fausse piste.**

  Cause réelle, isolée par test différentiel :
  - Variante A — fenêtre élargie (`LastLedgerSequence = current + 60`) **et**
    attente de visibilité du compte → `tesSUCCESS` en 5,2 s.
  - Variante B — **attente de visibilité seule**, fenêtre par défaut d'autofill
    (+20 ledgers, soit ~58 s) → `tesSUCCESS` en **4,3 s**.
  Donc la fenêtre n'est pas en cause. La cause est que **le faucet renvoie
  HTTP 200 avec une adresse et un solde avant que le compte soit lisible sur
  un ledger validé** : il a fallu 2, 3 puis 4 sondages `account_info`
  (~4 à 8 s) selon les runs. `autofill` appelé immédiatement construit une
  transaction sur un état qui n'existe pas encore ; elle n'est jamais
  appliquée et expire une minute plus tard.

Repro :
  1. `POST https://lending-hackathon-faucet.dev.ripplex.io/accounts` → 200,
     `{"account":{"address":...,"secret":...},"balance":1000}`
  2. Immédiatement : `client.autofill({TransactionType:"Payment", ...})`
     puis `submitAndWait`.
  3. → `Preliminary result: tesSUCCESS` puis expiration ~60 s plus tard.
  4. Intercaler une boucle `account_info` sur `ledger_index:"validated"`
     jusqu'à succès → `tesSUCCESS` en ~4 s.

Tx / code :
  Échecs : ledgers 63666 et 63725 (transactions jamais validées, pas de hash).
  Succès après correction :
    71100491B129511AFAB783E961AA4C326739026372482E1E2D1F2844334AED6F
    03E75A49AF36AACACA42E1AEEAD7A1F6F0AC3376A8FE1BBB85D6AF0E1EC0DC19
    5156BF7E8A3C895B32FEF8072FA308257395C9AEF670D82A2A249CE814C8F9B6

Contournement trouvé :
  Helper `waitVisible()` ajouté à `scripts/check-connection.mjs` : sonde
  `account_info` sur le ledger validé, 20 essais espacés de 2 s, avant tout
  `autofill`. Le script passe désormais en 13 s.

Proposition :
  1. Que le faucet ne réponde 200 qu'une fois le compte présent sur un ledger
     validé — ou qu'il renvoie le numéro de ledger de financement pour que le
     client sache quoi attendre.
  2. Que le starter repo intègre cette attente. En l'état, le tout premier
     script que lance un participant échoue, sur un message qui pointe la
     mauvaise cause. C'est la pire première impression possible, et ça touche
     100 % des équipes.
  3. Côté xrpl.js : distinguer « expiré sans jamais être appliquée » de
     « expirée après application ». `Preliminary result: tesSUCCESS` accolé à
     une erreur d'expiration est activement trompeur.

---

### [13:26] `LoanBrokerSet` par un tiers → `tecNO_PERMISSION` : seul le propriétaire du vault peut créer le broker
Phase : build
Catégorie : documentation/tutorials + error messages
Sévérité : moyenne
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Tenté :
  Modéliser trois rôles distincts, comme le fait le brief : un prêteur qui
  possède le vault, un **loan broker tiers** qui intermédie, un emprunteur.
  `LoanBrokerSet` soumis par le compte `broker` sur le vault du `lender`.

Attendu :
  La création d'un LoanBroker. Rien dans la description du Track 1 ne dit que
  le broker doit être le propriétaire du vault — la formulation « créer un loan
  broker » suggère au contraire un acteur séparé.

Obtenu :
  `tecNO_PERMISSION`
  hash `C40FC2ACDD25AF5BEFC08642EBE37EE5E0F5A7EA2C6C06E8CB9A04A53DCD3250`

  Test de contrôle immédiat, même transaction soumise par le propriétaire du
  vault : `tesSUCCESS`
  hash `B80AB0AC6710FE89F0F65D34E589F22E376FC805DB72DBF167DB61DED77813B5`

  Donc la contrainte est bien « broker == owner du vault », et elle n'est
  écrite nulle part dans ce qu'on a lu.

Repro :
  1. Compte A crée un vault (`VaultCreate`).
  2. Compte B soumet `LoanBrokerSet` avec ce `VaultID`.
  3. → `tecNO_PERMISSION`, sans indication du champ fautif.

Tx / code : `tecNO_PERMISSION` (voir hashes ci-dessus)

Contournement trouvé :
  Faire créer le vault par le compte qui sera broker. Coût : ~10 min pour
  comprendre, et une refonte du modèle de rôles de la démo.

Proposition :
  1. Documenter explicitement la relation vault ↔ broker : qui peut créer quoi.
     Une phrase suffit : « LoanBrokerSet ne peut être soumis que par le
     propriétaire du vault référencé. »
  2. `tecNO_PERMISSION` est un code générique. Un code dédié, ou au minimum un
     message qui nomme le champ (`VaultID` appartient à un autre compte), ferait
     gagner 10 minutes à chaque équipe. C'est le genre d'erreur où le
     développeur suspecte d'abord sa signature, pas son modèle de rôles.

---

### [13:31] 🐞 BUG SDK — `signLoanSetByCounterparty` de xrpl@4.6.0 produit une signature que rippled refuse
Phase : build
Catégorie : **client libraries**
Sévérité : **haute — bloque la transaction centrale du protocole**
Lib : xrpl@4.6.0 · ripple-binary-codec 2.11.0 · rippled 3.4.0-rc1

Tenté :
  Faire contresigner un `LoanSet` par l'emprunteur avec le helper **officiel et
  dédié** du SDK, exporté depuis la racine du paquet :
    import { signLoanSetByCounterparty } from "xrpl";
    const full = signLoanSetByCounterparty(borrowerWallet, signedByBroker.tx_blob);
    await client.submitAndWait(full.tx_blob);

Attendu :
  Une signature `CounterpartySignature` valide. C'est le seul helper fourni
  pour ça, il valide le type de transaction, l'ordre des signatures, et
  construit l'objet — tout indique qu'il est le chemin nominal.

Obtenu :
  Rejet **local** par rippled, la transaction n'atteint jamais le consensus :
    fails local checks: Counterparty: Invalid signature.

  Cause trouvée en lisant le SDK. `signLoanSetByCounterparty` appelle
  `computeSignature(tx, privateKey)` (`Wallet/utils.js`), qui signe
  `encodeForSigning(tx)` — le préfixe **générique** de signature de transaction.
  Or `ripple-binary-codec` 2.11.0, que le SDK embarque déjà, **expose une
  fonction dédiée** : `encodeForSigningCounterparty`. Elle n'est appelée nulle
  part dans xrpl@4.6.0. Le SDK signe donc le mauvais payload.

  Preuve A/B, même transaction, deux signatures :
    A) helper SDK                  → REJET LOCAL « Counterparty: Invalid signature. »
    B) encodeForSigningCounterparty → accepté, exécuté (`tecINSUFFICIENT_FUNDS`,
       échec métier légitime : le vault était vide à ce moment-là)
  Les deux signatures diffèrent bit à bit. Puis, une fois le vault alimenté,
  la variante B donne **`tesSUCCESS`** :
    hash `23631C3610DA97926E8BF9FC5BC4E76E504C9DFB2683C928E825DE0138397B2B`
    LoanID `0E8007E8E777DDF4280BDC7EA88F7BEA377B55B35C1F0206977D15C6E5974BEE`

Repro :
  1. `npm i xrpl@4.6.0`
  2. Construire un `LoanSet`, le signer avec le wallet du broker.
  3. `signLoanSetByCounterparty(counterpartyWallet, blob)` puis soumettre.
  4. → `fails local checks: Counterparty: Invalid signature.` systématiquement.

Tx / code : rejet local (pas de hash) · succès du contournement ci-dessus

Contournement trouvé :
  Signer à la main avec l'encodage dédié. Ancré dans
  `scripts/raw-submit.mjs` → `signLoanSetCounterparty()` :

    const tx = decode(signedBlob);
    const forSigning = encodeForSigningCounterparty({
      ...tx, CounterpartySignature: { SigningPubKey: w.publicKey },
    });
    tx.CounterpartySignature = {
      SigningPubKey: w.publicKey,
      TxnSignature: kpSign(forSigning, w.privateKey),
    };
    return encode(tx);

  Coût : ~25 min, dont l'essentiel passé à soupçonner notre propre code — le
  message « Invalid signature » oriente naturellement vers une erreur de clé
  ou d'ordre de signature, pas vers un bug de la librairie officielle.

Proposition :
  1. **Correctif à une ligne** dans `Wallet/counterpartySigner.js` : utiliser
     `encodeForSigningCounterparty` au lieu de `encodeForSigning`. Idem pour la
     branche multisign avec `encodeForMultisigningCounterparty`, exportée elle
     aussi par le codec et pareillement inutilisée. **Nous pouvons ouvrir la PR.**
  2. Ajouter un test d'intégration qui soumet réellement un LoanSet contresigné
     à un rippled avec `LendingProtocol` activé. Un test unitaire sur la forme
     de l'objet ne détecte pas cette classe de bug : l'objet est bien formé,
     c'est le payload signé qui est faux.
  3. Le helper est exporté depuis la racine de `xrpl` et porte le nom exact de
     l'usage recherché. Tant qu'il n'est pas corrigé, toute équipe qui fait un
     `LoanSet` tombera dessus. C'est, de loin, la friction la plus coûteuse
     rencontrée aujourd'hui.

---

### [13:34] ✅ VERDICT V1.1 — un `LoanSet` passe sur un vault open-ended : le Track 1 n'est pas bloqué
Phase : build
Catégorie : other (configuration d'événement)
Sévérité : information — **lève l'alerte de l'entrée [13:05]**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1 · network_id 4001

Tenté :
  Trancher à l'exécution la question ouverte de l'entrée [13:05] :
  `LendingProtocolV1_1` étant ACTIF, un prêt sur vault **open-ended** est-il
  encore possible ? Chaîne complète exécutée, `scripts/test-v11-blocking.mjs`.

Obtenu — chaîne on-chain, étapes 1 à 3 du minimum bar :
  | Étape | Code | Hash |
  |---|---|---|
  | `VaultCreate` (open-ended, XRP) | `tesSUCCESS` | `44C3714C485C283FFA65AD9BE9F18FE1D67DAD7CB0E87413C2CC82EF79FFEA29` |
  | `VaultDeposit` 300 XRP | `tesSUCCESS` | `AAF80E41BE010ED3199B04E50DC711F669654196F04E6C1966415DA82DFD5A13` |
  | `LoanBrokerSet` | `tesSUCCESS` | `781F54B5E77A768F4C02A54E3C55902AA9F1AC96AA04037AB97CE93FFB5DBDE4` |
  | `LoanBrokerCoverDeposit` 50 XRP | `tesSUCCESS` | `3E80FDF54FA7AA415BF5CE912928B1530278656E7CDF70204A53FC7C996BCD4C` |
  | **`LoanSet` 100 XRP** | **`tesSUCCESS`** | `23631C3610DA97926E8BF9FC5BC4E76E504C9DFB2683C928E825DE0138397B2B` |

  VaultID `4E75909E40B05E55C2BD12C663147ECC5FD9CDF3AEB0DC23BA6A73FC87CADE50`
  LoanBrokerID `03C19904CC4E7D7FF4B40A5DE8A41A408143AB06F7525A367ABF0A78824A212B`
  LoanID `0E8007E8E777DDF4280BDC7EA88F7BEA377B55B35C1F0206977D15C6E5974BEE`

  **Conclusion : V1.1 actif n'interdit pas les prêts sur vault ouvert.** La
  règle n°4 de CLAUDE.md ne se déclenche pas, le Track 1 est constructible.
  L'alerte de [13:05] est levée — mais elle restait la bonne décision : deux
  heures de construction avant ce test auraient pu être perdues.

  Observation annexe, utile au rapport : **`VaultCreate` n'a aucun champ de
  durée ni de fermeture** dans xrpl@4.6.0 (`Asset`, `Data`, `AssetsMaximum`,
  `MPTokenMetadata`, `WithdrawalPolicy`, `DomainID`, `Scale`). « Open-ended »
  n'est donc pas une option qu'on demande, c'est le comportement par défaut.
  Le brief parle d'un « Single Asset Vault open-ended » comme s'il s'agissait
  d'un choix à poser ; en pratique il n'y a rien à choisir. À clarifier.

  Champs du nœud Vault créé : `Account, AssetsMaximum, Data, LEVersion, Owner,
  Sequence, ShareMPTID, WithdrawalPolicy`.

Run propre et rejouable après correctif du script (`node scripts/test-v11-blocking.mjs`),
  5 transactions / 5 en `tesSUCCESS` d'un seul jet :
    VaultCreate            `4EB2D79B3731F017F8BAE35BE878479C986938CF7D736A7D85ACD2666DA56B5F`
    VaultDeposit           `C957251137B2A9C54EF9B3D060D9C268AB874A2DC2B215B5A27DC43E37AAF89D`
    LoanBrokerSet          `1FBB8524C89CF1A850F26CE05A1F36CB80887A6605FA3A454A17AA14CBCDF320`
    LoanBrokerCoverDeposit `4152B38C8FB8380B404ADD1BACFA20160774309FFA835EE776DCB110A66A803D`
    LoanSet                `D19CD59FB93CCF28547533C76CC1AFA71CF592FD0EC9D0A9E217A9F6EAAD85DA`
  VaultID `8F8CCB7AFDD9214483D41F87C385C4081818ED27D06F6A38A39437C7F4475F15`
  LoanBrokerID `AAAA1EB19B77E07B15F642A0F1725DA1498AABD4C26FE7A880E43167C9861471`
  LoanID `6AB3738220620157A5A76AF66E525E4A2BC41B240CDD1913D9789A02F59E5D03`

Bonus — **étape 7 du minimum bar obtenue en cours de route** : le premier
  `LoanSet` sur vault vide a été rejeté par le garde-fou de liquidité avec
  `tecINSUFFICIENT_FUNDS`. Rejet propre, code lisible, exactement le
  comportement attendu. À rejouer proprement pour la démo, avec capture.

---

### [13:58] Le « drawdown » du minimum bar ne correspond à aucune transaction du protocole
Phase : build
Catégorie : documentation/tutorials
Sévérité : moyenne
Lib : xrpl@4.6.0 · ripple-binary-codec 2.11.0 · rippled 3.4.0-rc1

Tenté :
  Exécuter l'étape 4 du minimum bar Track 1, littéralement : « Exécuter un
  drawdown ». Chercher la transaction correspondante.

Attendu :
  Un type de transaction de tirage — `LoanDraw`, ou un flag sur `LoanManage`.

Obtenu :
  **Il n'en existe aucun.** Inventaire exhaustif des deux côtés :
  - SDK xrpl@4.6.0 : 15 types Loan/Vault, aucun ne concerne un tirage.
  - `TRANSACTION_TYPES` de ripple-binary-codec 2.11.0 (donc ce que rippled
    connaît) : exactement les 15 mêmes. Pas de `LoanDraw`.
  - `LoanManage` ne porte que `tfLoanDefault`, `tfLoanImpair`, `tfLoanUnimpair`
    — de la gestion de défaut, pas du tirage.

  Le drawdown est en fait **implicite et immédiat au `LoanSet`**. Preuve on-chain
  juste après l'origination d'un prêt de 100 XRP sur un vault de 300 :
    Vault AssetsTotal     : 300.000000 XRP
    Vault AssetsAvailable : 200.000000 XRP
    Loan PrincipalOutstanding : 100.000000 XRP
  Les 100 XRP ont quitté le vault vers l'emprunteur au moment du `LoanSet`.

Repro :
  1. `LoanSet` accepté.
  2. Lire le nœud Vault : `AssetsTotal - AssetsAvailable == PrincipalOutstanding`.
  3. Chercher une transaction de tirage : il n'y en a pas.

Tx / code : `LoanSet` `D19CD59FB93CCF28547533C76CC1AFA71CF592FD0EC9D0A9E217A9F6EAAD85DA`

Contournement trouvé :
  Aucun nécessaire — mais ~15 min perdues à chercher une transaction qui
  n'existe pas, en doutant de notre lecture du SDK.

Proposition :
  Reformuler l'étape 4 du minimum bar. « Exécuter un drawdown » décrit une
  action que le développeur doit entreprendre ; en réalité il doit
  **constater** un transfert déjà survenu. Formulation qui aurait évité la
  recherche : « Vérifier que le principal a été transféré à l'emprunteur à
  l'origination (le drawdown est implicite au LoanSet) ».

---

### [14:02] `LoanPay` refuse un paiement PLUS GRAND que le `PeriodicPayment` annoncé par le ledger
Phase : build
Catégorie : **error messages** + documentation/tutorials
Sévérité : **haute — bloque le remboursement, étape 5 du minimum bar**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Tenté :
  Payer une échéance. Le nœud `Loan` annonce lui-même le montant :
    PeriodicPayment : "25013700.13119221382"
  Payé `25013701` drops, soit **arrondi au drop supérieur** — donc strictement
  plus que ce que le ledger annonce comme dû.

Attendu :
  `tesSUCCESS`. On paie plus que le montant affiché par le ledger lui-même.

Obtenu :
  `tecINSUFFICIENT_PAYMENT`
  hash `5CBD78B64B25BBC122499AE235720FEC691A8CFF4FEE9462782B2852E8461BC4`

  Le montant réellement exigé est **`PeriodicPayment + LoanServiceFee`**, soit
  `25013701 + 500000 = 25513701` drops → `tesSUCCESS`
  hash `6A5CE6C07A18A90414872D22957C04CB3FDC3CB9EF28D1B1BBB09C27B5C6C64E`
  (PrincipalOutstanding 100.000000 → 75.008218 XRP, PaymentRemaining 4 → 3)

  **Ce total n'est exposé par aucun champ du nœud `Loan`.** Les champs
  disponibles sont `PeriodicPayment`, `LoanServiceFee`, `ManagementFeeOutstanding`,
  `TotalValueOutstanding`, `PrincipalOutstanding` — le développeur doit deviner
  lesquels additionner. Nous avons trouvé par essais successifs.

  Deuxième problème, distinct : **`PeriodicPayment` est libellé en drops avec
  11 décimales** (`25013700.13119221382`) alors que le drop est l'unité
  indivisible du XRP. Un champ de montant qui ne peut pas être payé tel quel
  est un piège : l'arrondi est à la charge de l'appelant, sans règle documentée
  (inférieur ? supérieur ? le protocole n'en dit rien).

Repro :
  1. Originer un prêt, lire `PeriodicPayment` sur le nœud `Loan`.
  2. `LoanPay` avec `ceil(PeriodicPayment)` → `tecINSUFFICIENT_PAYMENT`.
  3. `LoanPay` avec `ceil(PeriodicPayment) + LoanServiceFee` → `tesSUCCESS`.

Tx / code : `tecINSUFFICIENT_PAYMENT` puis `tesSUCCESS` (hashes ci-dessus)

Contournement trouvé :
  `Amount = ceil(PeriodicPayment) + LoanServiceFee`. Ancré dans
  `scripts/steps-4-6.mjs`. ~20 min pour le trouver, par dichotomie sur le montant.

Proposition :
  1. Exposer un champ `NextPaymentAmount` (ou équivalent) sur le nœud `Loan` :
     le montant exact à passer à `LoanPay`. C'est la donnée que tout client
     va vouloir afficher à l'emprunteur, et personne ne devrait la recomposer.
  2. `tecINSUFFICIENT_PAYMENT` devrait indiquer le montant attendu. Un code qui
     dit « pas assez » sans dire « combien » force la dichotomie à coups de
     transactions réelles — coûteux en mainnet, et absurde en test.
  3. Émettre `PeriodicPayment` en drops entiers, ou documenter explicitement la
     règle d'arrondi attendue par le protocole.

---

### [14:05] `AssetsAvailable` disparaît du nœud Vault quand il tombe à zéro
Phase : build
Catégorie : **API design** + client libraries
Sévérité : moyenne
Lib : rippled 3.4.0-rc1 · lecture via `ledger_entry`

Tenté :
  Suivre la liquidité d'un vault après un `VaultWithdraw` qui la vide
  entièrement : `Number(vault.AssetsAvailable)`.

Attendu :
  `"0"`. Le champ existait à la lecture précédente, et zéro est une valeur
  parfaitement représentable.

Obtenu :
  **Le champ est absent du nœud.** `Number(undefined)` → `NaN`, qui se propage
  silencieusement dans tout calcul en aval. Notre script a affiché
  `AssetsAvailable : NaN XRP` sans lever la moindre erreur.

  C'est le comportement XRPL habituel d'omission des champs à valeur par
  défaut, mais il est particulièrement piégeur sur un champ de **solde** :
  un solde nul est une information, pas une absence d'information. Et un code
  naïf — `total - available` — produit `NaN` au lieu de planter.

Repro :
  1. `VaultWithdraw` de la totalité de `AssetsAvailable`.
  2. Relire le nœud Vault via `ledger_entry`.
  3. → plus de clé `AssetsAvailable`.

Tx / code : `VaultWithdraw` `38A914E195B577D3DD00D3DCD980C7843763C7396ED13ABEF1AAB8EEBCFA0822`

Contournement trouvé :
  `Number(vault.AssetsAvailable ?? 0)` partout. Trivial une fois connu,
  invisible tant qu'on n'a pas vidé un vault.

Proposition :
  1. Documenter la liste des champs omis à leur valeur par défaut sur `Vault`
     et `Loan` — c'est l'information dont a besoin quiconque écrit un indexeur.
  2. Côté SDK : exposer un type `VaultLedgerEntry` avec les champs optionnels
     marqués `?`, pour que TypeScript force le `?? 0`. Aujourd'hui `readEntry`
     renvoie un objet non typé, donc aucune aide de l'outillage.

---

### [14:08] ✅ Étapes 4 à 6 du minimum bar exécutées — cycle complet dépôt → prêt → remboursement → retrait
Phase : build
Catégorie : information (récapitulatif de preuves)
Sévérité : —
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

  | Étape | Transaction | Code | Hash |
  |---|---|---|---|
  | 4 — drawdown | *(implicite au `LoanSet`, cf. [13:58])* | — | constaté on-chain |
  | 5 — remboursement | `LoanPay` 25,513701 XRP | `tesSUCCESS` | `6A5CE6C07A18A90414872D22957C04CB3FDC3CB9EF28D1B1BBB09C27B5C6C64E` |
  | 6 — retrait #1 | `VaultWithdraw` 200 XRP | `tesSUCCESS` | `38A914E195B577D3DD00D3DCD980C7843763C7396ED13ABEF1AAB8EEBCFA0822` |
  | 6 — retrait #2 (rendement) | `VaultWithdraw` 25,013262 XRP | `tesSUCCESS` | `0ADACEC814E35B952AADE41DC8264FABB1C4C7F79E4FE2E16F9F1CD7FB87B5A5` |
  | *(échec instructif)* | `LoanPay` sous-payé | `tecINSUFFICIENT_PAYMENT` | `5CBD78B64B25BBC122499AE235720FEC691A8CFF4FEE9462782B2852E8461BC4` |

  **Le rendement est démontré, pas raconté.** Après le retrait de toute la
  liquidité, le vault était à `AssetsTotal = 100.000000 XRP` (le principal
  prêté). Après le remboursement d'une échéance : `100.021480 XRP`. Les
  `0,021480 XRP` d'écart sont les intérêts accrus au profit des déposants.

  Bilan du prêteur sur un dépôt de 300 XRP :
    retiré     : 200.000000 + 25.013262 = **225.013262 XRP**
    immobilisé : 75.008218 XRP (principal restant dû)
    total      : **300.021480 XRP** — soit **+0,021480 XRP** de rendement réalisé.

  Comportement open-ended confirmé : le retrait est plafonné à la liquidité
  non prêtée, sans blocage du vault ni attente d'échéance. C'est exactement la
  propriété que le Track 1 demande de démontrer.

---

### [13:52] La matrice V1.1 de la doc contredit le ledger : `LoanBrokerSet` documenté ❌ sur open-ended, observé `tesSUCCESS`
Phase : build
Catégorie : **documentation/tutorials** + protocole
Sévérité : **haute — oriente vers une refonte d'architecture inutile**
Lib : xrpl@4.6.0 · rippled **3.4.0-rc1** · network_id 4001

Tenté :
  Sourcer proprement la règle n°4 du CLAUDE.md en interrogeant la doc officielle
  du Lending Protocol V1.1 via le MCP `ripple-opensource-docs`, pour savoir ce
  que V1.1 change exactement sur les vaults ouverts.

Obtenu — la doc est explicite et contredite par nos propres hashes :
  `opensource.ripple.com/docs/lending-protocol-v1-1/closed-ended-vaults` donne
  une matrice de compatibilité où **`LoanBrokerSet` est ❌ sur open-ended**, et
  `.../updated-transactions` précise : « A loan broker can only be attached to a
  closed-ended vault. This restriction only applies to loan brokers created
  after `LendingProtocolV1_1` is enabled », avec `tecNO_PERMISSION` — « The
  target vault isn't closed-ended » comme code d'erreur prévu.

  Or `LendingProtocolV1_1` est `enabled: true` sur ce devnet (entrée [13:05]),
  et nos `LoanBrokerSet` sur vault open-ended créés **après** cette activation
  ont renvoyé `tesSUCCESS`, deux runs indépendants (entrée [13:34]) :
    `781F54B5E77A768F4C02A54E3C55902AA9F1AC96AA04037AB97CE93FFB5DBDE4`
    `1FBB8524C89CF1A850F26CE05A1F36CB80887A6605FA3A454A17AA14CBCDF320`
  La clause de grand-père de la doc ne s'applique donc pas à notre cas.

  Vérification complémentaire, sans transaction : les champs closed-ended
  existent dans `ripple-binary-codec 2.11.0` — `VaultKind` (UInt8, nth 22),
  `SubscriptionDate` (UInt32, nth 75), `RedemptionDate` (UInt32, nth 76), tous
  `isSerialized: true`. Le protocole connaît donc le concept : ce n'est pas une
  doc en avance sur un ledger qui l'ignorerait. La restriction elle-même
  semble simplement ne pas être branchée dans `3.4.0-rc1`.

Repro :
  1. `curl -X POST <RPC> -d '{"method":"feature","params":[{}]}'`
     → `LendingProtocolV1_1` `enabled: true`.
  2. `VaultCreate` sans `VaultKind` → vault open-ended, `tesSUCCESS`.
  3. `LoanBrokerSet` par le propriétaire du vault → `tesSUCCESS`.
  4. Comparer à la matrice de la doc V1.1, qui prédit `tecNO_PERMISSION`.

Tx / code : voir hashes ci-dessus, tous `tesSUCCESS`.

Coût réel pour nous :
  L'alerte de [13:05] était la bonne décision, mais la doc seule nous aurait
  fait conclure que le Track 1 open-ended était infaisable et repartir sur du
  closed-ended. Le test a coûté ~30 min ; croire la doc aurait coûté une
  refonte complète du modèle de rôles et du use case.

Proposition :
  1. Faire porter à chaque page de doc un bandeau de version protocole et la
     version `rippled` minimale qui l'implémente. Aujourd'hui rien ne distingue
     « spécifié » de « déployé », et un flag d'amendment `enabled: true` ne
     suffit visiblement pas à le déduire.
  2. Exposer la version du Lending Protocol en vigueur dans `server_info`, pour
     qu'un client puisse choisir son jeu de règles au lieu de le deviner.
  3. Si la restriction est intentionnellement absente de `3.4.0-rc1`, le dire
     dans la page V1.1. Si elle est censée être active, c'est un bug rippled.

---

### [13:54] 🐞 SDK — le codec binaire sait sérialiser les vaults closed-ended, le modèle TypeScript ne les expose pas
Phase : build
Catégorie : **client libraries**
Sévérité : moyenne à haute
Lib : xrpl@4.6.0 · ripple-binary-codec 2.11.0

Tenté :
  Déterminer si on peut créer un vault closed-ended avec le SDK stable, pour
  départager les hypothèses de l'entrée [13:52].

Obtenu — les deux couches du même SDK divergent :
  - `ripple-binary-codec/dist/enums/definitions.json` définit `VaultKind`,
    `SubscriptionDate`, `RedemptionDate` et `LEVersion`, tous sérialisables.
  - L'interface TS `VaultCreate` de `xrpl@4.6.0` ne déclare que `Asset`,
    `Data`, `AssetsMaximum`, `MPTokenMetadata`, `WithdrawalPolicy`, `DomainID`,
    `Scale`. Zéro occurrence de `VaultKind` dans tout `xrpl/dist/npm/models/`.

  Donc le wire format est prêt et les types ne le suivent pas : créer un vault
  closed-ended impose de contourner les types du SDK qu'on utilise.

Repro :
  1. `node -e` sur `definitions.json`, filtrer `FIELDS` sur `VaultKind`,
     `SubscriptionDate`, `RedemptionDate` → présents, `isSerialized: true`.
  2. `cat node_modules/xrpl/dist/npm/models/transactions/vaultCreate.d.ts`
     → aucun des trois champs.

Tx / code : aucune transaction, inspection statique.

Contournement trouvé :
  Passer par `scripts/raw-submit.mjs`. Ceci lève la réserve de l'entrée [12:28] :
  la conclusion « les 15 types sont typés, le helper JSON brut ne servira à
  rien » était trop optimiste. Le décalage est réel, mais inverse de celui
  qu'on anticipait — c'est le codec qui est en avance sur les types.

Reste à vérifier : `validateVaultCreate()` rejette-t-il les champs inconnus ?
  Ça décide entre « types incomplets, runtime permissif » et « blocage dur ».

Proposition :
  Un test de non-régression dans le repo `xrpl.js` qui compare les champs de
  `definitions.json` aux interfaces de transaction déclarées, et échoue quand
  un champ sérialisable n'est exposé par aucun modèle. Cette classe d'écart
  serait attrapée à chaque amendment au lieu d'être découverte par les
  développeurs. **Candidat de PR pour le bonus doc/code du hackathon.**

---

### [14:22] `tecINSUFFICIENT_FUNDS` renvoyé alors que les fonds sont suffisants — c'est le ratio de couverture qui bloque
Phase : build
Catégorie : **error messages**
Sévérité : moyenne
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Tenté :
  Retirer du first-loss cover d'un LoanBroker qui en détient 50 XRP, avec une
  dette en cours de 25,008219 XRP et `CoverRateMinimum` à 10 %. Le cover requis
  est donc de 2,500822 XRP, et 47,499178 XRP sont théoriquement retirables.
  Demande : 48,749589 XRP — **plus que le seuil, mais moins que le solde**.

Attendu :
  Un rejet, oui — mais un code qui dit que la **contrainte de couverture** est
  violée. Les fonds, eux, sont bien présents.

Obtenu :
  `tecINSUFFICIENT_FUNDS`
  hash `96729C19DA2348B9320E5EADE414B4598DCA68B074EF1F73191A8FD365AAE37A`

  Le code affirme littéralement qu'il n'y a pas assez de fonds, alors que le
  broker détient 50 XRP et n'en demande que 48,75. Un développeur qui lit ça
  va d'abord vérifier son solde, puis son calcul de montant — et passer à côté
  de la vraie cause, qui est le ratio de couverture minimum.

  Contrôle positif, pour prouver que la limite est bien le ratio et non un
  solde : retrait de 46,499178 XRP (1 XRP sous le seuil) → `tesSUCCESS`
  hash `90BF019FC510EF8B2E083D6716E945CD53A4914723131EE38335FEE98C4279B2`
  Cover après retrait : 3,500822 XRP pour 2,500822 XRP requis. La frontière est
  exactement `CoverAvailable - DebtTotal × CoverRateMinimum`.

Repro :
  1. LoanBroker avec `CoverRateMinimum` = 10 %, cover 50 XRP, dette 25 XRP.
  2. `LoanBrokerCoverWithdraw` de 48,75 XRP → `tecINSUFFICIENT_FUNDS`.
  3. Même transaction avec 46,5 XRP → `tesSUCCESS`.

Tx / code : voir les deux hashes ci-dessus

Contournement trouvé :
  Calculer le seuil soi-même avant de soumettre :
    seuil = CoverAvailable - DebtTotal × CoverRateMinimum / 100000
  Aucun champ ne l'expose directement, comme pour `PeriodicPayment` en [14:02].
  C'est un motif qui se répète : **le ledger publie les ingrédients, jamais le
  montant que le développeur doit effectivement passer.**

Proposition :
  1. Un code distinct — `tecINSUFFICIENT_COVER` ou équivalent — pour séparer
     « tu n'as pas les fonds » de « tu as les fonds mais tu casserais la
     couverture ». Ce sont deux bugs applicatifs très différents à corriger.
  2. Exposer `CoverWithdrawable` sur le nœud `LoanBroker`, comme
     `NextPaymentAmount` proposé sur `Loan` en [14:02]. Même remarque de fond :
     un protocole de prêt devrait publier les montants actionnables, pas
     seulement leurs composants.

---

### [14:25] ✅ Étape 7 du minimum bar — 5 garde-fous provoqués délibérément, tous validés on-chain
Phase : build
Catégorie : information (récapitulatif de preuves)
Sévérité : —
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

  Script dédié et rejouable : `node scripts/step-7-guardrails.mjs`.
  Le brief cite trois pistes (liquidité, calendrier de paiement, first-loss
  cover) ; les trois sont couvertes, plus deux contrôles supplémentaires.

  | # | Garde-fou | Code | Hash |
  |---|---|---|---|
  | 1 | Liquidité : `LoanSet` de 5 000 XRP sur un vault qui n'en a que 25 | `tecINSUFFICIENT_FUNDS` | `B92A90F59EBF79108B5414F61A12656F321EBC264E1BB186FCC14CAF259F9CAA` |
  | 2 | Calendrier : `LoanPay` de 1 XRP pour une échéance de 25,5 | `tecINSUFFICIENT_PAYMENT` | `77F708D6DDB803BE80738DE78936E6EDDD0640A153C8CCF68A5A460D1E0541B4` |
  | 3 | First-loss cover : retrait qui passerait sous le ratio minimum | `tecINSUFFICIENT_FUNDS` | `D91DEFCEF5D3765E0FD5A8AAC86D49891C68C52D10847F384042422D2595A60F` |
  | 4 | Permission : `LoanBrokerSet` par un non-propriétaire du vault | `tecNO_PERMISSION` | `33742272A6C8CF7B37CD6D1E12E79AF28CD191FAB2E45F7017F1C224A0FA40A8` |
  | 5 | Retrait plafonné à la liquidité non prêtée | `tecINSUFFICIENT_FUNDS` | `FB47313D52001E893E629975825807E8D368A9FE232AAD02B816967CD76DAAC4` |

  **Contrôle positif inclus (3 bis)** — sans lui, on ne prouverait pas que la
  limite est au bon endroit, seulement que la transaction échoue toujours :
  retrait de cover 1 XRP SOUS le seuil → `tesSUCCESS`
  `90BF019FC510EF8B2E083D6716E945CD53A4914723131EE38335FEE98C4279B2`
  Le script restaure ensuite le cover, pour rester rejouable à l'identique.

  Distinction utile pendant la démo : ces cinq rejets sont des `tec`, donc
  **validés et inscrits on-chain avec un hash vérifiable**. À opposer au rejet
  local rencontré en [13:31] (`fails local checks`), qui ne laisse aucune trace
  dans le ledger. Deux natures d'échec que l'outillage confond volontiers.

---

## Ce qui a bien marché

À ne pas négliger : « testé, se comporte comme documenté » est une information
utile pour une équipe DevEx, et ça rend le rapport crédible plutôt que
systématiquement à charge.

- **Le faucet est excellent.** 365 ms, un seul POST sans paramètre, réponse
  JSON directement exploitable (`{account:{address,secret},balance}`), compte
  financé à 1000 XRP. Zéro captcha, zéro rate limit rencontré. À garder tel quel.
- **Le support SDK des 15 types Vault/Loan est déjà là en 4.6.0 stable**, et
  mieux fourni que ce que le brief laisse craindre (cf. entrée [12:28]).
- **Les noms de champs du protocole sont propres** : `PrincipalOutstanding`
  est correctement orthographié côté codec, la faute est seulement dans la doc.
- `ripple-binary-codec` et les modèles TS sont cohérents entre eux sur les
  champs inspectés.
- **Le devnet est rapide une fois joignable.** Ledger à ~3,04 s, validation
  d'un Payment en 4,3 à 5,2 s, `server_state: full`. Rien à redire.
- **`feature` est ouvert en lecture sur ce devnet** (pas admin-only) : c'est
  ce qui a permis de voir `LendingProtocolV1_1` par son nom plutôt que de
  comparer 48 hashes à la main. À garder, et à documenter comme la bonne
  façon de vérifier la version du protocole.
- **L'install du DevEx hook est propre.** Zéro dépendance npm, project-scoped,
  rien écrit dans le home, `.gitignore` mis à jour tout seul pour
  `.xrpl-devex/` et `.claude/settings.local.json`, chemins absolus dans les
  hooks (le piège classique du exit 127 est traité). Le texte de consentement
  est explicite, y compris sur le fait qu'un pseudonyme + un nom d'équipe
  peuvent réidentifier dans une petite cohorte. Rare et honnête.

---

## Questions restées sans réponse

Choses qu'on n'a pas eu le temps de tester, ou comportements qu'on n'a pas
su expliquer. Une section « limites de notre test » dans le rapport final
vaut mieux qu'une affirmation fausse.

- **L'effet réel de `LendingProtocolV1_1`** (entrée [13:05]). On sait qu'il est
  actif ; on ne sait pas encore s'il interdit vraiment les prêts sur vault
  open-ended. Aucun `LoanSet` tenté. **Question n°1 à trancher.**
- **Tout le reste de l'on-chain.** Réseau joignable depuis 13:0x, mais seules
  des transactions `Payment` ont été soumises. H1, H2, H3, H4, H6, H7, H8, H9,
  H10, H11 restent à tester et les 8 étapes du minimum bar ne sont pas entamées.
- H5 est infirmée *statiquement* mais pas *à l'exécution* : un modèle TS
  présent n'implique pas que `ripple-binary-codec` sérialise tous les champs.
  À reconfirmer par une vraie soumission.
- ~~`feature` est-il ouvert en lecture sur ce devnet, ou admin-only ?~~
  **Répondu [13:52] : ouvert en lecture.** `{"method":"feature","params":[{}]}`
  sur le RPC public renvoie la liste complète. Détection automatisable.
  Reste ouvert en revanche : comment connaître la version du Lending Protocol
  réellement *implémentée* par le build, le flag d'amendment ne suffisant pas
  (cf. [13:52]).
- Le wifi de l'IIM laisse-t-il sortir 51233/51234 ? Si non, c'est un problème
  pour toutes les équipes, pas seulement la nôtre — à vérifier sur place en
  priorité absolue.

---

### [13:49*] Les parts de vault portent le flag `CanTrade`, mais tout `OfferCreate` sur un MPT est rejeté `temDISABLED`
Phase : build
Catégorie : UX + documentation/tutorials
Sévérité : moyenne à haute
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

> \* horloge de la machine 1. Cette entrée et les trois suivantes sont
> **postérieures** à l'entrée [14:25] : les horloges des postes divergent.

Tenté :
  Vérifier ce que recouvre la promesse de la doc concepts : les parts de vault
  sont *« a first-class asset […] can be transferred and used in other
  on-ledger protocols that support MPTs »*. Premier chemin testé : le DEX natif.
  `vault_info` sur le vault `8F8CCB7A…` montre une issuance de parts avec
  `Flags: 56` = `lsfMPTCanEscrow` (0x08) | `lsfMPTCanTrade` (0x10) |
  `lsfMPTCanTransfer` (0x20). Le flag « peut être échangé » est donc **posé par
  défaut** sur les parts, sans que `VaultCreate` ne l'ait demandé.

Attendu :
  Soit une offre acceptée, soit un rejet nommant la vraie cause.

Obtenu :
  `temDISABLED` — « The transaction requires logic that is currently disabled. »
  Rejet **local**, donc aucun hash, aucune trace on-chain. Cohérent avec la doc
  MPT (« trading MPTs in the DEX is not currently implemented », amendment
  `MPTokensV2` / XLS-82 encore *In Development*), mais contradictoire avec le
  flag que le protocole a lui-même posé sur l'issuance.

Repro :
  1. `vault_info` sur un vault quelconque → relever `shares.Flags` (56).
  2. `OfferCreate` avec `TakerGets: {mpt_issuance_id: <ShareMPTID>, value: "…"}`
     et `TakerPays` en XRP, signé par un détenteur de parts.
  3. → `temDISABLED`.

Tx / code : `temDISABLED` (pas de hash — rejet local, cf. distinction [14:25]).

Contournement trouvé :
  Aucun sur le DEX. Le transfert de gré à gré fonctionne, cf. les deux entrées
  suivantes.

Proposition :
  Ne pas activer `lsfMPTCanTrade` sur les parts de vault tant que XLS-82 n'est
  pas déployé — un flag qui annonce une capacité indisponible envoie le
  développeur construire une fonctionnalité impossible. À défaut, que
  `OfferCreate` renvoie un code qui nomme la cause (`temMPT_DEX_UNSUPPORTED`)
  plutôt que le `temDISABLED` générique, et que la section « Vault Share
  Distribution and Redemption » liste explicitement DEX et AMM comme
  non supportés à ce jour.

---

### [13:52*] `Payment` de parts de vault → `tecNO_AUTH` : l'opt-in du destinataire ne figure dans aucune des 5 causes d'échec documentées
Phase : build
Catégorie : documentation/tutorials
Sévérité : haute
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Tenté :
  Transférer 1 000 000 parts d'un déposant vers un compte tiers, exactement
  comme la doc l'indique : *« A depositor can transfer vault shares to another
  account by making a Payment transaction. Nothing changes in the way the
  payment transaction is submitted for transferring vault shares. »*

Attendu :
  `tesSUCCESS`, ou l'une des cinq causes d'échec que la même page énumère :
  vault privé sans credential, parts non transférables, gel global,
  MPT sous-jacent verrouillé, trust line gelée.

Obtenu :
  `tecNO_AUTH` — hash `789AAF7E228CC085199E2FB38B07A10DFC68A45C76C5FC3EFDB498BC5FD512A4`.
  Aucune des cinq causes documentées ne s'applique : vault public, parts
  transférables (`lsfMPTCanTransfer` posé), actif sous-jacent = XRP, aucun gel.
  La vraie cause est le mécanisme MPT standard : le destinataire doit d'abord
  créer son objet `MPToken` par un `MPTokenAuthorize`. La page « Vault Share
  Distribution and Redemption » ne le mentionne nulle part, alors que c'est la
  **première** chose que rencontre quiconque transfère des parts.

Repro :
  1. Compte B n'a jamais interagi avec l'issuance des parts.
  2. `Payment` de parts A → B. → `tecNO_AUTH`.
  3. `MPTokenAuthorize` par B (`3AD6F7E37DF8778E03B12279F9CE4F3FD25B1C0FEECA774920E49ED2894F3EA4`).
  4. Rejouer le `Payment` → `tesSUCCESS`
     (`B20699B9EBB2E3B60439FD86316CEC44F9579DBFABED6C779675522233791601`).

Contournement trouvé :
  `MPTokenAuthorize` par le destinataire avant tout transfert. Trivial une fois
  connu, invisible avant.

Proposition :
  Ajouter l'opt-in comme sixième cause d'échec de la liste, avec le code
  `tecNO_AUTH` nommé, et une ligne de code `MPTokenAuthorize` dans l'exemple de
  transfert. C'est une correction de doc de trois lignes — candidate directe au
  bonus « correction de doc » du brief, à grouper avec la PR `depostitor` /
  `PrincipleOutstanding`.

---

### [13:56*] Incohérence : `EscrowCreate` de parts vers un destinataire non autorisé réussit, là où `Payment` échoue
Phase : build
Catégorie : UX (cohérence protocole)
Sévérité : moyenne
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Tenté :
  Immédiatement après le `tecNO_AUTH` de l'entrée précédente, et vers le **même
  destinataire toujours non autorisé**, verrouiller des parts dans un escrow
  conditionnel (`Condition` PreimageSha256) — la jambe d'un swap atomique.

Attendu :
  Par cohérence avec `Payment`, un `tecNO_AUTH`.

Obtenu :
  `tesSUCCESS` — hash `0838560261724B922E2FF98B9EC6DE0F6F6CB145A265D26980B48E395569D988`.
  Deux transactions qui livrent le même actif au même compte, l'une refuse
  faute d'opt-in, l'autre accepte. Le contrôle est donc reporté à
  l'`EscrowFinish`. Piège concret : un vendeur peut verrouiller ses parts vers
  un acheteur qui n'a pas fait son opt-in et découvrir le blocage seulement au
  dénouement, les parts restant immobilisées jusqu'à `CancelAfter`.

Repro :
  1. B sans objet `MPToken` pour l'issuance.
  2. `Payment` de parts A → B → `tecNO_AUTH`.
  3. `EscrowCreate` de parts A → B, avec `Condition` et `CancelAfter`
     → `tesSUCCESS`.

Proposition :
  Aligner les deux : soit `EscrowCreate` vérifie l'opt-in du destinataire à la
  création, soit `Payment` crée l'objet `MPToken` implicitement. À défaut,
  documenter que le contrôle d'autorisation d'un escrow MPT est différé au
  dénouement.

---

### [14:02*] ✅ Le marché secondaire des parts de vault est réalisable : HTLC validé de bout en bout, y compris le rachat par un porteur secondaire
Phase : build
Catégorie : information (récapitulatif de preuves) — **ce qui marche**
Sévérité : —
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Chaîne testée sur le vault `8F8CCB7AFDD9214483D41F87C385C4081818ED27D06F6A38A39437C7F4475F15`,
issuance de parts `000000017636DBBC2AA4229410F36FC1FD941F7F332DE063`.
Scripts : `scripts/_probe-shares*.mjs`.

  | # | Test | Code | Hash |
  |---|---|---|---|
  | 1 | `OfferCreate` sur MPT (DEX) | `temDISABLED` | *(rejet local, pas de hash)* |
  | 2 | `Payment` de parts sans opt-in | `tecNO_AUTH` | `789AAF7E228CC085199E2FB38B07A10DFC68A45C76C5FC3EFDB498BC5FD512A4` |
  | 3 | `EscrowCreate` de parts + `Condition` | `tesSUCCESS` | `0838560261724B922E2FF98B9EC6DE0F6F6CB145A265D26980B48E395569D988` |
  | 4a | `MPTokenAuthorize` par l'acheteur | `tesSUCCESS` | `3AD6F7E37DF8778E03B12279F9CE4F3FD25B1C0FEECA774920E49ED2894F3EA4` |
  | 4b | `Payment` de parts, 2e tentative | `tesSUCCESS` | `B20699B9EBB2E3B60439FD86316CEC44F9579DBFABED6C779675522233791601` |
  | 5 | `EscrowFinish` avec le preimage | `tesSUCCESS` | `65077D089B7F38D4D01C85C989FA219477D5E124AAC765F6B6481011ED9AA939` |
  | 6 | `VaultWithdraw` par le porteur secondaire, vault sans liquidité | `tecINSUFFICIENT_FUNDS` | `6C53A0E069A07E63201CF6B022C93A4D7784A87F0E5DB8B7B88A007DE17D38C3` |
  | 6bis | `VaultWithdraw` par le porteur secondaire, liquidité rétablie | `tesSUCCESS` | `41C9213FBFA77F5E06FD0906A91C55DFD827CE635F236FF98602ECDC636F00BF` |

**Ce que ça établit.** Les parts de vault survivent au transfert : un compte qui
n'a **jamais déposé** dans le vault, entré en possession de parts par escrow et
par paiement, peut ensuite les racheter contre l'actif sous-jacent
(+0,5 XRP livrés au test 6bis). La qualité de déposant est portée par la part,
pas par un historique attaché au compte. C'est la condition nécessaire d'un
marché secondaire, et elle est remplie.

`EscrowCreate` + `Condition` PreimageSha256 sur des parts, testé au test 3/5,
donne la primitive d'échange atomique que le DEX refuse : deux escrows croisés
partageant la même condition = swap parts ↔ XRP sans confiance. Aucun amendment
`Batch` n'est actif sur ce devnet, c'est donc le seul chemin atomique disponible.

**Observation annexe pour le rapport.** Au test 6, `AssetsAvailable` était
absent du nœud (= 0, cf. [14:05]) : 100 % du capital était prêté et le déposant
**ne pouvait pas sortir**. C'est très exactement le mismatch de duration d'un
vault open-ended adossé à des prêts à terme fixe, observé sans avoir eu à le
provoquer.

---

### [14:52] ✅ Étape 8 du minimum bar — use case joué de bout en bout, 13 transactions
Phase : build
Catégorie : information (récapitulatif de preuves)
Sévérité : —
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Script rejouable : `node scripts/step-8-secondary.mjs`. Scène complète créée
depuis zéro à chaque exécution. **13/13 transactions conformes aux attentes au
premier essai**, y compris le rejet volontaire de la scène 2.

  VaultID `52AD63C906F6F5FE5928F22DC2CFAADBABF6595BBDBFA53A512CF5AF9BD322D4`
  LoanBrokerID `A9F0DA3110443A8C8C406EF59D0C0CD4A0FE55C65E03078B7690189C72891542`
  LoanID `8FBF8105D07DEADCBB24BE0D7E7BA55C2F85DD45A74729536D0401F8473F70CC`
  ShareMPTID `00000001E240843AD1F584CE6A9555ACC37659866B8AE49E`

  | Scène | Transaction | Code | Hash |
  |---|---|---|---|
  | 1 | `VaultCreate` open-ended | `tesSUCCESS` | `4161747804C50C586639780CB05A48E82C1095D851C35B4E2837BEB159197C5A` |
  | 1 | `VaultDeposit` 100 XRP | `tesSUCCESS` | `79D4C29313F13D19523944F366284D677A42EECFB1BC31DCCD688CEFB22DF64C` |
  | 1 | `LoanBrokerSet` | `tesSUCCESS` | `05DC69130B8AA56507DE097C716B9F242093C14B64810370C041EEA663BF3D05` |
  | 1 | `LoanBrokerCoverDeposit` 20 XRP | `tesSUCCESS` | `D1F73AD5343B901F2BF50F4861A4585FDF7DE93DFC78CC8295CBF1055320FAE0` |
  | 1 | `LoanSet` — **100 % de la liquidité** | `tesSUCCESS` | `7B42A72A3F9199AA1BD7469901CA9F30AF033C6550B16349C928220B65A381AD` |
  | 2 | `VaultWithdraw` par la déposante — **le mur** | `tecINSUFFICIENT_FUNDS` | `06D7AB5C199C0E4C2FEE354F314D93D2299491EF72881168AA0A6691F4CBFC64` |
  | 3 | `MPTokenAuthorize` (acheteur) | `tesSUCCESS` | `6D784E1F1B25E870E5487531A9485840A988C0959AFAD98BC203ED213ED2C548` |
  | 3 | `EscrowCreate` paiement, +2 h | `tesSUCCESS` | `53B67004BA47971B62E221AC942AE05B0FDF15873025FD68E25CAAF076656A84` |
  | 3 | `EscrowCreate` parts, +1 h | `tesSUCCESS` | `3AEB61C46EFE7BEB25D3B1DBBC8CF3E2D952B601EC14A6283CB15621BBA5A792` |
  | 3 | `EscrowFinish` parts → acheteur | `tesSUCCESS` | `90D53FC01F71EF4641FA5A2DEEBAD3AA8E5AA95BF5F7EFA92EB93A17932C52B9` |
  | 3 | `EscrowFinish` XRP → vendeuse | `tesSUCCESS` | `A20D163BFB163FB96A3BCEE6C4C076B4CCAEDA85CD543E96BC94F35B49DBFFBB` |
  | 4 | `LoanPay` 25,513701 XRP | `tesSUCCESS` | `A87152EB27C1414B1B6297DF9014AB59DF9A9FF67DE7671A270E39BBD166687E` |
  | 4 | `VaultWithdraw` par le **porteur secondaire** | `tesSUCCESS` | `BF65DBA62F81111814BC43D4964762BD651019B9CB5A9F51CF919033D789CE5E` |

**Le mismatch de duration est reproductible à volonté.** Un `LoanSet` portant sur
100 % de `AssetsAvailable` est accepté sans avertissement. Le vault affiche alors
100 % d'utilisation, le champ `AssetsAvailable` disparaît du nœud (cf. [14:05]),
et le déposant est enfermé — alors que rien, ni à la création du vault ni à
l'origination du prêt, ne l'a prévenu qu'un seul prêt pouvait absorber la
totalité de la liquidité. Un `LiquidityBufferMinimum` sur le `LoanBroker`, ou un
simple avertissement, changerait tout pour un déposant.

**Le `Fulfillment` est bien relu depuis le ledger**, pas réutilisé depuis une
variable locale : la transaction `90D53FC0…` expose le secret en clair, et la
vendeuse s'en sert pour dénouer `A20D163B…`. C'est ce qui rend l'échange atomique
démontrable plutôt que simplement affirmé.

**Valeur de la part** : 1,000000000 avant remboursement, **1,000214800** après.
Le rendement est porté par la part, donc transféré avec elle.
