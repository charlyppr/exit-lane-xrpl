# [NOM DU PROJET]

> [Une phrase : le use case, pas la technique.]

XRPL Lending Protocol Hackathon — DeVinci Blockchain x Ripple — Nanterre, 12-13 septembre 2026

## Environment

| | |
|---|---|
| **Track** | 1 — Open-ended vault |
| **Flavour** | Vanilla / Loaded |
| **Protocol** | Lending Protocol V1 |
| **Network** | Custom Hackathon Devnet |
| **RPC** | `https://lending-hackathon.dev.ripplex.io:51234` |
| **WSS** | `wss://lending-hackathon.dev.ripplex.io:51233` |
| **Explorer** | https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/ |
| **Library** | `xrpl@4.6.0` (stable, résolu depuis `^4.4.1`) |
| **Node** | v24.14.0 |

## What it does

[3 à 5 phrases. Le problème, pour qui, et comment le Lending Protocol le résout.
Pourquoi un vault open-ended plutôt qu'un fonds fermé.]

## Team

**CY-HACK** — pseudonyme DevEx : `late-quail-92`

| Name | GitHub |
|---|---|
| | |

## Setup

```bash
git clone [url]
cd [repo]
npm install
cp .env.example .env
node scripts/check-connection.mjs   # vérifie le réseau et la version de lib
node scripts/setup-accounts.mjs     # finance lender / borrower / broker / spare
```

### Prérequis réseau — à vérifier AVANT de commencer

Le devnet hackathon n'est exposé que sur les ports **51233** (WSS) et **51234**
(RPC). Beaucoup de wifi invité et de réseaux d'entreprise ne laissent sortir que
80/443 et font timeouter ces deux ports. Tester en premier :

```bash
curl -m 10 -X POST https://lending-hackathon.dev.ripplex.io:51234 \
  -H 'Content-Type: application/json' \
  -d '{"method":"server_info","params":[{}]}'
```

Pas de réponse en 10 s → passer en partage de connexion 4G ou VPN. Il n'existe
aucun endpoint de repli en 443. Détail du diagnostic dans `FEEDBACK-RAW.md`
entrée `[12:26]`.

### DevEx hook — à installer par CHAQUE développeur, sur SA machine

Obligatoire (cf. `CLAUDE.md`). Non committé : dépôt git imbriqué + symlinks
locaux, tous deux gitignorés. Chacun refait ces deux commandes chez lui :

```bash
git clone https://github.com/RippleDevRel/xrpl-devex-hook.git
INVITE_CODE="BFT-PARIS-26" TEAM_NAME="CY-HACK" CONSENT=yes \
  node xrpl-devex-hook/hook/setup.mjs --non-interactive --agent claude-code
```

Remplacer `--agent claude-code` par `cursor`, `codex`, `grok` ou
`vscode-copilot` selon l'outil. Puis `/hooks` dans l'agent pour approuver les
hooks du projet (`/hooks-trust` sous Grok), et redémarrer la session. Vérifier
avec `node xrpl-devex-hook/hook/status.mjs` ou `/xrpl-status`.

Le consentement est individuel : `CONSENT=no` enregistre un refus et désactive
toute capture. Texte de consentement complet :
`node xrpl-devex-hook/hook/setup.mjs --show-consent`.

## Demo flow

Le minimum bar Track 1, exécuté dans l'ordre. Chaque étape a un lien explorer vérifié.

| # | Étape | Transaction(s) | Lien |
|---|---|---|---|
| 1 | Créer le vault open-ended | `VaultCreate` | |
| 2 | Dépôt du prêteur | `VaultDeposit` | |
| 3 | Créer le loan broker | `LoanBrokerSet` | |
| 3b | (Optionnel) First-loss capital | `LoanBrokerCoverDeposit` | |
| 4 | Originer le prêt (2 signatures) | `LoanSet` | |
| 5 | Drawdown | | |
| 6 | Remboursement | `LoanPay` | |
| 7 | Retrait capital + rendement | `VaultWithdraw` | |
| 8 | **Rejet par garde-fou** | | |

### Garde-fou démontré

**Type :** liquidité insuffisante / paiement hors calendrier / first-loss cover
**Code d'erreur obtenu :**
**Tx :**
**Ce que ça prouve :**

## XLS-65 / XLS-66 transactions used

<!-- Exigé explicitement à la soumission : lister CHAQUE type utilisé. -->

| Transaction | Utilisée | SDK typé | JSON brut | Note |
|---|---|---|---|---|
| `VaultCreate` | | | | |
| `VaultDeposit` | | | | |
| `VaultWithdraw` | | | | |
| `VaultDelete` | | | | |
| `LoanBrokerSet` | | | | |
| `LoanBrokerCoverDeposit` | | | | |
| `LoanBrokerCoverWithdraw` | | | | |
| `LoanSet` | | | | |
| `LoanPay` | | | | |
| `LoanManage` | | | | |
| `LoanDelete` | | | | |

## Verified on-chain transactions

[Liste des liens explorer, ou renvoi au tableau ci-dessus.]

## Developer feedback

Rapport complet : [`FEEDBACK.md`](./FEEDBACK.md)
Journal de capture brut : [`FEEDBACK-RAW.md`](./FEEDBACK-RAW.md)

Trois frictions principales :
1.
2.
3.

## Known limitations

- Ce projet tourne sur devnet. Les amendments `SingleAssetVault` et
  `LendingProtocol` ne sont pas activés sur mainnet.
- RLUSD n'est pas disponible sur devnet (Testnet uniquement) — l'actif du vault
  est [XRP / IOU émis pour la démo].
-
