# Step 17 — Configuration, Environment & Production Readiness

## Contexte

DevLens dispose maintenant d'un cœur fonctionnel fortement stabilisé.

Les Steps précédents ont couvert :

- domaine et lifecycle ;
- crawler et snapshot ;
- detector pipeline ;
- catalog ;
- evidence ;
- deduplication ;
- scoring ;
- golden fixtures ;
- production detector ;
- repositories ;
- persistence ;
- Web/Worker parity ;
- API contract ;
- validation ;
- SSRF boundary.

État actuel :

```text
pnpm test
→ 842 passed
→ 9 skipped
```

Architecture :

```text
apps/web
apps/worker

        ↓

application

        ↓

{ crawler, detectors }

        ↓

core

        ↓

database
```

Le système est maintenant suffisamment stable pour effectuer un audit de **configuration et readiness production**.

---

# Objectif

Auditer la manière dont DevLens gère :

- configuration ;
- variables d'environnement ;
- valeurs par défaut ;
- configuration Web ;
- configuration Worker ;
- configuration database ;
- comportement development/test/production ;
- secrets ;
- timeouts ;
- limites opérationnelles ;
- logging ;
- erreurs de configuration ;
- documentation de déploiement.

Le but n'est pas de créer une plateforme d'infrastructure.

> **Un système correct doit également rester correct lorsqu'il quitte l'environnement de développement.**

---

# 1. Audit de configuration existante

Commencer par rechercher exhaustivement :

```text
process.env
NEXT_PUBLIC_
DATABASE_URL
NODE_ENV
hardcoded URLs
hardcoded ports
hardcoded timeouts
hardcoded limits
hardcoded credentials
```

Identifier :

- toutes les variables réellement utilisées ;
- où elles sont consommées ;
- leur valeur attendue ;
- si elles sont obligatoires ou optionnelles ;
- leurs defaults ;
- leur type ;
- leur environnement cible.

Construire une table :

| Variable | Consumer | Required | Default | Validation | Secret |
| -------- | -------- | -------- | ------- | ---------- | ------ |
| ...      | ...      | ...      | ...     | ...        | ...    |

Ne rien modifier simplement parce qu'une valeur est hardcodée.

Chaque valeur doit être classifiée :

1. véritable configuration ;
2. constante métier ;
3. constante technique ;
4. valeur de test ;
5. valeur qui devrait réellement être configurable.

---

# 2. `@devlens/config`

Le repository contient déjà :

```text
packages/config
```

Auditer son rôle actuel.

Déterminer :

- s'il est réellement utilisé ;
- ce qu'il expose ;
- quelles responsabilités lui appartiennent ;
- si certaines configurations sont encore dispersées dans `apps/*`.

Si `@devlens/config` est un stub ou partiellement inutilisé, ne pas le transformer en framework de configuration.

Créer uniquement une API minimale si l'audit démontre un besoin réel.

Objectif :

```text
configuration
     ↓
@devlens/config
     ↓
apps / infrastructure
```

Mais ne pas forcer le domaine ou les packages purs à dépendre de configuration runtime.

---

# 3. Environment validation

Vérifier le comportement lorsqu'une variable obligatoire est :

- absente ;
- vide ;
- whitespace-only ;
- invalide ;
- mal typée.

La configuration invalide doit échouer **au bon boundary**.

Par exemple :

```text
application startup
        ↓
load configuration
        ↓
validate
        ↓
start
```

et non :

```text
request
  ↓
random process.env access
  ↓
runtime failure
```

Éviter cependant un chargement global qui rendrait tous les tests unitaires dépendants d'un `.env`.

---

# 4. Database configuration

Auditer :

- `DATABASE_URL` ;
- création du client Postgres ;
- Drizzle ;
- repository PostgreSQL ;
- connection lifecycle ;
- comportement si la configuration est absente ;
- comportement si la connection échoue.

Vérifier qu'une application qui nécessite PostgreSQL ne démarre pas avec une configuration silencieusement invalide.

Ne pas introduire :

- connection pool framework ;
- ORM supplémentaire ;
- abstraction database supplémentaire ;
- migration framework supplémentaire.

Drizzle/Postgres reste la source actuelle.

---

# 5. Web configuration

Auditer `apps/web`.

Vérifier :

- configuration Next.js ;
- runtime ;
- variables nécessaires ;
- port ;
- configuration production ;
- headers/configuration sécurité existants ;
- comportement sans variables optionnelles.

Vérifier qu'aucun secret n'est exposé via :

```text
NEXT_PUBLIC_*
```

ou via le bundle client.

Ne pas ajouter de configuration client si aucune fonctionnalité client ne le nécessite.

---

# 6. Worker configuration

Auditer `apps/worker`.

Vérifier :

- démarrage ;
- variables nécessaires ;
- database ;
- configuration crawler ;
- comportement si configuration invalide ;
- exit code en cas d'erreur de startup ;
- distinction startup failure / scan failure.

Un problème de configuration du Worker ne doit pas être transformé en :

```text
scan failed
```

si aucun scan n'a réellement commencé.

---

# 7. Crawler operational configuration

Auditer les paramètres opérationnels existants :

- timeout ;
- maximum response size ;
- resource limits ;
- number of resources ;
- redirects ;
- HTTP behavior ;
- concurrency éventuelle ;
- user-agent ;
- blocked hostnames.

Pour chaque valeur :

