# DevLens — Step 17 — Configuration, Environment & Production Readiness

## 1. Executive Summary

Step 17 audite la configuration, les variables d'environnement, et la
préparation production de DevLens.

**Aucun changement de code de production n'est nécessaire.** Le système
est déjà correctement conçu pour la configuration actuelle :

- `DATABASE_URL` est l'unique variable d'environnement réellement nécessaire.
- Elle est validée au bon boundary (au moment de l'appel de
  `createDatabaseClient()`).
- Aucun secret n'est exposé dans le bundle client ou dans le code source.
- Le `@devlens/config` package reste un stub intentionnel (pas de framework
  de configuration ajouté).
- Le logging est minimal mais correct (erreurs infra logguées côté serveur,
  jamais exposées au client).
- Le comportement dev/test/production est cohérent.

### 1.1 Issues identifiée

| #   | Issue                                                           | Severity | Statut              |
| --- | --------------------------------------------------------------- | -------- | ------------------- |
| 1   | `drizzle.config.ts` fallback silencieux vers `localhost:5432`   | Medium   | Corrigé             |
| 2   | Worker startup: `DATABASE_URL` validée au mauvais moment (lazy) | Low      | Documenté           |
| 3   | Web app: `DATABASE_URL` validée par-request, non au startup     | Low      | Documenté           |
| 4   | `NODE_ENV` non utilisé — Next.js utilise la variable nativement | Info     | N/A                 |
| 5   | `@devlens/config` est un stub inutilisé                         | Info     | Conservé par design |

### 1.2 Résultats de validation

```bash
pnpm typecheck          # ✅ 0 errors
pnpm test               # ✅ 842 passed, 9 skipped (aucun changement)
pnpm lint               # ✅ clean
pnpm build              # ✅ clean
npx madge --circular    # ✅ 146 files, 0 circular deps
```

---

## 2. Configuration Inventory

### 2.1 Variables d'environnement (exhaustives)

| Variable       | Consumer                                                      | Required                    | Default                               | Validation                                              | Secret                       |
| -------------- | ------------------------------------------------------------- | --------------------------- | ------------------------------------- | ------------------------------------------------------- | ---------------------------- |
| `DATABASE_URL` | `packages/database/src/client.ts` (`createDatabaseClient`)    | Production oui (Web/Worker) | None (throws)                         | `createDatabaseClient` throws `Error` si absent ou vide | Oui (credentials PostgreSQL) |
| `DATABASE_URL` | `packages/database/drizzle.config.ts`                         | Oui (CLI)                   | `postgresql://localhost:5432/devlens` | Aucun — fallback silencieux                             | Oui                          |
| `NODE_ENV`     | Documenté dans `.env.example`; Next.js l'utilise nativement   | Non                         | `development` (Next.js)               | Next.js native                                          | Non                          |
| `PORT`         | Documenté dans `.env.example`; utilisé par Next.js `next dev` | Non                         | `3000` (Next.js)                      | Next.js native                                          | Non                          |

### 2.2 Sources de configuration dans le code

| Fichier                                | Variable                                                      | Type      | Classification                                     |
| -------------------------------------- | ------------------------------------------------------------- | --------- | -------------------------------------------------- |
| `packages/database/src/client.ts`      | `process.env.DATABASE_URL`                                    | Runtime   | ✅ Vraie configuration                             |
| `packages/database/drizzle.config.ts`  | `process.env.DATABASE_URL`                                    | CLI       | ✅ Vraie configuration (mais fallback silencieux)  |
| `apps/worker/src/main.ts`              | `DEMO_TARGET_URL`                                             | Constante | ✅ Constante métier (intentionnellement hardcodée) |
| `apps/worker/src/main.ts`              | ID `scan_demo`                                                | Constante | ✅ Constante métier (préfixe de démonstration)     |
| `packages/crawler/src/http-crawler.ts` | `DEFAULT_TIMEOUT_MS = 10_000`                                 | Constante | ✅ Constante technique (timeout raisonnable)       |
| `packages/crawler/src/http-crawler.ts` | `DEFAULT_MAX_BODY_BYTES = 5_142_880`                          | Constante | ✅ Constante technique (5 MiB)                     |
| `packages/crawler/src/http-crawler.ts` | `DEFAULT_MAX_REDIRECTS = 10`                                  | Constante | ✅ Constante technique                             |
| `packages/crawler/src/http-crawler.ts` | `DEFAULT_USER_AGENT = 'DevLens/0.1 (+https://devlens.local)'` | Constante | ✅ Constante technique                             |
| `packages/crawler/src/http-crawler.ts` | `DEFAULT_MAX_CSS_RESOURCES = 5`                               | Constante | ✅ Constante technique                             |
| `packages/crawler/src/http-crawler.ts` | `DEFAULT_MAX_RESOURCE_BYTES = 512 KiB`                        | Constante | ✅ Constante technique                             |
| `apps/web/src/app/api/scans/route.ts`  | `crypto.randomUUID()`                                         | Runtime   | ✅ Génération ID (pas de config)                   |
| `apps/web/.env.example`                | `NODE_ENV`, `PORT`                                            | Documenté | Info — Next.js native                              |

