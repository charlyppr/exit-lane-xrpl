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

### [14:02] Le montant dû par `LoanPay` n'est exposé par aucun champ : il faut additionner `PeriodicPayment` et `LoanServiceFee`, et le déduire par dichotomie

<!-- TITRE CORRIGÉ le 12/09 à 15h54. L'ancien disait : « LoanPay refuse un
     paiement PLUS GRAND que le PeriodicPayment annoncé par le ledger ».
     C'était faux et contredisait H3, qui prouve qu'un vrai surpaiement
     (3× l'échéance) est correctement imputé. `ceil(PeriodicPayment)` n'est pas
     « plus que le dû » : c'est plus que l'UN DES DEUX COMPOSANTS du dû.
     Le fond de l'item est intact ; seule l'affirmation de départ était fausse.
     À ne PAS reformuler à l'ancienne en rédigeant FEEDBACK.md : un relecteur
     Ripple teste ça en trois minutes, et un item faux décrédibilise les cinq
     autres. -->
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
  `tesSUCCESS`. `PeriodicPayment` est le seul champ du nœud `Loan` qui ressemble
  à « le montant de l'échéance » ; payer son arrondi supérieur paraissait donc
  couvrir le dû. C'est ce raccourci qui est faux, pas le protocole : le dû réel
  comporte un second terme, et rien ne le dit.

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

---

### [15:21] 🔴 H1 CONFIRMÉE — le « first-loss capital » absorbe 0,5 % de la première perte, avec 99,5 % de couverture intacte
Phase : build
Catégorie : **UX (nommage) + protocole (design)**
Sévérité : **haute**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1 · script `scripts/h1-default.mjs`

Tenté :
  Répondre à la question que le brief pose lui-même — *« Did first-loss-capital
  parameters behave as their names suggested? »* — par la mesure, sur un décor
  isolé : un vault de 200 XRP, un seul prêt de 50 XRP, un first-loss capital de
  50 XRP, `CoverRateMinimum` 10 %, `CoverRateLiquidation` 5 %. Puis provoquer
  un défaut réel et relever qui paie.

Attendu :
  Un capital nommé « first-loss » absorbe la première perte tant qu'il en a les
  moyens. Ici il en avait largement les moyens : 50 XRP de couverture pour
  50 XRP de défaut.

Obtenu :
  | Grandeur | Valeur |
  |---|---|
  | Défaut | 50,000000 XRP |
  | **First-loss capital ponctionné** | **0,250000 XRP** |
  | **Perte encaissée par les déposants** | **49,750000 XRP** |
  | First-loss capital resté disponible | 49,750000 XRP |
  | Vault `AssetsTotal` | 200,000000 → 150,250000 XRP |
  | **Valeur d'une part** | **1,000000000 → 0,751250000 (−25 %)** |

  `tfLoanDefault` `tesSUCCESS` — hash
  `91F458E3E6244E1C3005345C5C83CDFAF0E8A1AF6E5587E100C302CA56743BC7`
  VaultID `0E1525BB1BB7914167D3D3AA7F3A642C8A66603E4BCCF392CFCB6CA6A9E663E0`
  LoanBrokerID `4787A5674C5322576FECC15F9C39A592DBA3EFD2271E7E96AF3D028F085B8CF4`
  LoanID `9ECF8C3D1DC0E708B2F8D219A2DCE80D8A0D063DAA237A0CD26734A7013CB958`

  **Conforme à la formule documentée**, et c'est bien le problème :
  `min(DebtTotal × CoverRateMinimum × CoverRateLiquidation, défaut)`
  `= min(50 × 10 % × 5 %, 50) = 0,25 XRP`.
  Le comportement n'est pas un bug. C'est le nom qui ment : le capital de
  « première perte » a couvert **0,50 %** de la première perte, alors que
  **49,75 XRP restaient disponibles pour l'absorber** — de quoi couvrir 99,5 %
  du défaut.

  Deux griefs distincts, à séparer dans le rapport :
  - **Nommage.** `CoverRateLiquidation: 5 %` se lit « 5 % du défaut est
    couvert ». C'est en réalité 5 % du *minimum requis*, soit un produit de deux
    taux. Erreur de deux ordres de grandeur, et irrattrapable une fois le prêt
    originé : les paramètres du broker sont fixés à la création.
  - **Design.** Un déposant perd 25 % de la valeur de sa part pendant que le
    coussin censé le protéger reste plein à 99,5 %. Si l'intention est de
    préserver la couverture des prêts restants, elle n'est documentée nulle part.

Repro :
  1. `node scripts/h1-default.mjs` (décor isolé, ~3 min avec les attentes).
  2. Relever `CoverAvailable` et `AssetsTotal` avant/après `tfLoanDefault`.

Proposition :
  1. Renommer `CoverRateLiquidation` en `CoverLiquidationFractionOfMinimum`,
     ou changer la sémantique pour une fraction du montant en défaut.
  2. Exposer sur le nœud `LoanBroker` un champ dérivé « couverture effective
     par unité de dette », pour que le broker voie ce qu'il protège réellement.
  3. Fournir une simulation à sec : « avec ces paramètres, un défaut de X
     laisse Y aux déposants ». Nous avons dû le découvrir en provoquant un vrai
     défaut sur un vrai vault.

---

### [15:21] H3 INFIRMÉE — le surpaiement fonctionne, et le flag `tfLoanOverpayment` ne change rien
Phase : build
Catégorie : information + UX (terminologie)
Sévérité : basse — **hypothèse à retirer du rapport comme grief**
Lib : xrpl@4.6.0 · script `scripts/h1-h3.mjs`

Tenté :
  Vérifier la crainte de H3 : un `LoanPay` surpayé renvoie-t-il `tesSUCCESS`
  en n'imputant qu'une seule échéance ? Deux prêts de 50 XRP, échéance exacte
  13,006851 XRP, paiement de **3 × l'échéance** dans les deux cas.

Obtenu :
  | Cas | Code | PrincipalOutstanding | Échéances |
  |---|---|---|---|
  | Sans aucun flag | `tesSUCCESS` | 50,000000 → 12,504110 XRP | 4 → 1 |
  | `lsfLoanOverpayment` + `tfLoanOverpayment` | `tesSUCCESS` | 50,000000 → 12,504108 XRP | 4 → 1 |

  hashes `BA0833A1A42C842A2E86D2E5DF21FABD3BE4EFF651411BA5E0FD99B4C5215DC5`
  et `CCA2D63EF778D220D79EF34731E4619B9EED565E9DAF631C2C5BFFDB46346B44`.

  **Aucun succès silencieux partiel.** Le protocole impute la totalité de ce qui
  est payé, trois échéances d'un coup, sans avoir besoin du moindre flag. À
  2 drops près, les deux chemins donnent le même résultat. C'est une bonne
  nouvelle et elle a sa place dans la section « ce qui marche ».

  Reste une question de terminologie : si payer trois échéances d'avance ne
  requiert pas `tfLoanOverpayment`, à quoi sert ce flag ? Vraisemblablement au
  remboursement anticipé au-delà de l'échéancier complet — mais le nom
  « overpayment » couvre les deux lectures, et la doc ne tranche pas.

---

### [15:21] `GracePeriod` : `temINVALID` ne dit pas quel champ est hors bornes  ⚠️ **titre corrigé à [16:44] — le minimum de 60 s EST documenté**
Phase : build
Catégorie : documentation/tutorials + error messages
Sévérité : moyenne
Lib : xrpl@4.6.0

Tenté :
  Originer un prêt avec un `GracePeriod` court, pour pouvoir observer un défaut
  dans le temps d'un hackathon plutôt qu'en 24 h.

Obtenu :
  Seuil trouvé par dichotomie, **exactement 60 s** :
  1, 10, 15, 20, 30, 45, 50, 55, **59 → `temINVALID`** · **60 → accepté**.

  `temINVALID: The transaction is ill-formed.` ne nomme ni le champ fautif ni
  la borne attendue. Avec dix champs numériques sur `LoanSet`
  (`InterestRate`, `PaymentInterval`, `PaymentTotal`, `GracePeriod`, quatre
  frais…), trouver lequel est en cause se fait à l'aveugle. Sept soumissions
  pour isoler la borne.

  Contrôle : `PaymentInterval` accepte 60 s sans difficulté, donc la contrainte
  est propre à `GracePeriod`.

  Astuce de méthode, réutilisable : soumettre avec un `LoanBrokerID` inexistant
  discrimine gratuitement les deux couches de validation — `temINVALID` signale
  un rejet **local** (le champ est mal formé), `tecNO_ENTRY` signale que la
  transaction a passé la validation locale et a atteint le ledger. Aucune
  transaction coûteuse n'est consommée pour sonder une borne.

⚠️ **CORRECTION [16:44]** — le minimum de 60 s **est documenté**, dans les
error cases de `LoanSet` : « *One or more of the numeric fields are outside
their valid ranges. For example, the `GracePeriod` can't be longer than the
`PaymentInterval` or less than `60` seconds.* » Nous l'avions cherché sur la
page de référence des champs, pas dans le tableau d'erreurs. Le grief
« non documenté » tombe ; **le grief sur l'erreur reste entier** : la doc ne
sert à rien si `temINVALID` ne nomme pas le champ, puisqu'il faut déjà
soupçonner `GracePeriod` pour aller lire la ligne qui en parle. Sept
soumissions pour isoler une borne qui était écrite.

Proposition :
  Faire dire à l'erreur quel champ est hors bornes. `temMALFORMED` avec le nom
  du champ vaudrait dix fois `temINVALID` seul. Et remonter la contrainte de
  bornes dans le tableau des champs de `LoanSet`, pas seulement dans le
  tableau des erreurs : c'est là qu'on la cherche.

---

### [15:21] `LoanManage tfLoanImpair` renvoie `tecTOO_SOON` sans dire à partir de quand
Phase : build
Catégorie : error messages + documentation/tutorials
Sévérité : moyenne
Lib : xrpl@4.6.0

Tenté :
  Impairer un prêt — la doc présente l'impairment comme l'outil du broker qui
  *« discovers a borrower can't make an upcoming payment »*, donc par nature
  **avant** l'échéance.

Obtenu :
  `tecTOO_SOON`, deux fois :
  - sur un prêt fraîchement originé, `PaymentInterval` 86 400 s
    (`DA59E5F107A6C2E05C219DD6C6487C927B088CF36A9278869A22F86DCAD5B235`) ;
  - sur un prêt à `PaymentInterval` 60 s, **après** que la première échéance
    soit due (`217B90A239F9A533BE7FDC9505B8DE200BCCAB69347AF54F8616A3006572B367`).

  Le `tfLoanDefault` sur ce même prêt, lui, est passé après la grace period
  (`91F458E3…`). L'impairment n'a donc jamais pu être exercé, et la fenêtre
  temporelle qui l'autorise n'est décrite nulle part : ni sur la page
  `LoanManage`, ni sur celle du ledger entry `Loan`.

  Conséquence pratique : le seul mécanisme de gestion du risque que la doc met
  en avant pour un broker est resté inutilisable pendant tout le hackathon.

Proposition :
  Documenter la condition exacte sur `LoanManage`, et faire dire à
  `tecTOO_SOON` à partir de quel instant l'opération devient possible.

---

### [15:21] Le faucet ignore le champ `destination` et crée un compte neuf à la place
Phase : onboarding (rencontré en cours de build)
Catégorie : other (infrastructure) + documentation/tutorials
Sévérité : basse à moyenne
Lib : —

Tenté :
  Refinancer un compte **existant** après plusieurs heures de tests — le compte
  prêteur était descendu à 50 XRP, chaque scénario immobilisant du capital dans
  un vault. POST au faucet avec `{"destination":"r9ywWKm1…"}`.

Obtenu :
  HTTP 200, et la création d'un **nouveau** compte
  (`rp1YXHCRPxB3aupoHaFHkwyTDgsrLgWUMA`, 1000 XRP). Le champ `destination` est
  ignoré silencieusement. Aucune erreur, aucun avertissement.

  Le besoin est pourtant le plus courant après quelques heures : les comptes de
  travail portent l'état (parts de vault, objets MPT, historique), les recréer
  fait tout perdre. Un `tecINSUFFICIENT_FUNDS` sur `VaultDeposit` a d'abord
  fait croire à un bug de notre script.

Contournement trouvé :
  `Payment` depuis un compte encore fourni de l'équipe
  (`CC0E8CB487486A60D52C6D128D97BFCB2E16E841628DE818B6E428FCB4CFFA29`). Trivial
  une fois le diagnostic posé.

Proposition :
  Accepter `destination` et créditer le compte existant — c'est le comportement
  des faucets Testnet/Devnet publics. À défaut, renvoyer une erreur explicite
  plutôt qu'un compte neuf que l'appelant n'a pas demandé.

---

### [15:38] ✅ H6 CONFIRMÉE — `InterestRate` est bien en 1/10 pdb, mais ni la base annuelle ni la formule d'amortissement ne sont documentées
Phase : build / observabilité
Catégorie : **documentation/tutorials** + developer experience
Sévérité : **moyenne — n'empêche rien, mais rend tout échéancier client invérifiable**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Tenté :
  Vérifier qu'un `LoanSet` avec `InterestRate: 8000` produit bien 8 % annuel,
  et comprendre comment `PeriodicPayment` est calculé — sans soumettre une seule
  transaction, uniquement par confrontation arithmétique sur un `Loan` déjà
  au ledger.

Entrées (nœud `Loan`, compte emprunteur) :
    PrincipalOutstanding      100000000        (100 XRP)
    InterestRate              8000
    PaymentInterval           86400            (1 jour)
    PaymentRemaining          4
    PeriodicPayment           25013700.13119221382
    TotalValueOutstanding     100054801
    ManagementFeeOutstanding  1096

Obtenu — trois conventions identifiées, toutes par déduction :

  1. `InterestRate` est bien en **1/10 de point de base** : 8000 = 8 % annuel.
     H6 confirmée.

  2. La base annuelle est **ACT/365**, pas 360 ni 365,25 :
        r_période = (InterestRate / 100000) × (PaymentInterval / 86400) / 365
                  = 2,19178082e-4

  3. `PeriodicPayment` est une **annuité constante** (amortissement français),
     pas un amortissement linéaire :
        PMT = P × r / (1 − (1+r)^−n)
            = 100 × 2,19178082e-4 / (1 − 1,000219178^−4)
            = 25,01370013118  XRP
        observé : 25,01370013119  →  écart 8,6e-12 XRP

     Contre-épreuve sur les autres bases : ACT/360 s'écarte de 1,9e-4 XRP,
     ACT/365,25 de 9,4e-6. Un amortissement linéaire donnerait un total de
     100,054794521 contre 100,054801 observé (écart 6,5e-6). Seul
     ACT/365 + annuité constante colle à la précision du flottant.

     Vérification croisée indépendante : le solde après un paiement prédit par
     cette formule est 75,008218 XRP — exactement la valeur observée en [14:02]
     (`PrincipalOutstanding` 100,000000 → 75,008218).

Le problème :
  Ces trois conventions sont **invisibles**. Ni la doc XLS-66, ni la référence
  du champ `InterestRate`, ni celle de `PeriodicPayment` n'indiquent la base
  annuelle retenue, ni la formule d'amortissement, ni le fait que
  `PeriodicPayment` **exclut** `LoanServiceFee` et `ManagementFee` (cf. [14:02] :
  c'est précisément ce qui rend le montant réellement dû indevinable).

  Conséquence concrète : toute application qui veut afficher un échéancier,
  un TAEG, ou simplement « combien me reste-t-il à payer » doit reconstituer
  ces règles par rétro-ingénierie numérique — ce que nous venons de faire.
  Deux clients qui devinent des bases différentes (360 vs 365, choix par défaut
  courant en finance) afficheront des montants différents pour le même prêt.

Repro :
  1. Originer un prêt avec `InterestRate: 8000`, `PaymentInterval: 86400`,
     `PaymentTotal: 4`, `PrincipalRequested: 100000000`.
  2. Lire `PeriodicPayment` sur le nœud `Loan`.
  3. Comparer à `P·r/(1−(1+r)^−n)` pour r = 0,08/365, 0,08/360 et 0,08/365,25.
     Seul 365 correspond.

Tx / code : aucune — vérification purement arithmétique sur l'état existant.

Proposition :
  1. Documenter explicitement la convention de décompte des jours (ACT/365)
     sur la page de référence de `InterestRate`. C'est une décision de produit
     financier, pas un détail d'implémentation : elle change les montants.
  2. Documenter la formule de `PeriodicPayment` (annuité constante) et dire
     noir sur blanc ce qu'elle n'inclut pas — `LoanServiceFee`,
     `ManagementFee` — pour couper court à la dichotomie décrite en [14:02].
  3. Fournir un exemple chiffré de bout en bout dans la doc XLS-66 : un prêt
     de 100 unités, 8 %, 4 échéances, avec l'échéancier complet. Un seul
     tableau supprime toute cette rétro-ingénierie.

À verser au rapport : oui, section Observabilité. C'est l'item le moins cher
du lot — zéro transaction — et il est vérifiable par le lecteur en trois lignes
de calcul.

---

### [15:46] 🔴 Le devnet cesse de répondre en gardant ses ports TCP ouverts — le client pend au lieu d'échouer
Phase : build
Catégorie : **infrastructure** + error messages
Sévérité : **haute — arrêt total du travail, en plein créneau de hack**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Tenté :
  Un simple `Payment` entre deux de nos comptes, samedi 15h44. Le même code
  tournait sans problème 12 minutes plus tôt (`check-connection.mjs` à 15h32,
  ledger 66540, `tesSUCCESS`).

Obtenu :
  `NotConnectedError: connect() timed out after 5000 ms` — puis 4 tentatives
  consécutives à `connectionTimeout: 20000` toutes en échec.

Diagnostic différentiel (c'est le point intéressant) :
    nc -z lending-hackathon.dev.ripplex.io 51233   → succeeded
    nc -z lending-hackathon.dev.ripplex.io 51234   → succeeded
    curl POST :51234 server_info                   → HTTP 000 après 15,0 s
    curl https://lending-hackathon-faucet…/accounts → HTTP 404 en 0,31 s
    curl https://xrpl.org (témoin)                 → HTTP 200 en 0,36 s

  Donc : **le handshake TCP réussit sur les deux ports**, le DNS résout, la
  connectivité sortante est intacte, le faucet (443) répond en 313 ms. Seul le
  `rippled` lui-même n'émet plus rien au niveau applicatif.

  C'est un mode de défaillance nettement plus coûteux qu'une panne franche :
  le port ouvert fait croire au développeur que le réseau va bien, et le
  message d'erreur du SDK l'envoie explicitement sur la mauvaise piste —
  « the rippled server may be blocked or inaccessible. » Nous avions déjà
  perdu 45 min sur un vrai blocage de ports en [12:26] ; le réflexe est donc
  de re-soupçonner le wifi, et de repartir sur un partage de connexion 4G qui
  n'aurait rien changé. Il a fallu un test TCP explicite pour trancher.

Repro :
  1. `nc -z <host> 51233` → succeeded.
  2. `curl -m 15 -X POST https://<host>:51234 -d '{"method":"server_info"…}'`
     → aucune réponse.
  3. Conclure que la couche transport est saine et que le nœud est en cause.

Tx / code : aucune — rien ne part.

Proposition :
  1. **Un endpoint de santé sur 443** (`GET /health` renvoyant l'index du
     dernier ledger validé). Aujourd'hui il n'existe aucun moyen de distinguer
     « devnet en panne » de « mon réseau filtre » sans sortir `nc` et `curl`.
     Sur un hackathon où un seul nœud sert toutes les équipes, c'est la
     première chose à donner aux participants.
  2. Le message d'erreur de `connect()` de xrpl.js ne devrait pas affirmer une
     cause. « blocked or inaccessible » est un diagnostic, pas une observation :
     le SDK sait seulement qu'aucune réponse n'est arrivée. Distinguer
     « connexion TCP refusée » de « TCP établi, pas de réponse WebSocket »
     est trivial côté client et oriente immédiatement vers la bonne cause.
  3. `connectionTimeout` par défaut à 5 s est court pour un devnet mutualisé :
     une valeur trop basse transforme une lenteur passagère en panne apparente.

Durée et nature exacte de l'incident (mesuré) :
  Le nœud est redevenu interrogeable **~3 minutes** plus tard. Surtout, le
  ledger validé était passé de **66540 à 67041** pendant l'indisponibilité,
  soit ~500 ledgers : le nœud **continuait donc de valider normalement** et
  n'avait cessé que de répondre aux requêtes entrantes. Ce n'était ni un crash
  ni un redémarrage, mais une saturation de la couche API — ce qui explique
  le port TCP resté ouvert, et ce qui rend un `/health` en 443 d'autant plus
  utile : l'information « le ledger avance » existait, elle était juste
  inatteignable par le canal saturé.

Effet sur nous : ~10 min de travail on-chain perdues, basculées sur les
modifications hors-ligne. Sans le test TCP, nous serions repartis sur un
partage de connexion 4G qui n'aurait rien changé.


---

### [15:52] Un vault open-ended intégralement prêté immobilise le capital de façon DÉFINITIVE — les comptes de test ne se recyclent pas
Phase : build / opérations
Catégorie : **developer experience** + documentation/tutorials
Sévérité : **moyenne — invisible jusqu'au moment où elle arrête le travail**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Observé :
  En préparant les répétitions du pitch, nous avons constaté que notre compte
  déposant n'avait plus de quoi jouer la démo :

    lender    balance 50,34 XRP · OwnerCount 12 · réservé 34 · **libre 16,34**

  alors que le scénario exige un `VaultDeposit` de 100 XRP. Le scénario était
  cassé sans qu'aucune ligne de code n'ait changé.

La mécanique, qui n'est écrite nulle part :
  1. Le scénario prête 100 % de `AssetsAvailable`, donc le vault tombe à zéro
     de liquidité. C'est le cœur de notre démonstration, et c'est voulu.
  2. La vendeuse cède 30 % de ses parts. **Les 70 % restants ne sont plus
     récupérables** : `VaultWithdraw` est plafonné à `AssetsAvailable`, qui vaut
     zéro, et le prêt court jusqu'à son terme. Le capital n'est pas perdu au
     sens comptable — il est simplement inatteignable pendant toute la durée
     du prêt, et sur un devnet on ne revient jamais le chercher.
  3. Chaque exécution crée un vault neuf, donc une nouvelle émission de parts,
     donc **un objet `MPToken` de plus au porteur** : +2 XRP de réserve de
     compte, définitivement, à chaque run.

  Coût réel mesuré : ~70 XRP irrécupérables + 2 XRP de réserve **par
  répétition**. Six répétitions vidaient le compte. Nous en avions prévu au
  moins six entre les tests et les répétitions du pitch.

Ce qui rend le problème coûteux :
  - Aucun signal. Rien dans le ledger ne dit « ce compte ne pourra plus jouer
    ce scénario » ; on le découvre quand `VaultDeposit` échoue.
  - **Le faucet ne sait pas recharger un compte existant** : il ignore le champ
    `destination` et crée un compte neuf à la place (cf. [15:21]). Le réflexe
    naturel — « je repasse au faucet » — ne fonctionne pas, et il faut
    comprendre qu'il faut un `Payment` depuis un autre compte à soi.
  - La combinaison des deux fait qu'un développeur qui itère sur un scénario
    de vault épuise silencieusement ses comptes, puis ne trouve pas le moyen
    évident de les réapprovisionner.

Contournement :
  1. `Payment` depuis un compte de test resté approvisionné.
  2. Surtout : **calibrer les montants du scénario pour la rejouabilité**, pas
     pour le réalisme. Nous sommes passés de 100 à 25 XRP de dépôt et de 20 à
     5 XRP de first-loss capital. La démonstration est rigoureusement identique
     — les proportions sont conservées, `AssetsAvailable` tombe à zéro pareil —
     et la consommation est divisée par quatre.

Proposition :
  1. Documenter, sur la page du Single Asset Vault, que dans un vault
     open-ended intégralement prêté les parts deviennent illiquides jusqu'au
     remboursement. C'est le comportement attendu, mais c'est exactement la
     propriété que tout le monde découvre en production plutôt qu'en lisant.
     (C'est aussi le problème que notre projet cherche à résoudre — nous
     l'avons rencontré comme obstacle avant de le reconnaître comme sujet.)
  2. Faire en sorte que le faucet honore `destination` et recharge un compte
     existant. Sur un événement où chaque équipe itère des dizaines de fois sur
     les mêmes comptes, c'est la fonction la plus utile qu'il puisse rendre.
  3. Dans les tutoriels de vault, prévenir que chaque vault créé coûte une
     réserve d'objet au déposant via l'émission de parts. Le coût est modeste
     à l'unité et surprenant au vingtième.

---

### [16:04] ✅ `LoanPay` accepte un paiement ANTICIPÉ, mais rien ne le dit — et rien ne distingue « en avance » de « à l'heure »
Phase : build
Catégorie : **documentation/tutorials**
Sévérité : **basse — comportement favorable, mais non spécifié**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Contexte :
  Passage du prêt de démonstration de 4 échéances **quotidiennes** à 4 échéances
  **mensuelles** (`PaymentInterval` 86400 → 2592000), pour que l'immobilisation
  du capital dure ~4 mois et que la décote de cession soit défendable.

Risque anticipé :
  Avec un intervalle de 30 jours, `NextPaymentDueDate` tombe un mois plus tard.
  Notre scénario appelle `LoanPay` immédiatement après l'origination — donc
  très en avance. Rien dans la doc XLS-66 ne dit si le protocole l'accepte,
  le refuse, ou l'impute différemment.

Obtenu :
  `tesSUCCESS` — hash `41B2EAAED6C2E2C4616108A33366CA1D5209CBCD8B65962C52FAE85C0E8EDC8C`
  Le paiement est imputé normalement : `AssetsTotal` 25,000000 → 25,161097 XRP,
  valeur de la part 1,000000000 → **1,006443880**.

  Le paiement anticipé fonctionne donc, et c'est la bonne décision de conception.
  Mais elle est **invisible avant l'essai** : aucune page ne dit qu'un
  emprunteur peut payer en avance, ce qui est pourtant une des toutes premières
  questions de n'importe quel produit de crédit.

  Deuxième manque, plus gênant : **aucun champ ne permet de savoir si un
  paiement a été fait en avance, à l'heure, ou en retard.** Le nœud `Loan`
  expose `NextPaymentDueDate` et `PaymentRemaining`, tous deux mis à jour après
  coup. L'historique de ponctualité — la donnée qui fonde tout scoring de
  crédit — n'est reconstituable qu'en rejouant les métadonnées de chaque
  `LoanPay` depuis l'origination.

Repro :
  1. `LoanSet` avec `PaymentInterval: 2592000`.
  2. `LoanPay` de `ceil(PeriodicPayment) + LoanServiceFee` immédiatement.
  3. `tesSUCCESS`. Aucun champ ne conserve la trace de l'anticipation.

Tx / code : `tesSUCCESS`, hash ci-dessus.

Proposition :
  1. Écrire explicitement dans la référence de `LoanPay` que le paiement
     anticipé est accepté, et préciser son effet sur `NextPaymentDueDate`
     (l'échéance suivante glisse-t-elle, ou reste-t-elle au calendrier ?).
     Nous n'avons pas tranché ce second point faute de temps.
  2. Exposer un compteur de retards sur le nœud `Loan`
     (`LatePaymentCount`, ou un horodatage du dernier paiement). Sans lui,
     aucun prêteur ne peut évaluer un emprunteur sans réindexer toute
     l'histoire du prêt.

Effet de bord favorable pour la démo : avec des échéances mensuelles, un seul
remboursement fait passer la part de 1,000000000 à 1,006443880, contre
1,000214800 en quotidien. Le rendement devient **lisible à l'écran** pendant le
pitch, là où il fallait auparavant pointer la sixième décimale.

---

### [16:18] ⚠️ `AssetsMaximum = 0` ne gèle pas les dépôts, il SUPPRIME le plafond — et le champ disparaît du nœud
Phase : build
Catégorie : **UX** + documentation/tutorials
Sévérité : **haute — le geste naturel produit l'effet exactement inverse de l'intention**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Tenté :
  Fermer un vault open-ended aux nouveaux dépôts. `VaultSet` n'expose que
  `Data`, `AssetsMaximum` et `DomainID` ; le geste évident est donc
  `AssetsMaximum: 0` — « plus rien ne rentre ».

Attendu :
  Plafond à zéro → tout nouveau dépôt refusé.

Obtenu :
  `tesSUCCESS`, puis **le plafond est désactivé** : un dépôt qui dépasse
  l'ancien plafond passe. Vérifié sur un vault plafonné à 5 XRP :

    AssetsTotal 3 XRP · AssetsMaximum 5 XRP
    VaultSet AssetsMaximum = 0        → tesSUCCESS
    lecture du nœud                   → AssetsMaximum **ABSENT** (pas 0)
    VaultDeposit 4 XRP (total 7 > 5)  → tesSUCCESS

  Le vault est passé de « plafonné à 5 » à « illimité » par la transaction
  censée le fermer. Aucun avertissement, aucune trace : le champ ne vaut pas 0,
  il n'existe plus dans le nœud — même piège de lecture que `AssetsAvailable`
  ([14:05]). Un client qui lit `AssetsMaximum` obtient `undefined` et ne peut
  pas distinguer « pas de plafond » de « champ non renvoyé ».

Le bon geste, trouvé par essais :
    VaultSet AssetsMaximum = AssetsTotal   → tesSUCCESS
    VaultDeposit 1 XRP                     → tecLIMIT_EXCEEDED

  Geler un vault s'écrit donc « plafonner à ce qu'il contient déjà », ce qui
  n'est écrit nulle part et ne vient pas à l'esprit.

Effet de cliquet, non documenté :
  Après un passage à 0, on ne peut plus reposer un plafond inférieur à
  l'encours (`VaultSet max=5` sur un total de 7 → `tecLIMIT_EXCEEDED`).
  Le seul plafond réadmissible est ≥ `AssetsTotal`. Un `0` posé par erreur
  est donc **irréversible tant que les déposants ne sont pas sortis**.

Repro :
  1. `VaultCreate` `AssetsMaximum` = 5 000 000 drops.
  2. `VaultDeposit` 3 XRP.
  3. `VaultSet` `AssetsMaximum` = `"0"` → `tesSUCCESS`.
  4. `VaultDeposit` 4 XRP → `tesSUCCESS`, `AssetsTotal` = 7 XRP > 5.

Tx / code :
  VaultSet max=0     `BC83AEB1A369CB773B8566BBBCC6D7FA62E8A3720C0AA9B6AC9872064F512612`
  Dépôt au-delà      `tesSUCCESS` (série du 16:16, vault de contrôle)
  Gel par max=total  `tesSUCCESS` puis dépôt `tecLIMIT_EXCEEDED`

Proposition :
  1. Documenter noir sur blanc, sur la référence `VaultSet`, que
     `AssetsMaximum = 0` **désactive** le plafond. C'est une convention
     défendable, mais c'est l'inverse de ce que lit un opérateur pressé.
  2. Documenter le geste de gel (`AssetsMaximum = AssetsTotal`), ou mieux :
     exposer un flag `tfVaultFreezeDeposits`, qui est la primitive réellement
     demandée — fermer aux dépôts sans toucher aux retraits.
  3. Renvoyer `AssetsMaximum: "0"` explicitement plutôt que d'omettre le champ.
     Trois champs du vault disparaissent déjà à zéro ; chacun est un `NaN` en
     puissance dans un client naïf.

---

### [16:18] `VaultClawback` est inutilisable sur un vault en XRP, et rien ne le dit
Phase : build
Catégorie : **documentation/tutorials** + client libraries
Sévérité : moyenne

Tenté :
  Exercer `VaultClawback` — jamais soumis par personne dans notre équipe — sur
  un vault open-ended en XRP, depuis le compte **propriétaire du vault**,
  contre un déposant tiers.

Obtenu :
  - Sans `Amount` (clawback total) → `tecNO_PERMISSION`
    `E110F2CA3B076B2B36F7089DFD9D3C352C3DB340FA50831776CA0014A2C3534F`
  - Avec `Amount` partiel en drops, en contournant le validateur du SDK
    → **`temMALFORMED`** côté ledger.

  Les deux refus sont cohérents entre eux : le droit de clawback appartient à
  l'**émetteur de l'actif**, et XRP n'a pas d'émetteur — donc aucun compte ne
  peut jamais l'exercer sur un vault en XRP. Mais :

  1. `tecNO_PERMISSION` laisse croire à un problème d'autorisation
     réparable (« ce n'est pas le bon signataire »), alors que l'opération est
     **structurellement impossible** sur ce vault. On perd du temps à chercher
     qui a le droit avant de comprendre que personne ne l'a.
  2. Le type `ClawbackAmount` du SDK ne permet pas d'exprimer un montant en
     XRP (`isClawbackAmount("1000000")` = `false`), donc un clawback partiel
     sur un vault XRP est irreprésentable côté client **avant** même d'être
     refusé côté ledger. Même famille que H14.

Repro :
  1. `VaultCreate` en `{ currency: "XRP" }`, un déposant tiers.
  2. `VaultClawback` `{ VaultID, Holder: <déposant> }` depuis l'owner
     → `tecNO_PERMISSION`.
  3. Ajouter `Amount: "1000000"` → le SDK refuse en local
     (« invalid field Amount ») ; en contournant, le ledger répond
     `temMALFORMED`.

Proposition :
  1. Dire explicitement, sur la page `VaultClawback`, que la transaction ne
     s'applique qu'aux vaults dont l'actif a un émetteur (IOU, MPT) et jamais
     à un vault en XRP.
  2. Distinguer les codes : un `tecNO_ISSUER` (ou un message de rejet dédié)
     vaudrait mieux que `tecNO_PERMISSION` pour une opération que la nature de
     l'actif interdit.

---

### [16:18] ✅ Les refus de `VaultDelete` sont nets — et la suppression nettoie les parts chez les tiers
Phase : build
Catégorie : other (comportement correct, à garder tel quel)
Sévérité : basse

Trois refus, tous parlants du premier coup, sur des types jamais soumis :

  `VaultDelete` sur vault non vide     → **`tecHAS_OBLIGATIONS`**
      `8D6A6599351309819969296F9E06AFC8B5363BF98EF4A56E0A0CFF7FE645C097`
  `VaultDelete` par un non-propriétaire → `tecNO_PERMISSION`
      `BE784FA17B7B656BAF6A939CDFB12A758AE5D2002DC57893D5E2F4F2588E8CD0`
  `VaultSet` par un non-propriétaire    → `tecNO_PERMISSION`
      `679E29241C81A67197284B20ED27053CC0E07F1C88A18B25317D629D45CC18E4`

`tecHAS_OBLIGATIONS` est exactement le bon code : il nomme la cause sans
qu'on ait à lire le nœud. À signaler comme contre-exemple utile — c'est la
clarté qui manque à `tecLIMIT_EXCEEDED` (entrée suivante).

Bonne surprise vérifiée, qui n'est écrite nulle part :
  Sur un vault vidé mais dont **deux comptes tiers détenaient encore un objet
  `MPToken` de parts à solde nul**, `VaultDelete` réussit et **supprime aussi
  ces objets chez les tiers**, en leur rendant leur réserve.
      `6EDE2FDD3EC0855D2AE58252DC6F63566A316C2C07E72E3DAB50FDAD4028679F`
  Contrôle après coup : `OwnerCount` de `spare` revenu de 8 à 7, aucun
  `MPToken` orphelin, `MPTokenIssuance` et `Vault` introuvables
  (`entryNotFound`). Pas de fuite de réserve — nous nous attendions à l'inverse.
  C'est une propriété rassurante et surprenante (une transaction de l'owner
  supprime des objets dans le compte d'autrui) : elle mérite d'être documentée
  plutôt que découverte.

---

### [16:18] `tecLIMIT_EXCEEDED` recouvre deux situations opposées, et `WithdrawalPolicy` est immuable sans le dire
Phase : build
Catégorie : **UX** + documentation/tutorials
Sévérité : basse à moyenne

Deux observations sur `VaultSet`, premier passage de ce type.

1. Le même code pour deux causes contraires :
   - dépôt qui dépasserait le plafond → `tecLIMIT_EXCEEDED`
     `2121434A2BDAC38AD925C1C3526C233326F82A2789FFB0F01EA246D6922C5B42`
   - plafond qu'on veut poser **sous** l'encours → `tecLIMIT_EXCEEDED`
     `A964C7CD371F0FED745B58F0B8449B3D2F460FFACD7B6C3293C229F0D82897A4`

   Dans le premier cas c'est le déposant qui est en cause, dans le second
   l'opérateur du vault. Un client qui automatise ne peut pas distinguer
   « refuse ce dépôt » de « ton plafond est invalide » sans reconstruire le
   contexte. Réponse au passage à une question ouverte de notre côté :
   **non, on ne peut pas réduire `AssetsMaximum` sous `AssetsTotal`.**

2. `WithdrawalPolicy` n'est pas modifiable, et le refus vient du **codec**,
   pas du protocole. En glissant le champ dans un `VaultSet` (JSON brut, pour
   contourner le modèle TS qui ne le connaît pas) :

       Field 'WithdrawalPolicy' found in disallowed location.

   Message d'implémentation de `ripple-binary-codec`, émis **en local**, qui
   n'apprend pas ce qu'il faut retenir : la politique de retrait est figée à
   la création du vault. Le développeur ne sait pas s'il a mal écrit le champ
   ou si l'opération est interdite.

Proposition :
  1. Scinder `tecLIMIT_EXCEEDED`, ou au minimum lister dans la doc `VaultSet`
     les deux causes qui le produisent.
  2. Écrire dans la référence `Vault` quels champs sont immuables après
     création (`WithdrawalPolicy`, `Asset`), et le dire dans la page
     `VaultSet` plutôt que de le laisser déduire d'un message de codec.

---

### [16:25] `tfLoanImpair` est permis dès l'échéance, PAS après la période de grâce — frontière mesurée
Phase : build
Catégorie : **documentation/tutorials**
Sévérité : moyenne

Contexte :
  À 15:10 nous avions relevé que `LoanManage tfLoanImpair` répond
  `tecTOO_SOON` sans jamais dire **à partir de quand**. Un prêt à échéances
  mensuelles ne permet pas de le mesurer dans le temps d'un hackathon. Nous
  avons donc originé un prêt à `PaymentInterval: 60` / `GracePeriod: 60` et
  sondé la frontière toutes les 15 s.

Mesure :

    échéance dans 31 s (grâce dans 91 s)   → tecTOO_SOON
    échéance dans 13 s (grâce dans 73 s)   → tecTOO_SOON
    échéance DÉPASSÉE de 5 s (grâce dans 55 s) → **tesSUCCESS**
      `5486020BA8FF227C58409042F96BDC07246FDACC3F9B0EF24749555E319E972E`

Conclusion :
  La dépréciation devient possible **au passage de `NextPaymentDueDate`**, et
  la période de grâce n'y change rien : un prêt peut être déprécié alors qu'il
  est encore dans sa grâce contractuelle. C'est défendable côté prêteur, mais
  c'est le contraire de ce que « période de grâce » suggère, et aucune page ne
  le dit. Un opérateur qui attend la fin de la grâce pour déprécier laisse
  passer toute la fenêtre utile.

Effet de la dépréciation sur le vault — ⚠️ **rectifié à [16:44]** :
nous avions écrit « aucun effet », c'était **faux**, et l'erreur venait de
notre propre outil. `AssetsTotal`, `AssetsAvailable`, `CoverAvailable` et
`DebtTotal` sont effectivement inchangés, mais la perte latente est inscrite
dans un champ que notre `lib/nav.mjs` ne lisait pas : **`LossUnrealized`**.
Relevé sur un vault de 5,000002 XRP portant un prêt déprécié de 3 XRP :

    "AssetsTotal": "5000002", "AssetsAvailable": "2000001",
    "LossUnrealized": "3000001"

Le provisionnement existe donc. Le vrai grief est ailleurs, et il est pire :
**`LossUnrealized` ne se déduit pas de `AssetsTotal`**, donc la valeur de part
calculée de la façon évidente — `AssetsTotal / OutstandingShares` — vaut
1,000000 alors que la valeur économique est
`(AssetsTotal − LossUnrealized) / OutstandingShares` ≈ **0,40**. Un client qui
affiche la NAV sans connaître l'existence de `LossUnrealized` **surévalue la
part de 150 %** au moment précis où son porteur aurait besoin de savoir.
Nous sommes tombés dans le piège nous-mêmes, avec un helper écrit exprès pour
lire ce vault : c'est la démonstration en acte de l'hypothèse H9.
Voir l'entrée [16:44] pour le détail.

`tfLoanUnimpair` sur un prêt réellement déprécié : `tesSUCCESS`, `Flags`
retombe à 0, vault toujours inchangé.
  `708B185B7D36E6322A034AB4861E43EA2ECCDC6239D1861533F3E8F1AC291D61`

Proposition :
  1. Écrire dans la référence `LoanManage` la condition exacte de
     `tfLoanImpair` (`now >= NextPaymentDueDate`) et dire explicitement que
     `GracePeriod` n'entre pas dans cette condition.
  2. Faire figurer le nombre de prêts dépréciés d'un broker, ou l'encours
     déprécié, dans `vault_info`. Sans cela, la dépréciation est un signal
     que seul le broker voit — et c'est le seul acteur qui n'a pas intérêt à
     le publier.

---

### [16:25] ⚠️ `LoanManage` sans flag répond `tesSUCCESS` en ne faisant rien
Phase : build
Catégorie : **UX**
Sévérité : **moyenne — un succès qui ne fait rien est pire qu'une erreur**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Tenté :
  `LoanManage { LoanID }` sans champ `Flags`.

Obtenu :
  `tesSUCCESS` — `3B9E1C273EB9A0C4DC86729FCB6D96A7222139C3421F977AC83BB8A6D71BABDA`
  Le prêt n'a pas changé d'état. La transaction a coûté ses frais, occupé un
  numéro de séquence, et renvoyé un succès.

Pourquoi c'est coûteux :
  `LoanManage` n'existe **que** pour porter un flag. Sans flag, elle n'a
  aucune sémantique. Un code qui construit ses flags dynamiquement — et qui
  en perd un en route — reçoit `tesSUCCESS` et conclut que le prêt est
  déprécié alors qu'il ne l'est pas. La vérification « ma transaction est-elle
  passée ? » ne suffit plus, il faut relire le nœud `Loan` et comparer les
  flags. C'est le genre de faux positif qui se découvre en production.

Proposition :
  Refuser `LoanManage` sans flag reconnu (`temINVALID_FLAG`, comme pour une
  combinaison invalide). Le protocole sait déjà le faire : voir l'entrée
  suivante.

---

### [16:25] `tecNO_PERMISSION` désigne à la fois « tu n'as pas le droit » et « l'état ne le permet pas »
Phase : build
Catégorie : **UX** + documentation/tutorials
Sévérité : moyenne

Deux situations sans rapport, un seul code :

  `tfLoanUnimpair` par le **broker légitime**, sur un prêt **non déprécié**
      → `tecNO_PERMISSION`
      `13975FD33EFA2F97D3120920E6F613BAFB95D09459350E7693C207E66AA24537`

  `tfLoanImpair` par l'**emprunteur**, qui n'a effectivement aucun droit
      → `tecNO_PERMISSION`
      `F030419492FB6A9A8CD4BA3015E8A55A9A86B9A1288A6458C5CC36475DE2C112`

⚠️ **Nuance ajoutée à [16:44]** : le premier cas **est documenté**, dans les
error cases de `LoanManage` — `tecNO_PERMISSION` couvre explicitement « *the
transaction is attempting to change the loan's impairment status to the one it
already has* ». Ce n'est donc pas un code imprévu, c'est un code **surchargé
en connaissance de cause** : la doc elle-même liste deux causes sans rapport
sous la même entrée. Le grief passe de « code faux » à « code ambigu par
conception », ce qui reste un grief mais doit être formulé honnêtement.

Dans le premier cas le signataire est le bon et l'opération est simplement
sans objet (rien à annuler) ; dans le second le signataire est illégitime.
Le premier se corrige en changeant d'opération, le second en changeant de
clé — et le code ne permet pas de savoir lequel. Nous avons d'abord cru à un
problème de signataire sur le `tfLoanUnimpair`, et cherché du côté du
`LoanBroker.Owner`.

Même famille que le `tecLIMIT_EXCEEDED` surchargé de l'entrée [16:18] et que
le `tecNO_PERMISSION` de `VaultClawback`, où l'opération est en réalité
structurellement impossible. Trois occurrences du même défaut : les codes de
retour du Lending Protocol décrivent la **classe** de refus, pas la cause.

Proposition :
  Un code d'état distinct pour « transition d'état impossible »
  (`tecINVALID_STATE`, ou réutiliser `tecNO_ENTRY`) et garder
  `tecNO_PERMISSION` pour les seuls refus d'autorisation.

---

### [16:25] Le SDK laisse passer une combinaison de flags que le ledger refuse (`LoanManage`)
Phase : build
Catégorie : **client libraries**
Sévérité : basse à moyenne
Lib : xrpl@4.6.0

Tenté :
  `LoanManage` avec `tfLoanDefault | tfLoanImpair` (196608).

Obtenu :
  - `validate()` du SDK : **accepte**.
  - Ledger : **`temINVALID_FLAG`** (« The transaction has an invalid flag »),
    donc aucune trace on-chain — tx envoyée :
    `{ TransactionType: "LoanManage", LoanID: "07D9FB2C…5E64", Flags: 196608 }`.

Cause exacte, lue dans le SDK :
  `node_modules/xrpl/dist/npm/models/transactions/loanManage.js` reconstruit
  les flags à la main pour son contrôle d'exclusion mutuelle, et **n'y met que
  `tfLoanImpair` et `tfLoanUnimpair`** :

      if (txFlags.tfLoanImpair)   { flags |= LoanManageFlags.tfLoanImpair }
      if (txFlags.tfLoanUnimpair) { flags |= LoanManageFlags.tfLoanUnimpair }

  `tfLoanDefault` est absent de cette reconstruction. Le seul couple interdit
  localement est donc `impair + unimpair` ; toute combinaison contenant
  `tfLoanDefault` passe la validation locale et part sur le réseau pour se
  faire refuser. (La conversion objet → nombre, elle, est correcte : c'est
  bien le contrôle de cohérence qui est incomplet, pas l'encodage.)

Proposition :
  Faire porter le contrôle sur les trois flags, ou mieux : le dériver de
  `convertTxFlagsToNumber` au lieu de le réécrire à la main — c'est la
  duplication qui a créé l'oubli.

---

### [16:25] ✅ `tecHAS_OBLIGATIONS` en cascade : les trois suppressions refusent proprement
Phase : build
Catégorie : other (comportement correct)
Sévérité : basse

Sur un vault portant un broker portant un prêt vivant, les trois types de
suppression — dont deux jamais soumis jusqu'ici — refusent avec le même code
explicite, sans qu'on ait à deviner l'ordre de démontage :

  `LoanDelete`        → `tecHAS_OBLIGATIONS`  `EBACB9A7787326501AF6C18A360FC9BD18356FA7609854E8C463A1186DAD5E0B`
  `LoanBrokerDelete`  → `tecHAS_OBLIGATIONS`  `8024101A0F7DBDD5D68579101DF1FFD78FA8A2DE34C379DD06C975EFD7B5372B`
  `VaultDelete`       → `tecHAS_OBLIGATIONS`  `80CF578E955A35BAB856AF2D969C71B4E6C5FB380B8D64E608C4094C5F87FC29`

À garder tel quel. C'est le contre-exemple qui rend les trois entrées
précédentes recevables : le protocole SAIT produire des codes qui nomment leur
cause, donc `tecNO_PERMISSION` sur un problème d'état n'est pas une fatalité.

---

### [16:33] 🔴 Cycle de défaut joué en entier — H1 répliquée à une autre échelle, et le broker récupère 98 % de sa couverture juste après
Phase : build
Catégorie : **protocole (design)** + documentation/tutorials
Sévérité : **haute**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1 · script `scripts/_probe-default-cycle.mjs` + `_probe-pay-blocked.mjs`

Décor : vault de **5 XRP** (déposant unique), prêt de **4 XRP** (80 % du vault),
first-loss capital **1 XRP**, `CoverRateMinimum` 10 %, `CoverRateLiquidation` 5 %,
échéances de 60 s, grâce 60 s. Aucun remboursement, défaut provoqué.

Résultat du `tfLoanDefault`
(`923F7D616B094C82197506CF2867907A93067041E3990D24BD07A19035F73EAC`) :

  | Grandeur | Avant | Après |
  |---|---|---|
  | `CoverAvailable` | 1,000000 | 0,980000 |
  | **ponction du first-loss** | — | **0,020000 XRP** |
  | `DebtTotal` | 4,000000 | 0,000000 |
  | `AssetsTotal` (vault) | 5,000000 | 1,020000 |
  | **perte du déposant** | — | **3,980000 XRP** |
  | `AssetsAvailable` | 1,000000 | 1,020000 |
  | **valeur de la part** | 1,000000000 | **0,204000000 (−79,6 %)** |

**H1 est répliquée exactement, à une échelle 12,5 fois plus petite** :
`DebtTotal × CoverRateMinimum × CoverRateLiquidation` = 4 × 10 % × 5 %
= 0,020000 XRP, soit au drop près ce qui a été ponctionné. La formule tient
donc sur deux décors indépendants (50 XRP de dette le 15:21, 4 XRP ici), ce
qui écarte l'erreur de mesure.

Fait nouveau par rapport à H1, et plus parlant que la formule :
  **le broker a récupéré tout le reste de son first-loss capital immédiatement
  après le défaut**, sans délai ni condition —
  `LoanBrokerCoverWithdraw` de 980 000 drops → `tesSUCCESS`
  `68DD97D949602FD470E0FA80B2526C3FDCFA3449095F7A7879F4D4430845D45E`

  Bilan net de l'événement : le déposant perd 79,6 % de sa position, le broker
  perd 2 % de sa couverture et reprend les 98 % restants dans la minute.
  C'est la formule documentée qui produit ce résultat — pas un bug — mais le
  nom « first-loss capital » décrit l'inverse de ce qui se passe.

La ponction est reversée dans `AssetsAvailable` (1,000000 → 1,020000), donc le
déposant peut sortir : `VaultWithdraw` de ses 5 000 000 parts → `tesSUCCESS`,
pour 1,020000 XRP encaissés.
  `3338BA629F8772CDEC07B6F714F2AF3A1ADC8E93642429A54B95CF372FDB2880`
Avant le défaut, le même retrait était refusé `tecINSUFFICIENT_FUNDS`
  `D91BA47E816FDA60F9BBAD7F100B383099D87021B08DE065E841B9E8E34AFE2D`
— le défaut est donc, paradoxalement, ce qui **rend sa liquidité** au déposant.
Rien n'en avertit : le déposant ne peut ni voir venir la perte, ni savoir
qu'elle débloque sa sortie.

Seuil de `tfLoanDefault` — deux seuils différents sous un seul code :

    tfLoanDefault, prêt sain avant échéance          → tecTOO_SOON  6EC160A78664E7975E3C9B3CDC3402EBF83CD3B8BB33F92741BCF5B06FD3C11F
    tfLoanDefault, prêt déprécié, DANS la grâce      → tecTOO_SOON  1251BD0C771BE4A3D676F1CB1094747C435DD8F20E2D68D01AA6C0CA6488EEA0
    tfLoanDefault, grâce dépassée de 146 s           → tesSUCCESS   923F7D61…

  `tfLoanImpair` est permis dès l'échéance (entrée [16:25]), `tfLoanDefault`
  ne l'est pas : il faut au moins attendre la fin de la grâce. **Deux
  conditions temporelles distinctes, un seul `tecTOO_SOON` pour les deux.**

  ⚠️ **Corrigé à [16:44]** : nous avions écrit « aucune ne figure dans la
  doc ». Faux pour le défaut — les error cases de `LoanManage` disent
  « *the loan can't be marked as defaulted before its payment due date and
  grace period have passed* », et le tutoriel « Manage a Loan » dit « *after
  the grace period expires* ». Le seuil du **défaut** est donc documenté et
  notre mesure le confirme. Ce qui n'est pas documenté, c'est le seuil de
  l'**impairment** — et pour lui la doc dit l'inverse de ce que fait le
  ledger (entrée [16:25]).

  Honnêteté de mesure : au moment du succès, la fin du **terme** du prêt était
  aussi dépassée (de 26 s) ; nous n'avons donc pas isolé « fin de grâce » de
  « fin de terme ».

Ménage après défaut, tous les types jamais soumis jusqu'ici, tous nets :
    `LoanDelete`       → `tesSUCCESS`  `D081B4A128C57FFA4F6149512549936B5E46AFBE95DE01E27EC587164FBE9840`
    `LoanBrokerDelete` → `tesSUCCESS`  `604C28B3075477182F41503FBC4030A1092977E4DCE76D70EF50AB1731C1C432`
    `VaultDelete`      → `tesSUCCESS`  `E23FD79766486B2FDC038569CC1B9EBAE3FCF5E626DB5BB212B5699DEE1318BC`

Proposition :
  1. Reprendre les trois propositions de H1 ([15:21]) — elles tiennent, et
     cette réplication les appuie.
  2. Ajouter : **conditionner ou différer `LoanBrokerCoverWithdraw` après un
     défaut.** Qu'un broker puisse retirer sa couverture dans la minute qui
     suit une perte encaissée par ses déposants vide de sens l'engagement que
     cette couverture représente.
  3. Documenter les deux seuils temporels (`tfLoanImpair` vs `tfLoanDefault`)
     et rendre `tecTOO_SOON` informatif — l'horodatage à partir duquel
     l'opération devient possible est connu du ledger.

---

### [16:44] 🔴 Un paiement en retard exige le flag `tfLoanLatePayment`, sinon `tecEXPIRED` — un code absent de la doc de `LoanPay`
Phase : build
Catégorie : **documentation/tutorials** + error messages
Sévérité : **haute — sans le flag, un emprunteur solvable et volontaire ne peut PAS payer**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1 · script `scripts/_probe-pay-states.mjs`, `_probe-latepayment.mjs`

Tenté :
  Comprendre pourquoi `LoanPay` répondait `tecEXPIRED` sur un prêt en retard.
  Quatre états du **même** prêt (échéances de 90 s, grâce 60 s), montant exact
  recalculé à chaque fois depuis le nœud :

  | État du prêt | Montant | Code | Hash |
  |---|---|---|---|
  | en avance, sain | échéance + `LoanServiceFee` | **`tesSUCCESS`** | `B8F3C411D2DEFA015BCCCF9D49ED37705F64BE468D20A6C02F5D66CAD2DED98E` |
  | **en retard de 10 s**, sain, **dans la grâce** | + `LatePaymentFee` | **`tecEXPIRED`** | `96C3870480E4CB0C9E3B925F2965347DA0815A486CDB4B49545928E32D6B0BA4` |
  | en retard, déprécié | + `LatePaymentFee` | `tecEXPIRED` | `160F640817AFA0286556B97D5A8DB13B5D4FEB7BE9D513BA51FA63FB7403C2A9` |
  | en retard, dé-déprécié | + `LatePaymentFee` | `tecEXPIRED` | `160B14BD184DA9161CEBCE80E22D01D9494EC826F5AD74B603C114B6B13E2E45` |
  | en retard, solde total entier | `TotalValueOutstanding` + 1 XRP | `tecEXPIRED` | `D95005034838241508892C96CDAE1490CC2DDBFBFE7EF62AAA6F2B7F879ABA6F` |

  Nous avons d'abord conclu « la dépréciation bloque le paiement », puis
  « le retard bloque le paiement ». **Les deux étaient faux.** La cause est un
  flag :

  | Tentative sur le prêt en retard | Code | Hash |
  |---|---|---|
  | `tfLoanLatePayment` (262144) + échéance + `LatePaymentFee` | **`tesSUCCESS`** | `EFAD383F9B622357CE67CBB0518D9F9F5FC27BE611D43F26FD69427713FB608F` |
  | `tfLoanLatePayment` + échéance seule (sans `LatePaymentFee`) | `tecINSUFFICIENT_PAYMENT` | `70A639238DA0604B557B545E2918173BF2C756998C2B35CC8D5777DE1F756740` |
  | `tfLoanFullPayment` (131072) + solde total | `tecEXPIRED` | `0715BE7DAF70EDDF0DFB05136217393A66C57644804A964B10E13996517F1D20` |
  | aucun flag | `tecEXPIRED` | `8A441EB2527D962A42D86919B52C4179A74CD250241D6D58888D4B7A0A3AECAC` |

  Un paiement en retard doit donc porter `tfLoanLatePayment` **et** inclure
  `LatePaymentFee`. Le paiement a été imputé normalement : `PaymentRemaining`
  3 → 2, `Flags` du prêt 131072 → **0** (la dépréciation est levée
  automatiquement par le paiement, comme annoncé par la doc), `LossUnrealized`
  du vault effacé.

Pourquoi ça coûte cher :
  1. **`tecEXPIRED` n'est pas dans les error cases de `LoanPay`.** La page
     liste `temINVALID`, `temBAD_AMOUNT`, `tecNO_ENTRY`, `tecNO_PERMISSION`,
     `tecTOO_SOON`, `tecKILLED`, `tecWRONG_ASSET`, `tecFROZEN`. Pas
     `tecEXPIRED`. Le développeur reçoit un code introuvable dans la doc de
     la transaction qu'il vient de soumettre.
  2. **Le nom du code oriente vers la mauvaise piste.** « Expired » se lit
     « le prêt est expiré, il est trop tard, passe au défaut » — donc on
     cherche du côté du terme et de la dépréciation. Nous avons brûlé deux
     sondes et un prêt entier sur cette fausse piste. Le code qui décrit la
     situation existe déjà ailleurs dans le protocole : `tecNO_PERMISSION`
     avec « late payment requires tfLoanLatePayment », ou un
     `temMALFORMED`/`tecINVALID_FLAG` nommant le flag manquant.
  3. **Le flag existe, est correctement typé dans le SDK
     (`LoanPayFlags.tfLoanLatePayment`) et documenté dans le tableau des
     flags** — mais rien ne relie le tableau des flags au tableau des
     erreurs. Les trois flags de `LoanPay` sont décrits comme des
     *indications* (« Indicates that the borrower is making a late loan
     payment »), ce qui se lit comme facultatif et déclaratif. Il est en
     réalité **obligatoire et bloquant**.
  4. Conséquence produit : un intégrateur qui construit un bouton « payer mon
     échéance » sans connaître ce flag livre une application où **tout
     emprunteur en retard d'une seconde est définitivement bloqué**, avec un
     code d'erreur qu'il ne trouvera pas dans la doc. C'est le scénario le
     plus courant du crédit à la consommation.

Repro (5 min, échéances de 90 s) :
  1. `LoanSet` `PaymentInterval: 90`, `GracePeriod: 60`, `PaymentTotal: 4`.
  2. Attendre `NextPaymentDueDate` + 10 s (donc encore dans la grâce).
  3. `LoanPay` `Amount` = `ceil(PeriodicPayment) + LoanServiceFee + LatePaymentFee`,
     sans `Flags` → **`tecEXPIRED`**.
  4. Même transaction avec `Flags: 262144` → **`tesSUCCESS`**.

Proposition :
  1. Ajouter `tecEXPIRED` au tableau des error cases de `LoanPay`, avec sa
     cause réelle : « the payment is past its due date and the transaction
     doesn't set `tfLoanLatePayment` ».
  2. Écrire dans la description du flag qu'il est **requis** pour tout
     paiement postérieur à `NextPaymentDueDate`, et non « indicatif ».
  3. Dans le tutoriel « Pay Off a Loan », ajouter le cas du paiement en
     retard. Le tutoriel ne montre aujourd'hui que le chemin heureux, et
     c'est le seul chemin qui ne nécessite pas de flag.
  4. Idéalement : accepter un paiement en retard sans flag. Le ledger connaît
     `NextPaymentDueDate` ; exiger du client qu'il redéclare un fait que le
     ledger possède déjà n'apporte aucune sécurité et crée cette classe de
     panne.

---

### [16:44] 🔴 `LossUnrealized` : la perte latente existe, mais la valeur de part « évidente » la rate — et nous sommes tombés dedans
Phase : observabilite
Catégorie : **documentation/tutorials** + UX
Sévérité : **haute**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1

Contexte :
  À [16:25] nous avons écrit que la dépréciation d'un prêt n'avait **aucun**
  effet sur le vault. C'était faux, et la façon dont nous nous sommes trompés
  est le vrai sujet.

Obtenu :
  Nœud `Vault` brut d'un vault de 5 XRP portant un prêt déprécié de 3 XRP :

    "AssetsTotal":      "5000002",
    "AssetsAvailable":  "2000001",
    "LossUnrealized":   "3000001",

  La perte latente est donc bien inscrite. Mais **elle n'est pas déduite de
  `AssetsTotal`**. Or la valeur d'une part se calcule naturellement
  `AssetsTotal / OutstandingShares` — c'est la formule qu'on écrit sans y
  penser, et c'est celle que nous avions écrite dans `lib/nav.mjs`. Elle donne
  **1,000000** alors que la valeur économique est
  `(AssetsTotal − LossUnrealized) / OutstandingShares` ≈ **0,400000**.

  **Surévaluation de 150 %, au moment exact où le porteur de part aurait
  besoin de savoir que son vault a un problème.**

Ce qui rend l'observation solide plutôt que théorique :
  `lib/nav.mjs` a été écrit **exprès** pour lire l'état d'un vault, en
  connaissance des pièges de ce protocole (il commente déjà le piège de
  `AssetsAvailable` absent à zéro). Il a quand même raté `LossUnrealized`,
  parce que :
  - le champ est **optionnel** dans le modèle TS (`LossUnrealized?: string`)
    et **absent du nœud** quand il vaut zéro — donc invisible en lecture
    d'un vault sain, c'est-à-dire pendant tout le développement ;
  - il n'apparaît dans aucun des exemples de `vault_info` que nous avons lus ;
  - rien, dans la page du Single Asset Vault, ne dit que la valeur d'une part
    doit se calculer nette des pertes latentes.

  C'est le troisième champ de ce protocole qui disparaît à zéro
  (`AssetsAvailable` [14:05], `AssetsMaximum` [16:18], `LossUnrealized` ici),
  et c'est le plus dangereux des trois : les deux premiers produisent un
  `NaN` bruyant, celui-ci produit **un chiffre faux et plausible**.

Tx / code : `LoanManage` `tfLoanImpair` →
  `C8678C1C0A10BE889124F40C03017038654B278E2D464FAC54784F55B35318FC`
  Les métadonnées de cette transaction contiennent la preuve directe des deux
  points de cette entrée, sur le nœud `Vault` `4275B5371C92…` :

      LossUnrealized : (champ ABSENT)  →  3000001
      Loan.Flags     : 0               →  131072

  L'impairment **crée** le champ. Sur un vault sain il n'existe donc pas du
  tout, ce qui explique qu'on puisse écrire un lecteur de vault complet sans
  jamais le croiser — c'est exactement ce qui nous est arrivé.

Preuve à charge pour H9 : nous avons désormais deux implémentations de la
valeur de part dans ce dépôt — la naïve et la correcte — et elles divergent de
150 % sur le même nœud. Aucune n'est fournie par le protocole.

Proposition :
  1. Exposer dans `vault_info` une valeur de part calculée par le nœud, nette
     de `LossUnrealized`. C'est **la** grandeur que tout intégrateur va
     afficher ; laisser chaque client la recalculer garantit des divergences,
     et celle-ci n'est pas une divergence d'arrondi mais un facteur 2,5.
  2. Renvoyer `LossUnrealized: "0"` explicitement plutôt que d'omettre le
     champ, pour que son existence soit découvrable en lisant un vault sain.
  3. Dire dans la doc du Single Asset Vault, à l'endroit où `AssetsTotal` est
     défini, que `AssetsTotal` est **brut de pertes latentes**.

---

### [16:44] Le devnet redevient muet — deuxième occurrence, même signature
Phase : build
Catégorie : other (infrastructure d'événement)
Sévérité : moyenne

Deuxième panne du même type après celle de [15:46], à ~1 h d'intervalle :
`xrpl.js` échoue en `connect() timed out after 20000 ms`, alors que

    nc -z lending-hackathon.dev.ripplex.io 51233   → succeeded
    curl -m 15 -X POST https://…:51234 server_info → réponse VIDE, exit 0

TCP accepte la connexion, HTTP ne répond rien. La procédure de [15:46] est
donc validée une seconde fois, et mérite d'être dans un README d'événement :
**avant de soupçonner son wifi, tester les deux couches séparément.** Sans ce
réflexe on débogue son propre code pendant dix minutes — ce qui est exactement
ce qui s'est passé la première fois.

Proposition :
  Une page de statut du devnet, ou un point de terminaison `/health`. Sur un
  hackathon de 30 h, deux pannes silencieuses de plusieurs minutes coûtent
  collectivement des heures, et chaque équipe les rediagnostique seule.

---

### [16:54] Un emprunteur en retard ne peut PAS solder son prêt en une transaction : `tfLoanFullPayment` est refusé tant qu'il est en retard
Phase : build
Catégorie : **missing primitive** + documentation/tutorials
Sévérité : moyenne à haute

Tenté :
  Solder un prêt en retard (2 échéances restantes, échéance dépassée de 595 s)
  en une seule transaction. Trois chemins, dans l'ordre où on les essaie :

  | Chemin | Couche qui refuse | Code |
  |---|---|---|
  | `tfLoanFullPayment` seul, solde total | ledger | `tecEXPIRED` `0715BE7DAF70EDDF0DFB05136217393A66C57644804A964B10E13996517F1D20` |
  | `tfLoanLatePayment` + `tfLoanFullPayment` (393216) | **SDK en local** puis ledger | `ValidationError` puis `temINVALID_FLAG` |
  | aucun flag, solde total | ledger | `tecEXPIRED` `D95005034838241508892C96CDAE1490CC2DDBFBFE7EF62AAA6F2B7F879ABA6F` |

  Les flags de `LoanPay` sont **mutuellement exclusifs**, confirmé par les deux
  couches : le SDK refuse (« *Only one of tfLoanLatePayment, tfLoanFullPayment,
  or tfLoanOverpayment flags can be set* ») et le ledger répond
  `temINVALID_FLAG` quand on contourne le SDK.

Le seul chemin qui fonctionne :
  **rattraper échéance par échéance**, chaque fois avec `tfLoanLatePayment` et
  chaque fois en payant `LatePaymentFee` :

    LoanPay LATE, échéance 1/2 → tesSUCCESS  `75DF16C471B6B395F46ECDA0FFCE514403946801BB0C5429985FD04E1944FFBC`
    LoanPay LATE, échéance 2/2 → tesSUCCESS  `ACD9AA1983C394445E08DC4E384CA2CF91AB3F94111D97C180561D77936CAF5C`
    LoanDelete                 → tesSUCCESS  `D9DCA7F35A73C72E5606DC1E6125098E4F2C40255EA38D04C1A348CDF49333AE`

  Détail mesuré qui explique pourquoi : **`NextPaymentDueDate` avance d'un
  `PaymentInterval` par paiement, pas jusqu'à maintenant.** Après avoir payé
  une échéance en retard, le prêt reste en retard (échéance encore dépassée de
  510 s) — donc l'échéance suivante exige encore `tfLoanLatePayment` et encore
  une `LatePaymentFee`. Un emprunteur en retard de N échéances paiera N fois la
  pénalité de retard, sans possibilité de tout régler d'un coup.

Pourquoi c'est un manque et pas un choix :
  `tfLoanFullPayment` existe exactement pour le cas « je veux sortir de ce
  prêt maintenant ». Il est indisponible précisément dans la situation où un
  emprunteur en a le plus besoin — sortir d'un retard. Rien dans la doc ne dit
  que le remboursement anticipé total est réservé aux prêts à jour.

Proposition :
  1. Autoriser `tfLoanFullPayment` sur un prêt en retard, en y incluant les
     pénalités de retard dues (le ledger sait les calculer, il le fait déjà
     échéance par échéance).
  2. À défaut : documenter le chemin de rattrapage sur la page `LoanPay`, et
     dire explicitement que `tfLoanFullPayment` exige un prêt à jour.
  3. Cohérence interne du SDK à corriger au passage : `validateLoanPay`
     contrôle correctement l'exclusion mutuelle de ses **trois** flags, alors
     que `validateLoanManage` n'en contrôle que deux sur trois (entrée
     [16:25]). Le bon modèle existe donc déjà dans le même fichier voisin.

---

### [16:54] 🔴 Le motif transversal : **quatre** champs disparaissent du nœud quand ils valent zéro
Phase : observabilite
Catégorie : **UX** + client libraries
Sévérité : **haute — c'est la même cause pour quatre pièges différents**

Recensement de ce que nous avons rencontré aujourd'hui, chacun découvert
séparément, chacun ayant coûté du temps :

  | Champ | Nœud | Rencontré | Symptôme si lu naïvement |
  |---|---|---|---|
  | `AssetsAvailable` | `Vault` | [14:05] | `BigInt(undefined)` → exception, au pire moment (vault illiquide) |
  | `AssetsMaximum` | `Vault` | [16:18] | plafond illisible ; « pas de plafond » indistinguable de « champ absent » |
  | `LossUnrealized` | `Vault` | [16:44] | **valeur de part surévaluée de 150 %**, silencieusement |
  | `PaymentRemaining` + `TotalValueOutstanding` | `Loan` | [16:54] | `Number(undefined)` → `NaN` ; un prêt soldé paraît malformé |

  Le dernier a été relevé sur un prêt intégralement payé mais non encore
  supprimé : `PaymentRemaining` et `TotalValueOutstanding` sont tous deux
  **absents** du nœud. Notre propre test `Number(fin.PaymentRemaining) === 0`
  était donc faux — il comparait `NaN`.

Ce qui en fait un item à part entière plutôt que quatre :
  - Les modèles TS du SDK marquent ces champs **optionnels**
    (`AssetsTotal?`, `LossUnrealized?`, `LoanServiceFee?`…), ce qui est
    fidèle au ledger mais ne dit pas *pourquoi* : le développeur conclut
    « champ parfois non renseigné », pas « champ à zéro ».
  - Aucun exemple de réponse `vault_info` ou `ledger_entry` de la doc ne
    montre un nœud dont un champ numérique est à zéro. On ne découvre donc
    le motif qu'en produisant soi-même l'état limite — et l'état limite est
    toujours l'état intéressant : vault vidé, prêt soldé, perte nulle.
  - Trois des quatre cas produisent une erreur bruyante (`NaN`, exception).
    `LossUnrealized` produit **un nombre faux et crédible**. C'est la
    différence entre un bug qu'on corrige en dix secondes et un bug qui part
    en production.

Proposition :
  1. Renvoyer les champs numériques à zéro **explicitement** (`"0"`) dans
     `vault_info`, `ledger_entry` et les métadonnées. Le coût en octets est
     négligeable devant la classe de bugs que l'omission crée.
  2. À défaut, le dire une fois, clairement, en tête de la référence des
     types de nœuds : « les champs numériques valant zéro sont omis ». Une
     phrase aurait suffi à nous épargner quatre découvertes séparées.
  3. Côté SDK : fournir des accesseurs qui normalisent (`vaultAssets(v)`,
     `loanOutstanding(l)`) plutôt que d'exposer des champs optionnels bruts.
     Chaque intégrateur écrit aujourd'hui ce `?? 0`, et il suffit d'en
     oublier un.

---

### [17:01] ✅🔴 H8 TRANCHÉE — le plancher de couverture est appliqué au drop près, et les paramètres de risque sont immuables. Mais le refus s'appelle `temINVALID`
Phase : build
Catégorie : **documentation/tutorials** + error messages (le fond est bon, la forme trompe)
Sévérité : moyenne — **hypothèse à retirer du rapport comme grief de sécurité**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1 · scripts `_probe-cover-floor.mjs`, `_probe-broker-mutable.mjs`

H8 demandait : un broker peut-il récupérer son first-loss capital, et
notamment « à `DebtTotal = 0`, est-ce libre ? ». Réponse complète, mesurée sur
un broker à dette 4 XRP / couverture 1 XRP / `CoverRateMinimum` 10 %
(plancher = 0,400000 XRP) :

  | Tentative | Code | Hash |
  |---|---|---|
  | retirer 0,9 XRP (laisserait 2,5 %) | `tecINSUFFICIENT_FUNDS` | `071BEB20D2D5C5264571FFA7383BACAEA2684758C2661802B6C2E9458679BDA9` |
  | retirer 0,6 XRP (laisserait 10,00 %) | **`tesSUCCESS`** | — |
  | retirer **1 drop** de plus | `tecINSUFFICIENT_FUNDS` | `4FB4A2B0D01DD2411A5E8592680D50B1F4CCA51ED97C243C2A506516262F1370` |
  | retirer toute la couverture | `tecINSUFFICIENT_FUNDS` | — |

**Le plancher est exact au drop.** Et les deux paramètres qui le définissent
sont **immuables** après création du broker :

  | `LoanBrokerSet` sur un broker vivant | Résultat |
  |---|---|
  | `CoverRateMinimum` 10 %→1 % (+ `CoverRateLiquidation`) | **`temINVALID`** — refusé, aucune trace on-chain |
  | `ManagementFeeRate` 2 %→9 % | **`temINVALID`** — refusé |
  | `DebtMaximum` → 1 drop (< `DebtTotal`) | `tecLIMIT_EXCEEDED` `82C14ED4071391EC1EF25637D2FEC28CF784BB19FEB4E89082A64CD9748E4121` |
  | `DebtMaximum` → 80 XRP | `tesSUCCESS` `471EFC5E7FF5DC12276C64CFBE278A5D1FFA3610C752F99BA878F34F8844ABD0` |
  | `Data` | `tesSUCCESS` `5BB0B002F0E11617A891562788AE2EAF8A9073385E0E2A5BA2E8F8470125B097` |
  | par un tiers | `tecNO_PERMISSION` `6CDC55F8F62286CDB20E0F2D8002E29D4CD6DEEC5E23976803B880211801BBE0` |

  **Conclusion de sécurité : il n'y a pas de chemin d'évasion.** Un broker ne
  peut ni abaisser la protection qu'il a promise, ni descendre sous le
  plancher, ni augmenter ses frais en cours de route. C'est exactement ce
  qu'un déposant a besoin de savoir, et c'est bien conçu. H8 est infirmée
  comme grief : à retirer de la liste des soupçons.

Le grief qui reste, et il est réel :
  **`temINVALID` pour dire « ce champ est immuable ».** Trois problèmes :
  1. `tem` signifie « transaction mal formée » — le développeur cherche une
     faute de frappe, un mauvais type, un champ mal encodé. Il ne peut pas
     deviner que la transaction est parfaitement formée et que c'est
     l'**opération** qui est interdite.
  2. La même transaction, avec les mêmes champs obligatoires, **réussit** sur
     `DebtMaximum` et `Data`. Le développeur voit donc `LoanBrokerSet`
     fonctionner, puis répondre « ill-formed » sur un autre champ, sans que
     rien ne distingue les deux cas.
  3. Un `tem` **ne laisse aucune trace on-chain** : l'observation est
     irrécupérable si on ne l'a pas notée au moment même. Pour une règle
     métier, `tecNO_PERMISSION` ou un `tecIMMUTABLE` serait à la fois plus
     juste et vérifiable après coup dans l'explorer.

  Et le comportement n'est documenté nulle part : la page `LoanBrokerSet` ne
  dit pas quels champs sont figés après la création. C'est pourtant la
  propriété qui fait la valeur du broker pour un déposant.

Proposition :
  1. Lister dans la référence `LoanBrokerSet` les champs immuables
     (`CoverRateMinimum`, `CoverRateLiquidation`, `ManagementFeeRate`) et les
     champs modifiables (`DebtMaximum`, `Data`), et le dire comme une
     **garantie** — c'est un argument de vente du protocole, pas un détail.
  2. Remplacer `temINVALID` par un code de refus métier vérifiable on-chain.
  3. `tecLIMIT_EXCEEDED` apparaît ici pour une **troisième** cause distincte
     (`DebtMaximum` sous `DebtTotal`), après le dépôt au-delà du plafond et
     le `AssetsMaximum` sous `AssetsTotal` de [16:18]. Le code ne veut plus
     rien dire à lui seul.

---

### [17:01] `LoanBrokerCoverClawback` — 7e et dernier type jamais soumis : inutilisable sur un broker en XRP
Phase : build
Catégorie : documentation/tutorials
Sévérité : basse à moyenne

Les 15 types XLS-65/66 ont maintenant tous été soumis au moins une fois.
Le dernier, `LoanBrokerCoverClawback`, refuse pour les trois parties :

    par le broker (propriétaire)   → tecNO_PERMISSION  `DBBBA2F3B1313BD205EE33AAA9091787954AA5410E2595ED32AE43562C0A0E8D`
    par un déposant du vault       → tecNO_PERMISSION  `377D768967A9C9C9885716C2AE0133D62E49398D801C341A7CEEE63F8A142C76`
    par l'emprunteur               → tecNO_PERMISSION
    avec `Amount` en drops (raw)   → refusé côté SDK (`isTokenAmount` = false)

Même conclusion que pour `VaultClawback` ([16:18]) : le clawback est la
prérogative de l'**émetteur de l'actif**, et XRP n'en a pas — donc le type est
structurellement inapplicable à tout broker en XRP, et `tecNO_PERMISSION`
laisse chercher un signataire qui n'existe pas. Le modèle TS confirme
l'intention (`Amount?: IssuedCurrencyAmount | MPTAmount`, pas de XRP), mais
seul un test le révèle.

Proposition :
  Dire sur les deux pages de clawback qu'elles ne s'appliquent qu'aux actifs
  émis, et distinguer le refus structurel du refus d'autorisation.

---

### [17:01] `submitAndWait` **lève** sur `tem` mais **renvoie** sur `tec` — asymétrie qui casse toute sonde de validation
Phase : build
Catégorie : **client libraries** + UX
Sévérité : moyenne
Lib : xrpl@4.6.0

Observé :
  Un échec `tec` revient dans `result.meta.TransactionResult` et se lit
  normalement. Un échec `tem` **lève une `XrplError`** qui interrompt le
  programme. Nos deux sondes se sont arrêtées net en pleine série de tests :

    XrplError: Transaction failed, temINVALID: The transaction is ill-formed.
        at Client.<anonymous> (…/client/index.js:243:23)

  Coût réel : deux scripts de sonde tués au milieu, chaque fois **après** avoir
  laissé un vault, un broker et un prêt vivants sur le ledger — donc du capital
  immobilisé et un décor à reconstruire à la main. Notre propre helper
  `raw-submit.mjs` porte pourtant en commentaire « *Ne lève pas sur un échec
  `tec` / `tem`* » : c'est faux pour `tem`, et nous l'avions écrit de bonne foi
  en lisant la doc de `submitAndWait`.

Pourquoi c'est structurant, et pas un détail de style :
  Quand on explore les bornes de validation d'un protocole neuf — ce que fait
  **tout** intégrateur les premiers jours — la moitié des réponses
  intéressantes sont des `tem`. Le code naturel (« je soumets, je lis le
  code ») fonctionne pour la moitié des cas et fait exploser l'autre. Il faut
  encapsuler chaque appel dans un `try/catch` **et** re-parser le code
  d'erreur depuis un message texte (`String(e.message).match(/tem[A-Z_]+/)`),
  puisque `e.data` est `undefined`.

Contournement en place :
  ```js
  const safe = async (seed, tx, label) => {
    try { return await submitRaw(c, seed, tx, { label }); }
    catch (e) {
      const m = String(e.message).match(/(tem[A-Z_]+|tef[A-Z_]+|tel[A-Z_]+)/);
      return { code: m ? m[1] : "throw", err: e.message };
    }
  };
  ```

Proposition :
  1. Renvoyer les `tem`/`tef`/`tel` dans l'objet résultat comme les `tec`,
     ou au minimum exposer le code sur l'exception (`e.engineResult`) au lieu
     de le noyer dans un message à parser.
  2. Le dire dans la doc de `submitAndWait` : aujourd'hui la distinction
     « classes d'erreurs qui lèvent » vs « classes qui reviennent » ne s'y
     trouve pas, et c'est la première chose qu'un intégrateur doit savoir.

---

### [17:07] 🔴 H10 CONFIRMÉE — les deux falaises du `LoanSet` renvoient le même code, et les deux remèdes sont opposés
Phase : build
Catégorie : **UX** + observabilite
Sévérité : **haute**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1 · script `scripts/_probe-cliffs.mjs`

Les deux causes isolées l'une de l'autre, sur le même broker :

  | Situation | Couverture | Liquidité | Code |
  |---|---|---|---|
  | falaise de **couverture** | capacité 2 XRP, dette demandée 2,5 | **ample** (8,5 XRP) | `tecINSUFFICIENT_FUNDS` |
  | falaise de **liquidité** | **ample** (capacité 52 XRP) | 7,5 XRP, demande 9 | `tecINSUFFICIENT_FUNDS` |

    falaise de couverture  `5DC3A6E00F31DA82C69AB77669C64691BD71CAC49C169736F53D7C724147618B`
    falaise de liquidité   `BB0CFCF87C045FA971CD601590B2D635398900791F9E902B50154A8C8F8D1803`
    contrôle positif       `AE3DC594ED640F93D31DBDABE5D24732543B616B27C95DF2490120B8B3835A0C` (1,5 XRP, tesSUCCESS)

Pourquoi c'est grave et pas seulement inélégant :
  Les deux situations appellent des actions **opposées** de la part du broker.
  - falaise de couverture → « dépose du first-loss capital », action immédiate,
    à sa main, quelques secondes.
  - falaise de liquidité → « attends que des déposants arrivent », action qu'il
    ne contrôle pas du tout, délai indéterminé.

  Un broker qui automatise l'origination reçoit un code unique et ne peut pas
  choisir entre les deux. La doc le confirme et l'assume : la page `LoanSet`
  liste les deux causes sous la même entrée `tecINSUFFICIENT_FUNDS` (« *The
  Vault … doesn't have enough assets* » / « *The LoanBroker … doesn't have
  enough first-loss capital* »). C'est donc une ambiguïté **documentée**, pas
  un oubli — ce qui la rend plus facile à corriger.

Aggravant, côté observabilité : **la capacité de dette n'est exposée nulle
part.** Pour savoir si un `LoanSet` va passer, il faut lire `CoverAvailable`,
lire `CoverRateMinimum`, calculer `CoverAvailable × 100000 / CoverRateMinimum`,
lire `AssetsAvailable` du vault (absent à zéro, cf. [16:54]), lire
`DebtMaximum`, lire `DebtTotal` (absent à zéro), et prendre le minimum des
trois contraintes. Six lectures et une formule pour répondre à « puis-je
prêter 5 XRP ? ». C'est exactement la ligne de H10 et de H9.

Proposition :
  1. Scinder le code : `tecINSUFFICIENT_FUNDS` pour la liquidité du vault,
     un `tecINSUFFICIENT_COVER` (ou équivalent) pour le first-loss capital.
  2. Exposer sur le nœud `LoanBroker` un `DebtCapacity` (ou `CoverDeficit`)
     calculé par le nœud. C'est la grandeur que tout broker va afficher.
  3. À défaut des deux : un champ dans les métadonnées de la transaction
     rejetée disant laquelle des deux contraintes a mordu.

---

### [17:07] ✅ H7 CONFIRMÉE — vault owner et loan broker doivent être le même compte
Phase : build
Catégorie : **missing primitive**
Sévérité : moyenne

Deux comptes tiers ont tenté de créer un `LoanBroker` sur un vault appartenant
à un troisième :

    LoanBrokerSet par `spare`  → `tecNO_PERMISSION`  `6CDC55F8F62286CDB20E0F2D8002E29D4CD6DEEC5E23976803B880211801BBE0`
    LoanBrokerSet par `lender` → `tecNO_PERMISSION`

La contrainte de la spec est donc bien appliquée par le ledger, et le code est
correct cette fois (c'est réellement un refus d'autorisation).

Le grief reste **métier**, pas technique, et il est réel : dans un fonds de
crédit, l'administrateur du véhicule et le gérant de crédit sont deux entités
distinctes, souvent par obligation réglementaire (dépositaire vs société de
gestion). Le protocole impose aujourd'hui de les fusionner en une seule clé,
ce qui rend la structure inutilisable telle quelle pour un acteur régulé.
Nous avons nous-mêmes dû faire du compte `broker` le propriétaire du vault
dans notre démonstration, alors que la narration distingue les deux rôles.

Proposition :
  Autoriser des comptes distincts, en réutilisant l'amendment
  `PermissionDelegation` existant plutôt qu'en inventant un mécanisme : le
  vault owner délègue `LoanBrokerSet` / `LoanSet` à un gérant. C'est le
  chemin le moins coûteux pour le protocole et celui qui débloque un cas
  d'usage institutionnel entier.

---

### [17:07] `WithdrawalPolicy` n'accepte que la valeur 1, mais le SDK laisse passer n'importe quel entier
Phase : build
Catégorie : **client libraries** + documentation/tutorials
Sévérité : basse à moyenne
Lib : xrpl@4.6.0

Testé à la création d'un vault, cinq valeurs :

    WithdrawalPolicy = 0   → temMALFORMED
    WithdrawalPolicy = 2   → temMALFORMED
    WithdrawalPolicy = 3   → temMALFORMED
    WithdrawalPolicy = 99  → temMALFORMED
    WithdrawalPolicy = 255 → temMALFORMED
    champ omis             → tesSUCCESS, nœud lu : WithdrawalPolicy = **1**

Réponse à une question que nous avions laissée ouverte : **seule la valeur 1
existe**, et l'omission donne 1 par défaut. `vaultStrategyFirstComeFirstServe`
est donc aujourd'hui la seule politique du protocole.

Les deux griefs :
  1. **Le SDK a l'enum et ne s'en sert pas.** `vaultCreate.js` définit
     `VaultWithdrawalPolicy { vaultStrategyFirstComeFirstServe = 1 }` puis
     valide le champ avec un simple `validateOptionalField(tx,
     'WithdrawalPolicy', isNumber)`. N'importe quel entier part donc sur le
     réseau pour se faire refuser, alors que la bibliothèque a de quoi le
     refuser en local, gratuitement. Correctif d'une ligne, dans le fichier
     qui contient déjà l'enum.
  2. `temMALFORMED` ne nomme pas le champ — et comme c'est un `tem`, il ne
     laisse **aucune trace on-chain** pour l'analyse d'après-coup. Sur un
     `VaultCreate` à dix champs, on cherche à l'aveugle. Même remarque qu'à
     [15:21] pour `GracePeriod`.

Proposition :
  1. Valider `WithdrawalPolicy` contre l'enum dans `validateVaultCreate`.
  2. Dire dans la doc du champ que la seule valeur admise est `1` — la page
     décrit une « politique de retrait » au singulier sans donner la liste,
     ce qui laisse croire à un choix.

---

### [17:07] ✅ Deux prêts concurrents sur un vault : la liquidité restante est correctement vue
Phase : build
Catégorie : other (comportement correct)
Sévérité : basse

Jamais testé jusqu'ici. Deux prêts vivants simultanément sur le même vault,
via le même broker :

    vault 10 XRP → LoanSet 1,5 XRP  → tesSUCCESS, liquidité restante 8,5 XRP
                 → LoanSet 1,0 XRP  → tesSUCCESS, liquidité restante 7,5 XRP
    prêt 1 principal 1,500000 XRP · prêt 2 principal 1,000000 XRP
    hashes `AE3DC594ED640F93D31DBDABE5D24732543B616B27C95DF2490120B8B3835A0C`
           `6F180E83EE554FF6DAE78778632AB641AC2A7946321B16799ED17C627D74B211`

`AssetsAvailable` est décrémenté exactement du principal à chaque origination,
`DebtTotal` du broker agrégé correctement (2,500000 XRP), et les deux prêts se
soldent puis se suppriment indépendamment. Rien à signaler — ce qui est en soi
l'information utile, puisque c'était une inconnue.

---

### [17:12] 🔴 Un vault dont les parts sont non transférables est **indistinguable** d'un vault normal sur le nœud `Vault`
Phase : observabilite
Catégorie : **UX** + documentation/tutorials
Sévérité : **haute — c'est la propriété qui décide si un déposant pourra sortir**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1 · script `scripts/_probe-transferable-control.mjs`

Tenté :
  `VaultCreate` avec le flag `tfVaultShareNonTransferable` (131072), jamais
  exercé jusqu'ici, puis comparaison terme à terme avec un vault normal.
  Même propriétaire, même actif, même plafond, même déposant.

Obtenu :

  | | vault normal | vault non transférable |
  |---|---|---|
  | `Vault.Flags` | **0** | **0** |
  | `MPTokenIssuance.Flags` | **56** | **0** |
  | `lsfMPTCanTransfer` (bit 32) | présent | **absent** |
  | `Payment` de parts (destinataire ayant fait son opt-in) | `tesSUCCESS` `4C62E1C257B6EB3F763D2317064EAE976934B22BFCDEFBDA0A62451AACFF2D39` | **`tecNO_AUTH`** `E9DE504D40B8AB27F7C7EA433B0C1E68DC91854AA04A5D600163A64DB8BE5FD9` |
  | `EscrowCreate` de parts | accepté (cf. [13:46]) | **`tecNO_PERMISSION`** `29966716239A3041B878A2FF437884B073BCBCA4FE2FF1E693C8121F627C4B5C` |
  | `MPTokenAuthorize` du destinataire | `tesSUCCESS` | **`tesSUCCESS`** `6F6DBE220E8F06BAF70CAA6C6D835CE77368D1AA3DE21963E282158C9210A160` |

Trois problèmes distincts, du plus grave au moins grave :

1. **`Vault.Flags` vaut 0 dans les deux cas.** Le flag de création n'est pas
   reporté sur le nœud `Vault` ; la seule trace est l'**absence** du bit 32
   (`lsfMPTCanTransfer`) sur l'émission de parts.

   ⚠️ **Rectifié à [17:15]** : nous avions écrit qu'il fallait un **second
   appel** `ledger_entry {mpt_issuance: …}`, et que `vault_info` ne renvoyait
   pas les flags de l'émission. **C'est faux** : `vault_info` embarque le nœud
   d'émission dans son sous-objet `shares`, flags compris. Vérifié —
   `vault_info.shares.Flags` = 56 et `ledger_entry.node.Flags` = 56, valeurs
   identiques, `Flags` étant renvoyé explicitement même à 0.

   Le grief se réduit donc à la **découvrabilité**, et il tient encore : pour
   répondre à « pourrai-je revendre ma part ? », il faut savoir qu'il faut
   regarder dans `shares` et pas dans `Flags` du vault (qui vaut 0 dans les
   deux cas, donc rassure à tort), savoir que le bit 32 s'appelle
   `lsfMPTCanTransfer`, et interpréter un bit **manquant** comme une
   interdiction. Trois savoirs implicites pour la propriété la plus
   structurante d'un placement — la liquidité de la part.
   (Dans notre propre cas d'usage, tout le projet repose sur la cession de
   parts : un vault créé avec ce flag rendrait la démonstration impossible,
   et rien dans `vault_info` ne nous l'aurait dit.)

2. **`tecNO_AUTH` pour deux causes opposées.** Le même code signale
   « le destinataire n'a pas fait son `MPTokenAuthorize` » ([13:46]) et
   « ces parts ne sont transférables à personne, jamais ». Le premier se
   corrige en une transaction par le destinataire ; le second est définitif
   et figé à la création du vault. Ici le destinataire **avait** fait son
   opt-in avec succès, et le code est resté le même. Quatrième occurrence du
   motif « un code pour plusieurs causes » relevé aujourd'hui, après
   `tecLIMIT_EXCEEDED` (3 causes), `tecNO_PERMISSION` (état vs autorisation)
   et `tecINSUFFICIENT_FUNDS` (couverture vs liquidité).

3. **`MPTokenAuthorize` réussit sur des parts non transférables.** Le
   destinataire s'inscrit avec succès pour recevoir quelque chose qu'il ne
   pourra jamais recevoir, et le ledger crée l'objet `MPToken` (donc immobilise
   sa réserve de 2 XRP). Même famille que le `LoanManage` sans flag de
   [16:25] : un `tesSUCCESS` qui n'accomplit rien.

✅ Le point positif, et il n'est pas trivial : **l'interdiction résiste à
`EscrowCreate`.** Nous nous attendions à un contournement, parce qu'on avait
déjà constaté ([13:46]) qu'`EscrowCreate` de parts ignore l'exigence d'opt-in
que `Payment` applique. Ici Escrow refuse proprement (`tecNO_PERMISSION`). Le
chemin le plus subtil est donc couvert, alors que le chemin le plus simple
(`Payment`) renvoie un code ambigu.

Proposition :
  1. Exposer un booléen explicite (`SharesTransferable`) à côté de
     `AssetsTotal` dans `vault_info`. Les flags y sont déjà, mais enfouis
     dans un sous-objet et exprimés par l'absence d'un bit : personne ne les
     lira sans avoir d'abord été surpris.
  2. Reporter `tfVaultShareNonTransferable` sur `Vault.Flags` à la création,
     comme `lsfVaultPrivate` l'est déjà. L'information appartient au vault.
  3. Un code distinct pour « actif non transférable » (`tecNO_PERMISSION` ou
     un `tecNOT_TRANSFERABLE`), à réserver au cas définitif, en gardant
     `tecNO_AUTH` pour le cas réparable.
  4. Refuser `MPTokenAuthorize` sur une émission non transférable plutôt que
     de créer un objet inutile et sa réserve.

---

### [17:15] 🔴 H9 CONFIRMÉE, mesurée — 8 appels RPC et 6 formules maison pour le tableau de bord d'un déposant
Phase : observabilite
Catégorie : **missing primitive** + observabilite
Sévérité : **haute**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1 · script `scripts/_probe-h9-observability.mjs` (lecture seule)

Méthode : se placer du point de vue d'un **déposant** qui détient des parts, et
compter ce qu'il faut pour répondre à cinq questions élémentaires. Sujet : un
vault réel de 300 XRP portant un prêt vivant de 100 XRP.

  | Question de déposant | Réponse directe du protocole ? | Coût |
  |---|---|---|
  | Combien vaut ma position ? | **non** | 2 appels + 3 formules |
  | Mes parts sont-elles cessibles ? | **non** (bit à interpréter dans `shares`) | 0 appel de plus |
  | Combien puis-je retirer maintenant ? | **non** | 1 formule |
  | Dans quels prêts est mon capital ? | **non** | 4 appels + un scan |
  | Qui sont les autres déposants ? | **impossible** | — |

  **Total : 8 appels RPC**, et six grandeurs à recalculer soi-même : valeur de
  part brute, valeur de part **nette de `LossUnrealized`**, valeur de ma
  position, retrait maximum, taux d'utilisation, capacité de dette du broker.

Ce que le protocole expose vs ce qu'un déposant demande :
  `vault_info` renvoie 17 champs, tous **bruts** : `AssetsTotal`,
  `AssetsAvailable`, `LossUnrealized`, `ShareMPTID`, `WithdrawalPolicy`… et le
  sous-objet `shares` (l'émission complète, flags compris — utile, et bonne
  surprise). Aucune grandeur dérivée. Or **aucun déposant ne raisonne en
  `AssetsTotal`** : il raisonne en « combien vaut ma part » et « puis-je
  sortir ». Les deux demandent une division que chaque client réimplémentera,
  et dont [16:44] montre qu'elle se rate silencieusement (facteur 2,5).

Le chemin vault → prêts, reconstitué (il n'y a pas d'index) :
  1. `vault_info` → ne cite **ni broker ni prêt**. Aucune commande `vault_loans`.
  2. `account_objects` sur `Owner` → **39 objets** à scanner, filtrer
     `LedgerEntryType == "LoanBroker" && VaultID == V` → 1 broker.
     Suppose de connaître `Owner` et de pouvoir lister ses objets.
  3. `account_objects` sur le **pseudo-compte** du broker, `type: "loan"`
     → là, les prêts sont listés (1 trouvé, principal 100 XRP, `Flags` 0).

  Rectification utile pour le rapport : nous pensions d'abord que les prêts
  étaient **inénumérables** parce que les objets `Loan` apparaissent dans
  `account_objects` des emprunteurs. C'est faux — le pseudo-compte du broker
  les liste. Le grief n'est donc pas « impossible » mais « trois requêtes, un
  scan, et deux savoirs implicites (le pseudo-compte, le filtre par VaultID) ».

Et deux absences franches :
  - **`loan_info` et `loan_broker_info` n'existent pas** (`unknownCmd`), alors
    que `vault_info` existe. Le protocole offre une commande dédiée pour un de
    ses trois objets et rien pour les deux autres. Asymétrie difficile à
    justifier côté intégrateur.
  - **`mpt_holders` → `unknownCmd`** sur ce rippled. Impossible d'énumérer les
    porteurs de parts, donc de savoir qui partage le vault, donc de raisonner
    sur la concurrence de retrait (`WithdrawalPolicy` = premier arrivé premier
    servi — dont l'intérêt dépend entièrement de qui est devant vous).

Proposition :
  1. Ajouter à `vault_info` un bloc dérivé calculé par le nœud :
     `SharePriceNet`, `SharePriceGross`, `Utilization`, `SharesTransferable`.
     Six lignes de C++ contre N implémentations divergentes côté clients.
  2. Ajouter `loan_info` et `loan_broker_info`, avec sur le broker la
     `DebtCapacity` réclamée par [17:07].
  3. Indexer vault → brokers, et broker → prêts, pour supprimer le scan.
  4. Activer Clio (ou équivalent) sur les devnets de hackathon : sans
     `mpt_holders`, tout produit qui affiche « vos co-déposants » ou une
     répartition est hors de portée, et personne ne peut le découvrir avant
     d'avoir écrit le code.

---

### [17:20] 🔴 H2 : pas de course contre le temps, mais le montant exact d'un paiement en retard est **incalculable** depuis le nœud — et `Amount` est en réalité un plafond
Phase : build
Catégorie : **documentation/tutorials** + observabilite
Sévérité : **haute**
Lib : xrpl@4.6.0 · rippled 3.4.0-rc1 · scripts `_probe-h2-race.mjs`, `_probe-h2-meta.mjs`

H2 prédisait une condition de course : le dû d'un paiement en retard
contiendrait un intérêt de retard fonction du temps, donc « on lit, on calcule,
on signe, le montant est périmé ». Testé sur un prêt de 3 XRP avec
`LateInterestRate` **30 %** (`InterestRate` 8 %), échéances de 90 s.

**Partie infirmée — rien ne bouge dans le nœud :**

    retard  10 s → PeriodicPayment 750000.4280818960614 · TotalValueOutstanding 3000002
    retard  31 s → identique
    retard  51 s → identique
    retard  72 s → identique
    retard  95 s → identique
    dérive sur 85 s : **0 drop**

  Aucun champ du nœud `Loan` ne bouge avec le retard. Un montant lu 85 s plus
  tôt est donc aussi bon (ou aussi mauvais) qu'un montant lu à l'instant : il
  n'y a **pas** de course contre le ledger. H2 est infirmée sur ce point.

**Partie confirmée, en pire — le montant du nœud est FAUX :**

    dû selon les champs du nœud :
      ceil(PeriodicPayment) + LoanServiceFee + LatePaymentFee = 765001 drops
    LoanPay tfLoanLatePayment 765001  → **tecINSUFFICIENT_PAYMENT** (deux fois,
      montant périmé ET montant frais)
    LoanPay tfLoanLatePayment 2765001 → tesSUCCESS  `9A7589384C5142703AFFACBB91B12E223EC734F7ACBE51272A87525FE4EE9CA8`

  L'intérêt de retard **s'accumule bien** (≈ 3 000 000 × 30 % × 95 s / an
  ≈ 2,7 drops, cohérent avec l'écart observé) mais **n'est exposé par aucun
  champ**. Le nœud publie `LateInterestRate` sans publier l'intérêt de retard
  couru. La formule reconstruite depuis les champs disponibles est donc
  systématiquement **courte de quelques drops**, et le paiement est rejeté
  pour insuffisance alors qu'il a été calculé avec les données du ledger.

**Ce qui sauve la situation, et qui n'est écrit nulle part :
`Amount` est un PLAFOND, pas un montant exact.** Métadonnées du paiement
accepté :

    Amount envoyé                 2 765 001 drops
    solde de l'emprunteur         **− 765 015 drops** (dû + 12 de frais de tx)
    principal du prêt             3,000000 → 2,250001 XRP
    échéances restantes           4 → 3
    pseudo-compte du vault        + 0,750003 XRP
    compte du broker              + 0,015000 XRP  (LoanServiceFee + LatePaymentFee)
    vault AssetsTotal             5,000000 → 5,000004 XRP
    NextPaymentDueDate            + 90 s exactement (un intervalle)

  L'excédent de 2 XRP **n'a pas été débité** : le ledger prélève ce qui est dû
  et ignore le reste. La bonne pratique est donc « envoyer largement plus que
  l'estimation », ce qui est contre-intuitif sur un ledger où l'on a l'habitude
  de montants exacts — et contredit la lecture naturelle de la doc, qui parle
  d'un montant exact et d'excédents « ignorés » (ce qui se comprend comme
  « perdus » et non « non prélevés »).

Nuance mesurée, utile pour un intégrateur :
  avec `tfLoanLatePayment`, le surpaiement n'impute **qu'une seule échéance**
  (4 → 3) même en envoyant 3,7× le dû. Sans flag, sur un prêt à jour, un
  surpaiement impute **plusieurs** échéances d'un coup (relevé à [15:21], H3 :
  4 → 1). Deux comportements opposés du même champ `Amount` selon l'état du
  prêt, aucun des deux documenté.

Repro :
  1. `LoanSet` avec `LateInterestRate` non nul, `PaymentInterval` court.
  2. Dépasser l'échéance, calculer
     `ceil(PeriodicPayment) + LoanServiceFee + LatePaymentFee`.
  3. `LoanPay` avec `tfLoanLatePayment` de ce montant → `tecINSUFFICIENT_PAYMENT`.
  4. Recommencer en envoyant le double → `tesSUCCESS`, et vérifier dans les
     métadonnées que seul le dû a été prélevé.

Proposition :
  1. **Écrire noir sur blanc que `Amount` est un plafond** et que l'excédent
     n'est pas prélevé. C'est l'information qui débloque tout le reste, et
     elle change la façon d'écrire le client.
  2. Exposer l'intérêt de retard couru sur le nœud `Loan`
     (`LateInterestAccrued`), ou un champ `AmountDue` recalculé par le nœud.
     Sans l'un des deux, il est **impossible** d'afficher à un emprunteur ce
     qu'il doit — c'est le premier écran de toute application de crédit.
  3. Documenter que `tfLoanLatePayment` n'impute qu'une échéance, contrairement
     au surpaiement sur un prêt à jour.