```text
hardcoded constant
        ↓
is this domain behavior?
        ↓
or operational configuration?
```

Ne rendre configurable que les paramètres dont la variation est réellement utile en production.

Ne pas transformer chaque constante en environment variable.

---

# 8. Security configuration audit

Rechercher :

- secrets hardcodés ;
- credentials ;
- API keys ;
- tokens ;
- database URLs commitées ;
- unsafe logging ;
- sensitive headers ;
- response leakage.

Inspecter notamment :

```text
.env
.env.*
*.example
README
docs
fixtures
tests
```

Les fixtures de tests peuvent contenir des valeurs fictives, mais elles doivent être clairement non sensibles.

Ne jamais déplacer un secret réel dans une fixture ou documentation.

---

# 9. Logging / error observability

Auditer les logs actuels.

Identifier :

- `console.log`
- `console.error`
- `console.warn`
- stack traces ;
- URLs complètes ;
- request bodies ;
- headers ;
- database errors.

Objectif minimal :

- erreurs startup identifiables ;
- erreurs scan identifiables ;
- erreurs infrastructure identifiables ;
- aucune donnée sensible inutilement loggée.

Ne pas installer un système de logging externe.

Si le logging actuel est suffisant, le conserver.

---

# 10. Environment parity

Comparer conceptuellement :

```text
development
test
production
```

Vérifier notamment :

- configuration database ;
- crawler ;
- API ;
- Worker ;
- build ;
- variables runtime.

Identifier les comportements qui pourraient fonctionner en test mais échouer en production.

Ne pas chercher à reproduire entièrement Kubernetes/Docker/cloud infrastructure.

L'audit doit rester au niveau application.

---

# 11. Configuration tests

Ajouter uniquement les tests nécessaires.

Couvrir si pertinent :

### Valid configuration

```text
load(valid env)
→ expected config
```

### Missing required configuration

```text
load({})
→ explicit configuration error
```

### Invalid configuration

```text
load({ DATABASE_URL: invalid })
→ explicit configuration error
```

### Defaults

Vérifier les defaults uniquement lorsqu'ils existent réellement.

### Secret isolation

Vérifier que les secrets ne sont pas exposés dans les configurations publiques/clientes.

Ne pas écrire des tests artificiels simplement pour augmenter le nombre de tests.

---

# 12. Startup behavior

Auditer les entrypoints :

```text
apps/web
apps/worker
```

Déterminer précisément :

- quand la configuration est chargée ;
- quand elle est validée ;
- quand la DB est initialisée ;
- quand le process commence à accepter du travail.

Identifier les éventuels effets de bord au niveau module.

Préférer :

```text
startup
  ↓
configuration
  ↓
dependencies
  ↓
runtime
```

plutôt que des side effects implicites à l'import.

Ne pas effectuer de refactor massif si l'architecture actuelle est saine.

---

# 13. Documentation

Mettre à jour uniquement les documents pertinents.

Créer si nécessaire :

```text
docs/architecture/configuration.md
```

Le document doit expliquer :

- sources de configuration ;
- variables ;
- defaults ;
- validation ;
- Web ;
- Worker ;
- database ;
- distinction runtime configuration / domain constants ;
- secrets ;
- startup behavior.

Créer également :

```text
docs/Step17-report.md
```

Le rapport doit contenir :

1. Executive Summary
2. Configuration inventory
3. `@devlens/config` audit
4. Environment validation
5. Database configuration
6. Web configuration
7. Worker configuration
8. Crawler operational configuration
9. Security audit
10. Logging audit
11. Environment parity
12. Changes made
13. Deferred findings
14. Validation results

---

# Contraintes strictes

## Ne pas faire

- pas de nouveau framework de configuration ;
- pas de nouvelle librairie de validation si une solution existante suffit ;
- pas de logging SaaS ;
- pas de telemetry platform ;
- pas de Dockerisation ;
- pas de Kubernetes ;
- pas de cloud infrastructure ;
- pas de queue ;
- pas de retry framework ;
- pas de changement du detector pipeline ;
- pas de changement du scoring ;
- pas de nouveau detector ;
- pas de nouvelle technologie ;
- pas de nouveau evidence type ;
- pas de changement API ;
- pas de changement du lifecycle ;
- pas de refactor massif.

## Règle principale

**Audit first, configuration second.**

Une constante technique n'est pas automatiquement une variable d'environnement.

Ne rendre configurable que ce qui possède une justification opérationnelle réelle.

---

# Validation finale obligatoire

Exécuter :

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps
```

Comparer le nombre de tests avant/après.

Le rapport doit explicitement indiquer :

- configuration ajoutée ;
- configuration existante conservée ;
- valeurs rendues configurables ;
- valeurs volontairement laissées constantes ;
- problèmes réellement corrigés ;
- findings différés ;
- éventuels changements de startup behavior ;
- confirmation que le detector engine reste inchangé.

## Critère de réussite

À la fin du Step 17 :

- Web et Worker disposent d'une configuration explicite ;
- les variables obligatoires sont validées au bon boundary ;
- aucune configuration sensible n'est accidentellement exposée ;
- les defaults sont documentés ;
- les constantes métier/techniques restent correctement distinguées ;
- les erreurs de configuration sont explicites ;
- le comportement production ne dépend plus de valeurs implicites non documentées ;
- aucune architecture inutile n'a été ajoutée.