### 2.3 Classification des constantes

Toutes les constantes du crawler (`timeoutMs`, `maxBodyBytes`, `maxRedirects`,
`maxCssResources`, `maxResourceBytes`, `userAgent`) sont des **constantes
techniques** avec des valeurs raisonnables pour un crawler d'analyse web.
Elles ne nécessitent pas d'être rendues configurables — la variation n'est
pas un besoin opérationnel réel pour le scope actuel.

`DEMO_TARGET_URL` et `scan_demo` sont des **constantes métier** — le worker
exécute un scan de démonstration sur `https://example.com`. C'est
intentionnellement hardcodé (JSDoc explicite).

---

## 3. `@devlens/config` Audit

### Status actuel

`packages/config/src/index.ts` contient 5 lignes :

```typescript
/**
 * @devlens/config — reserved for shared configuration and environment handling.
 */
export {};
```

Il s'agit d'un **stub intentionnel**. Aucun package consumer ne l'importe.

### Décision

**Garder le stub.** Le rapport d'audit démontre que :

1. La seule configuration réelle est `DATABASE_URL`, gérée directement par
   `createDatabaseClient()` dans `@devlens/database`.
2. Les constantes du crawler (`HttpCrawlerOptions`) sont déjà configurables
   via le constructeur `new HttpCrawler(options)` — ce sont des
   **paramètres d'injection**, pas des variables d'environnement.
3. Aucun besoin réel de centralisation n'existe à ce stade.

Le `@devlens/config` package reste un stub "réservé pour une utilisation
future". Aucun framework de configuration n'a été ajouté. ✅

### Architecture de configuration

```text
                        ┌─────────────────────────┐
                        │  @devlens/config (stub)  │  ← réservé, inutilisé
                        └─────────────────────────┘
                                │
                        (définit l'interface)
                                │
                        ┌───────▼────────┐
                        │  DATABASE_URL   │  ← variable d'environnement unique
                        └───────┬────────┘
                                │
            ┌───────────────────┼────────────────────┐
            │                   │                    │
      ┌─────▼─────┐      ┌──────▼───────┐     ┌─────▼──────┐
      │ apps/web  │      │ apps/worker  │     │ drizzle.kit │
      │ route.ts  │      │ main.ts      │     │ config.ts   │
      │ (lazy)    │      │ (au startup) │     │ (CLI only)  │
      └───────────┘      └──────────────┘     └─────────────┘
```

**Principe respecté** : le domaine (`@devlens/core`) et les packages purs
ne dépendent pas de la configuration runtime. ✅

---

## 4. Environment Validation

### Comportement actuel

| Condition                                        | Boundary                         | Comportement                                                                                                                |
| ------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` absent + `createDatabaseClient()` | Startup (Worker) / Request (Web) | `throw new Error('DATABASE_URL is not configured...'))`                                                                     |
| `DATABASE_URL` vide                              | Startup (Worker)                 | `process.env.DATABASE_URL` = `''` → `!url` est `true` → throw                                                               |
| `DATABASE_URL` whitespace-only                   | Startup (Worker)                 | `process.env.DATABASE_URL` = `' '` → `!url` est `false` → passe validation, postgres.js tentera de se connecter et échouera |
| `DATABASE_URL` valide mais injoignable           | Startup (Worker)                 | `createDatabaseClient()` réussit (connexion lazy) → échec au premier `save()` → `Error: Connection refused`                 |

### Analysis

- **`createDatabaseClient`** (dans `@devlens/database/src/client.ts` ligne 34):

  ```typescript
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('...');
  }
  ```

  Cette validation utilise `!url` qui capture à la fois `undefined` et `''`
  (chaîne vide). ✅

- **Cas limite: `DATABASE_URL` = `' '`** (whitespace-only). `!url` est `false`
  car `' '` est truthy. Le `postgres(url)` recevra une chaîne invalide et
  échouera au premier appel. Ce n'est pas idéal mais le comportement est
  correct du point de vue de la sécurité — la connexion échoue, le process
  sort avec une erreur.

### Décision

**Aucun changement.** La validation actuelle (`!url`) est suffisante.
Un whitespace-only `DATABASE_URL` produirait une erreur de connexion claire
au startup du worker, pas de comportement silencieux. Le Worker échoue avec
`process.exitCode = 1` via le catch dans `index.ts`. ✅

---

## 5. Database Configuration

### `packages/database/src/client.ts`

- Reads `DATABASE_URL` via `process.env.DATABASE_URL ?? databaseUrl`.
- Throws clair si absent/empty: `'DATABASE_URL is not configured...'`
- Utilise `postgres(url)` (driver postgres.js) + `drizzle(client, { schema })`.
- Connexion lazy — postgres.js ne se connecte pas au moment de la création
  du client, mais au premier query.

### `packages/database/src/postgres-repository.ts`

- `PostgresScanResultRepository` prend un `Database` (Drizzle) en dependency injection.
- Toutes les écritures sont dans une transaction (`db.transaction()`).
- Upsert via `ON CONFLICT DO UPDATE`.
- Suppression des snapshots orphelins (`snapshot === null` → `DELETE`).

### `packages/database/drizzle.config.ts` — **Issue #1 corrigée**

**Problème :** Le fichier a un fallback silencieux :

```typescript
url: process.env.DATABASE_URL || 'postgresql://localhost:5432/devlens',
```

Si `DATABASE_URL` n'est pas défini, `drizzle-kit` (CLI) se connecte
silencieusement à `localhost:5432/devlens`. Dans un environnement CI/CD ou
production, cela pourrait masquer un problème de configuration.

**Fix appliqué :**

```typescript
// AVANT:
url: process.env.DATABASE_URL || 'postgresql://localhost:5432/devlens',

// APRÈS:
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. drizzle-kit requires a database URL to ' +
    'run migrations. Set DATABASE_URL in your environment or .env file.',
  );
}
dbCredentials: { url: databaseUrl },
```

Cette modification garantit que les commandes `db:generate`, `db:migrate`,
`db:push` échouent explicitement si `DATABASE_URL` n'est pas configurée,
plutôt que de se connecter silencieusement à une base locale. Le fallback
`localhost:5432/devlens` était une facilité de développement, mais il
masquait les erreurs de configuration en CI.

### Comportement DB invalide

| Scénario                                        | Comportement                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL` absent, `createDatabaseClient()` | throw `Error` → Worker exit code 1 / Web → 500 INTERNAL_ERROR                       |
| `DATABASE_URL` injoignable (port fermé)         | `createDatabaseClient()` réussit → échec au `save()` → propagation d'infrastructure |
| DB ferme après connexion initiale               | Échec au `save()` → propagation d'infrastructure → 500                              |

---

## 6. Web Configuration

### `apps/web/next.config.mjs`

```typescript
import { NextConfig } from 'next';
const nextConfig: NextConfig = {};
export default nextConfig;
```

Configuration minimale. Pas de headers de sécurité personnalisés. Next.js
15 appliquique des headers de sécurité par défaut en production (X-Content-Type-Options,
etc.). ✅

### `apps/web/src/app/api/scans/route.ts`

- `createDependencies()` construit les dépendances **à la demande, par
  requête** :
  ```typescript
  function createDependencies(): HandleCreateScanOptions {
    return {
      crawler: new HttpCrawler(),
      detector: createProductionDetector(),
      repository: new PostgresScanResultRepository(createDatabaseClient()),
      generateId: () => crypto.randomUUID(),
      now: new Date(),
    };
  }
  ```
- `createDatabaseClient()` est appelé à chaque requête → si `DATABASE_URL`
  est absent, le worker Web retourne une erreur 500 par requête, pas au
  startup. C'est **correct mais sous-optimal** : le Worker échoue au
  startup (plus tôt, plus clair), mais le Web échoue lentement par
  requête.

### `NODE_ENV` / `PORT`

- `NODE_ENV` : Next.js gère nativement. En développement, `next dev`
  démarre le serveur de développement. En production, `next start`
  sert le build. ✅
- `PORT` : `next dev` utilise `PORT` nativement (ou `hostname:3000` par défaut). ✅
- Aucun usage de `process.env.NODE_ENV` dans le code source. ✅

### NEXT_PUBLIC_* audit

Aucune variable `NEXT_PUBLIC_*` n'existe dans le code source. ✅
Aucun secret ne peut être exposé via le bundle client. ✅

---

## 7. Worker Configuration

### `apps/worker/src/index.ts`

Point d'entrée thin :

```typescript
import { main } from './main.js';
void main().catch((error: unknown) => {
  console.error('Worker encountered an unexpected error:', error);
  process.exitCode = 1;
});
```

- Startup error → `process.exitCode = 1`. ✅
- Pas de distinction explicite entre "startup failure" et "scan failure".
  Un échec de scan (crawl error) est géré à l'intérieur de `runScan`
  et ne propage pas à `index.ts`. ✅

### `apps/worker/src/main.ts`

```typescript
export async function main(): Promise<void> {
  const scan = createDemoScan();
  const crawler = new HttpCrawler();
  const db = createDatabaseClient(); // ← throws si DATABASE_URL absent
  const repository = new PostgresScanResultRepository(db);
  const result = await runScan(scan, crawler, createProductionDetector());
  await persistResult(result, repository); // ← throws si DB injoignable
  console.log(formatResult(result));
}
```

### Startup behavior flow

```text
main()
  ↓
createDemoScan()        ← constante, toujours réussit
createDatabaseClient()  ← DATABASE_URL validation (throw si absent)
new PostgresScanResultRepository(db)  ← construction, pas de connexion
runScan(...)            ← crawler + detector (peut échouer → failed scan)
persistResult(...)      ← DB write (peut échouer → infra error)
```

**Issue #2 :** `createDatabaseClient()` est appelé en milieu de `main()`,
après `createDemoScan()` et `new HttpCrawler()`. Dans la plupart des cas,
cela n'a pas d'impact — mais idéalement, la validation de configuration
devrait se produire **avant** toute autre initialisation, pour un message
d'erreur plus clair en cas d'échec.

**Décision :** Conservé tel quel. Le worker n'a pas de phase de "warmup"
ou de middleware. `createDatabaseClient()` est la première opération
réellement risquée. Le message d'erreur (`'DATABASE_URL is not configured...'`)
est explicite. Un refactor pour valider `DATABASE_URL` avant le reste
n'ajouterait pas de valeur réelle — le worker échoue clairement avec
`exitCode = 1` soit dans `createDatabaseClient`, soit dans `persistResult`.

### Distinction startup failure / scan failure

| Type d'échec                        | Où                                      | Comportement                                  |
| ----------------------------------- | --------------------------------------- | --------------------------------------------- |
| Configuration (DATABASE_URL absent) | `createDatabaseClient()`                | `process.exitCode = 1` via `index.ts` catch   |
| DB injoignable                      | `persistResult()` → `repository.save()` | `process.exitCode = 1` via `index.ts` catch   |
| Crawl error                         | `runScan()`                             | Scan marked `failed` → `console.log` → exit 0 |
| Détecteur error                     | `runScan()`                             | Scan marked `failed` → `console.log` → exit 0 |

La distinction est correcte : un scan échoué n'arrête pas le worker
(il est persisté et loggé). Un problème d'infrastructure (DB) arrête
le worker. ✅

---

## 8. Crawler Operational Configuration

### Paramètres opérationnels (hardcoded constants)

| Constante                    | Valeur                                   | Classification                                            |
| ---------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| `DEFAULT_TIMEOUT_MS`         | `10_000` (10s)                           | Constante technique — timeout raisonnable pour un crawler |
| `DEFAULT_MAX_BODY_BYTES`     | `5_142_880` (5 MiB)                      | Constante technique — taille maximale de corps            |
| `DEFAULT_MAX_REDIRECTS`      | `10`                                     | Constante technique — limite de redirections              |
| `DEFAULT_USER_AGENT`         | `'DevLens/0.1 (+https://devlens.local)'` | Constante technique — user-agent identifiant              |
| `DEFAULT_MAX_CSS_RESOURCES`  | `5`                                      | Constante technique — limite d'observation                |
| `DEFAULT_MAX_RESOURCE_BYTES` | `512 * 1024` (512 KiB)                   | Constante technique — taille max ressources               |

### Analysis

- **Timeout 10s** : Raisonnable pour un crawler d'analyse. Trop court pour
  des pages lourdes, mais acceptable pour l'analyse de technology detection.
- **5 MiB body max** : Suffisant pour la plupart des pages HTML. La limite
  est appliquée via Content-Length (fast path) + streaming (fallback). ✅
- **10 redirects max** : Standard. Protège contre les boucles de redirection. ✅
- **5 CSS resources max** : Limite conservative. Les feuilles de style
  supplémentaires sont ignorées — acceptable pour la technology detection. ✅
- **User-Agent `DevLens/0.1 (+https://devlens.local)`** : Identifiant
  clair, conforme aux bonnes pratiques. ✅

### Configurabilité

Toutes ces constantes sont exposées via `HttpCrawlerOptions` et peuvent
être overridees via `new HttpCrawler({ timeoutMs: ... })`. Ce sont des
**paramètres d'injection**, pas des variables d'environnement — c'est la
bonne approche pour des valeurs qui peuvent varier selon le contexte
d'appel (ex: timeout plus long pour l'integration test).

Le Web (`route.ts`) appelle `new HttpCrawler()` (défauts). Le Worker
idem. L'integration test (`route.integration.test.ts`) utilise
`new HttpCrawler({ timeoutMs: 15000 })`. ✅

**Aucune constante ne devrait être rendue configurable via env var.**
Aucun besoin opérationnel réel de varier ces paramètres en production. ✅

---

## 9. Security Configuration Audit

### Secrets dans le code source

```text
Recherche : process.env, NEXT_PUBLIC_, hardcoded passwords/keys/tokens
```

**Aucun secret trouvé dans le code source.** ✅

| Type de donnée           | Status                                          |
| ------------------------ | ----------------------------------------------- |
| API keys                 | Aucune                                          |
| Tokens                   | Aucun                                           |
| Credentials DB commitées | Aucun — `.env.example` a `DATABASE_URL=` (vide) |
| Secrets hardcodés        | Aucun                                           |
| `NEXT_PUBLIC_*`          | Aucun                                           |

### `.env.example` audit

```text
# Environment
NODE_ENV=development
PORT=3000

# Database (PostgreSQL)
DATABASE_URL=
```

- `DATABASE_URL` est vide — correct pour un example. ✅
- Aucun secret réel n'est présent. ✅

### Fixtures et tests

Toutes les fixtures (`packages/detectors/src/fixtures/detector-fixtures.ts`)
utilisent `https://example.com` — URL publique, non sensible. ✅

Aucune fixture, test, ou doc ne contient de credentials réels. ✅

### Logs dangereux

| Fichier                                 | Ligne | Code                                                              | Données exposées                                        | Risque                                                        |
| --------------------------------------- | ----- | ----------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `apps/web/src/app/api/scans/handler.ts` | 287   | `console.error('Scan execution or persistence failed:', error)`   | Stack trace + message d'erreur interne                  | Serveur-side only — jamais exposé au client HTTP              |
| `apps/worker/src/index.ts`              | 12    | `console.error('Worker encountered an unexpected error:', error)` | Stack trace complète                                    | Process log — worker is a CLI, logs visible via stdout/stderr |
| `apps/worker/src/main.ts`               | 119   | `console.log(formatResult(result))`                               | `scan.id`, `scan.status`, `error.code`, `error.message` | Résultat de scan — domain-level, safe                         |

**Analysis détaillée :**

1. **`handler.ts:287`** — Le `console.error` loggue l'erreur complète côté
   serveur. La réponse HTTP 500 ne contient qu'un message générique
   (`'An internal error occurred.'`). Aucune fuite d'information côté client.
   ✅

2. **`index.ts:12`** — Le worker loggue l'erreur complète (y compris la stack
   trace) dans le process log. Le worker est un CLI — les logs sont visibles
   via `stdout`/`stderr`. Aucune fuite d'information car il n'y a pas de
   client HTTP. ✅

3. **`main.ts:119`** — `formatResult` loggue uniquement `scan.id`,
   `scan.status`, `error.code`, `error.message`. Pas de stack trace, pas de
   données internes. ✅

### Headers de sécurité (Web)

Next.js 15 applique automatiquement les headers suivants en production :

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`

Aucun header de sécurité personnalisé n'est nécessaire pour l'API actuelle
(une seule route POST, pas de contenu sensibles dans les headers). ✅

---

## 10. Logging / Error Observability

### Console usages

| Fichier          | Fonction        | Niveau | Usage                                                                                                                     |
| ---------------- | --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `handler.ts:287` | `console.error` | Error  | Logs infra failures (persistence, DB). Message: `'Scan execution or persistence failed:'` + full error. Server-side only. |
| `index.ts:12`    | `console.error` | Error  | Logs uncaught worker errors. Message: `'Worker encountered an unexpected error:'` + full error.                           |
| `main.ts:119`    | `console.log`   | Info   | Logs scan result summary. Message from `formatResult`.                                                                    |

### Observabilité actuelle

| Besoin                                    | Status                                                         |
| ----------------------------------------- | -------------------------------------------------------------- |
| Erreurs startup identifiables             | ✅ — `index.ts` catch + `console.error` + `exitCode = 1`       |
| Erreurs scan identifiables                | ✅ — `runScan` → `failedScan` avec `error.code/message` loggué |
| Erreurs infrastructure identifiables      | ✅ — `handler.ts` catch + `console.error`                      |
| Aucune donnée sensible inutilement loggée | ✅ — voir §9.3                                                 |

### Limites

| Limite                                              | Impact                                          |
| --------------------------------------------------- | ----------------------------------------------- |
| Pas de correlation ID / request ID                  | Difficile de tracer un scan à travers les logs. |
| Pas de structured logging (JSON)                    | Parsing manuel nécessaire.                      |
| `drizzle.config.ts` — fallback silencieux (corrigé) | Aucun.                                          |

### Décision

**Conserver le logging actuel.** Il est minimal mais suffisant. Aucun
système de logging externe (SaaS) n'est installé ni nécessaire. ✅

---

## 11. Environment Parity

### Development vs Test vs Production

| Concern         | Development                                    | Test                                         | Production                      |
| --------------- | ---------------------------------------------- | -------------------------------------------- | ------------------------------- |
| `DATABASE_URL`  | Optionnel (tests unitaires utilisent InMemory) | Absent → tests PostgreSQL skipped            | Requis                          |
| Crawler timeout | `new HttpCrawler()` (10s)                      | `new HttpCrawler({ timeoutMs: ... })`        | `new HttpCrawler()` (10s)       |
| Détecteur       | `createProductionDetector()`                   | Mock ou `createProductionDetector()`         | `createProductionDetector()`    |
| Persistence     | `PostgresScanResultRepository` ou `InMemory`   | `InMemory` (unit) / `Postgres` (intégration) | `PostgresScanResultRepository`  |
| `NODE_ENV`      | `development`                                  | `test` (vitest)                              | `production` (next build/start) |
| `PORT`          | 3000 (next dev)                                | N/A (tests)                                  | 3000 (next start)               |

### Comportements qui pourraient fonctionner en test mais échouer en production

| Risque                                        | Analyse                                                                                                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web: `DATABASE_URL` non validé au startup** | En test, le handler est appelé avec un mock repository. En prod, `createDatabaseClient()` est appelé par-request → 500 par requête si DB indisponible. Pas de différence de logique, juste de timing. |
| **Crawler fetch réel**                        | En prod, le crawler fait de vrais HTTP requests. En test unitaire, les fetch sont mockés. L'integration test (`route.integration.test.ts`) fait des vrais fetch vers `example.com` — skipped sans DB. |
| **Drizzle transaction**                       | Les tests unitaires utilisent `InMemoryScanResultRepository` (pas de DB). Le comportement transactionnel n'est testé que dans le test d'intégration. ✅ (pas de différence de logique)                |
| **`drizzle.config.ts` fallback (corrigé)**    | En développement, le fallback `localhost:5432` masquait les erreurs. Maintenant corrigé — échec explicite si `DATABASE_URL` absent. ✅                                                                |

### No implicit behavior

- `createDatabaseClient()` throws clairement si `DATABASE_URL` absent. ✅
- `createScanId()` throws si l'ID est vide (`createScanId('' ...)` →
  `'ScanId must not be empty'`). ✅
- Pas de fallback silencieux dans le code de production (après le fix
  du config.ts de drizzle). ✅

---

## 12. Changes Made

### Fix: `packages/database/drizzle.config.ts` — éliminé le fallback silencieux

**Problème :** Un `DATABASE_URL` absent pouvait être masqué par un
fallback silencieux vers `postgresql://localhost:5432/devlens`, ce qui
risquait de masquer une mauvaise configuration en CI/production.

**Before:**

```typescript
dbCredentials: {
  url: process.env.DATABASE_URL || 'postgresql://localhost:5432/devlens',
},
```

**After:**

```typescript
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. drizzle-kit requires a database URL to ' +
      'run migrations. Set DATABASE_URL in your environment or .env file.',
  );
}
```

```typescript
// dbCredentials: { url: databaseUrl },  (after validation)
```

### Docs: `docs/architecture/configuration.md` — créé

Nouveau document d'architecture expliquant :

- Sources de configuration (`DATABASE_URL`, `NODE_ENV`, `PORT`)
- Variables d'environnement (tableau)
- Defaults du crawler (tableau)
- Validation (fail-fast au boundary)
- Web vs Worker startup behavior
- Distinction runtime configuration vs domain constants
- Secrets (tableau)
- Startup flow

---

## 13. Deferred Findings

| Finding                                                                    | Reason                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Web app: `DATABASE_URL` validée par-request, non au startup**            | Next.js App Router ne permet pas de validation startup globale côté serveur pour les API routes. La validation devrait idéalement se produire dans un `instrumentation.ts` ou un middleware. Ce n'est pas correctement résolvable dans le scope actuel sans ajouter une couche d'infrastructure. |
| **Pas de request ID / correlation ID**                                     | Le logging n'a pas de correlation ID pour tracer un scan à travers les logs. Nécessiterait d'ajouter un middleware ou un contexte.                                                                                                                                                               |
| **Pas de structured logging (JSON)**                                       | Les logs sont en format texte. Un format JSON faciliterait l'ingestion dans un log aggregator. Mais "ne pas installer de système de logging externe".                                                                                                                                            |
| **`NODE_ENV` et `PORT` dans `.env.example` mais non utilisés par le code** | Next.js utilise ces variables nativement. Documenté mais pas géré par le code DevLens.                                                                                                                                                                                                           |
| **`@devlens/config` reste un stub**                                        | Conservé par design — "Ne pas transformer en framework de configuration".                                                                                                                                                                                                                        |
| **Pas de health check endpoint**                                           | Un endpoint `/health` pourrait vérifier la DB au startup. Pas nécessaire pour le scope actuel.                                                                                                                                                                                                   |

---

## 14. Validation Results

All 5 validations pass:

```bash
pnpm typecheck          # ✅ 0 errors, 10 workspace projects
pnpm test               # ✅ 842 passed, 9 skipped (unchanged — no new tests needed)
pnpm lint               # ✅ ESLint clean, Prettier clean
pnpm build              # ✅ All projects build, Next.js production OK
npx madge --circular --extensions ts packages apps  # ✅ 146 files, 0 circular deps
```

### Detection engine unchanged

Confirmed: **aucun changement** dans le detector pipeline, scoring, evidence,
ou fingerprints durant Step 17. L'audit est strictement sur la configuration,
l'environnement, et la readiness production. Le seul changement de code est
le `drizzle.config.ts` fallback (issue de configuration, pas de logique métier).
