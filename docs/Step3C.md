Tu travailles sur le projet DevLens. Tu dois maintenant implémenter le prochain step du projet en respectant strictement l'architecture déjà validée. Ne code rien de spéculatif et ne transforme pas ce step en implémentation prématurée de fonctionnalités futures.

# CONTEXTE ARCHITECTURAL VALIDÉ

DevLens est un monorepo pnpm TypeScript strict avec notamment :

- packages/core
- packages/crawler
- packages/analyzer
- packages/detectors
- packages/database
- packages/validation
- packages/config
- apps/web
- apps/worker

Le projet utilise :

- Node.js 24
- pnpm 11+
- TypeScript strict
- ESM pour les packages libraries
- CommonJS pour l'entrée worker si déjà configuré ainsi
- ESLint 10
- Prettier
- Vitest
- Next.js pour apps/web

Contraintes déjà validées :

- pas de Tailwind
- pas de dépendances inutiles
- pas de Zod dans le core
- core sans dépendance runtime
- architecture modulaire
- domain model pur
- pas de dépendance Node/browser/HTTP dans @devlens/core
- pas de logique métier placée arbitrairement dans les applications
- pas de cycles entre packages

Avant toute modification, inspecte réellement le repository et son état actuel. Ne te fie pas uniquement à ce prompt si les fichiers ont évolué.

# ÉTAT DU DOMAIN MODEL

@devlens/core contient actuellement le domain model suivant.

## Scan

```ts
interface Scan {
  readonly id: ScanId;
  readonly target: ScanTarget;
  readonly status: ScanStatus;
  readonly createdAt: Timestamp;
}
interface ScanTarget {
  readonly url: Url;
  readonly hostname: Hostname;
}

ScanTarget représente l'intention initiale de l'utilisateur :

url = URL demandée initialement
hostname = hostname associé au target

Ces valeurs ne sont pas nécessairement identiques à l'URL finale observée après redirection.

ScanStatus
type ScanStatus =
  | { readonly type: 'pending' }
  | { readonly type: 'running'; readonly startedAt: Timestamp }
  | { readonly type: 'completed'; readonly completedAt: Timestamp }
  | {
      readonly type: 'failed';
      readonly failedAt: Timestamp;
      readonly error: ScanError;
    };

Important :
ScanStatus représente uniquement le lifecycle d'un scan.

Il NE DOIT PAS contenir SiteSnapshot.

Factories existantes :

createScan(...)
startScan(...)
completeScan(...)
failScan(...)

Transitions valides :

pending → running
running → completed
pending → failed
running → failed

Les états terminaux ne peuvent plus changer.

SiteSnapshot

SiteSnapshot est un artefact indépendant représentant une observation du site.

Il contient notamment :

url
hostname
capturedAt
http
html
resources

Il n'a pas de scanId ni de ScanStatus.

Le crawler produit ce type d'artefact.

Technology
interface Technology {
  readonly id: TechnologyId;
  readonly name: string;
  readonly category: TechnologyCategory;
}

TechnologyCategory est volontairement extensible :

type TechnologyCategory =
  string & { readonly _brand: 'TechnologyCategory' };

avec :

createTechnologyCategory(...)

Il ne faut PAS revenir à une union fermée.

Il n'existe volontairement pas encore de createTechnology().

Detection
interface Detection {
  readonly technology: Technology;
  readonly confidence: Confidence;
  readonly evidence: ReadonlyArray<Evidence>;
}

Une Detection doit avoir au moins une Evidence.

Confidence est un nombre brandé compris entre 0 et 100.

Evidence

Evidence est une discriminated union comprenant actuellement 6 types :

type Evidence =
  | { type: 'html'; selector: string; snippet: string }
  | { type: 'http_header'; name: string; value: string }
  | { type: 'script_url'; url: Url }
  | { type: 'meta_tag'; name: string; content: string }
  | { type: 'javascript_global'; globalName: string }
  | { type: 'resource'; url: Url };
Value Objects

Le core utilise des branded primitives pour :

ScanId
TechnologyId
Url
Hostname
Timestamp
Confidence
HttpStatus

Les factories valident les invariants.

Timestamp = ISO 8601 string brandée.

Les objets sont immuables avec readonly.

Pas de classes.

CRAWLER BOUNDARY DÉJÀ VALIDÉE

packages/crawler contient maintenant :

import type { ScanTarget, SiteSnapshot } from '@devlens/core';

export interface Crawler {
  crawl(target: ScanTarget): Promise<SiteSnapshot>;
}

Le package @devlens/crawler dépend maintenant de @devlens/core en dependency car les types core font partie de son API publique.

Important :
Ceci est UNIQUEMENT une abstraction.

Aucun HTTP client, Playwright, fetch, parser HTML ou autre implémentation concrète du crawler n'a encore été ajouté.

Le crawler :

reçoit ScanTarget
retourne Promise<SiteSnapshot>
peut throw en cas d'échec
ne connaît pas Scan lifecycle
ne modifie pas Scan
ne crée pas ScanError
ne persiste rien

L'application layer sera responsable de transformer une erreur de crawl en ScanError via failScan.

OBJECTIF DU PROCHAIN STEP

Tu dois maintenant déterminer et implémenter le prochain step architectural nécessaire après la création du domain model et de la boundary Crawler.

Le but est de construire la prochaine couche proprement, sans sauter directement à une grosse implémentation technique.

Avant de coder :

Inspecte le repository.
Lis les packages concernés.
Lis les tests existants.
Lis :
docs/architecture/domain-model.md
docs/architecture/overview.md
Identifie précisément ce qui existe déjà.
Vérifie qu'il n'y a pas déjà une implémentation partielle du step.
Détermine le plus petit incrément architectural cohérent.
PRINCIPLE IMPORTANT

Ne commence PAS par implémenter :

un vrai crawler HTTP
Playwright
Chromium
Puppeteer
Cheerio
JSDOM
analyse de technologies
detectors
AI
database
Redis
queues
authentication
billing
UI produit
dashboard
scraping massif

Ces fonctionnalités appartiennent à des steps ultérieurs.

Le prochain step doit d'abord établir proprement les frontières nécessaires pour permettre leur implémentation future.

ARCHITECTURE À PRÉSERVER

Respecte cette direction :

apps/web / apps/worker
        ↓
application / orchestration
        ↓
crawler / analyzer / detectors
        ↓
@devlens/core

Le domain core ne doit jamais dépendre de l'infrastructure.

Les interfaces doivent être définies au niveau approprié.

Évite :

abstractions inutiles
generic repository interfaces prématurées
services fourre-tout
god objects
dependency injection framework
event bus prématuré
Result<T,E> partout sans besoin démontré
factories inutiles
classes pour simplement encapsuler des données
configuration globale mutable
SI UNE APPLICATION LAYER EST NÉCESSAIRE

Si ton audit montre que le prochain incrément logique est une application/orchestration layer, introduis-la de manière minimale.

Son rôle doit être d'orchestrer :

create scan
    ↓
start scan
    ↓
crawler.crawl(target)
    ↓
snapshot
    ↓
complete scan

ou en cas d'erreur :

crawler.crawl(target)
    ↓
error
    ↓
fail scan

Attention :
completeScan ne reçoit PAS de snapshot.

Le snapshot doit rester un artefact séparé.

Ne crée donc pas artificiellement :

completed.status.snapshot

et ne réintroduis surtout pas le couplage supprimé lors du Step 2.1.

Si une association Scan ↔ SiteSnapshot est nécessaire, elle doit être portée par la couche application/persistence appropriée, pas par ScanStatus.

SI UNE NOUVELLE INTERFACE EST NÉCESSAIRE

Ajoute uniquement les interfaces réellement nécessaires.

Exemple de principe :

interface ScanRepository {
  save(scan: Scan): Promise<void>;
  getById(id: ScanId): Promise<Scan | null>;
}

Mais NE CRÉE PAS cette interface simplement parce qu'un repository "pourrait être utile".

Crée-la uniquement si le prochain use case en a réellement besoin.

Même règle pour :

SnapshotRepository
Clock
Logger
IdGenerator
CrawlerFactory
ScanService
ScanOrchestrator
ApplicationService

Chaque abstraction doit avoir une raison architecturale concrète.

TESTS

Chaque nouveau comportement doit être testé.

Priorité :

tests unitaires du domain/application logic
tests de contrats des interfaces
tests d'intégration uniquement si réellement nécessaires

Les tests doivent vérifier :

happy path
erreurs
transitions
absence de mutation
dépendances appelées correctement
aucun comportement implicite

Ne crée pas de tests qui testent simplement TypeScript sans valeur comportementale.

TYPESCRIPT

Respecte strictement la configuration existante, notamment :

strict
exactOptionalPropertyTypes
noUncheckedIndexedAccess
noUnusedLocals
noUnusedParameters

Utilise :

import type lorsque l'import est uniquement typé
readonly
ReadonlyArray lorsque pertinent
discriminated unions
branded types déjà existants

Évite les casts as sauf lorsqu'ils sont nécessaires dans les factories de branded types déjà établies.

Pas de any.

DÉPENDANCES

N'ajoute aucune dépendance npm sans justification forte.

Avant d'installer quoi que ce soit, demande-toi si la fonctionnalité peut être réalisée avec la stack existante.

Le core doit rester zéro runtime dependency.

Si un nouveau package devient réellement dépendant de @devlens/core en runtime ou dans son API publique, place la dépendance au bon endroit :

dependency si nécessaire en production/API
devDependency uniquement si elle est réellement utilisée uniquement pour tooling/tests
DOCUMENTATION

Mets à jour la documentation architecture uniquement pour documenter les décisions réellement prises.

Si un nouveau concept architectural est introduit :

explique son rôle
explique pourquoi il existe
explique ce dont il dépend
explique ce dont il ne dépend pas
indique clairement ce qui est volontairement différé

Ne documente pas des fonctionnalités qui n'existent pas.

VALIDATION OBLIGATOIRE

À la fin, exécute et corrige jusqu'à obtenir :

pnpm lint
pnpm typecheck
pnpm test
pnpm build

Et si les scripts/outils existent :

madge --circular

Vérifie également :

aucun test compilé dans dist
aucun cycle introduit
aucun runtime dependency ajouté au core
aucun package inutilement modifié
aucun fichier mort
aucun export inutile
aucun code de production inutilisé
RÈGLE DE SCOPE

Le principe central de ce step :

"Build the smallest correct architectural increment."

Ne profite PAS du step pour refactorer tout le repository.

Ne change pas :

le domain model déjà validé
les conventions ESM
les scripts existants
la configuration pnpm
Next.js
les packages non concernés

sauf si une correction est strictement nécessaire pour le nouveau step.

GIT / MODIFICATIONS

Avant de modifier :

inspecte git status
identifie les modifications déjà présentes
ne détruis aucune modification utilisateur existante
ne reset pas le repository
ne fais pas de changements hors scope

À la fin :

donne la liste exacte des fichiers créés/modifiés
explique chaque modification
donne les dépendances ajoutées/supprimées
donne le nombre de tests avant/après
donne les résultats exacts des commandes de validation
liste les éventuelles décisions architecturales restant à valider
FORMAT DU RAPPORT FINAL

Retourne un rapport structuré exactement dans cet esprit :

Step X — Final Report
1. Objective

Ce que le step devait accomplir.

2. Architectural Decision

Pourquoi cette architecture a été choisie.

3. Changes Made

Tableau fichier / changement / raison.

4. Domain Impact

Confirme explicitement si @devlens/core a été modifié ou non.

5. Dependency Graph

Montre les nouvelles relations entre packages.

6. Tests

Nombre de tests avant/après + couverture comportementale.

7. Validation
lint
typecheck
test
build
circular dependencies
8. Dependency Changes

Liste précise.

9. Remaining Concerns

Uniquement les vrais sujets restant à décider.

10. Scope Confirmation

Confirme explicitement les fonctionnalités qui N'ONT PAS été implémentées.

CRITÈRE DE RÉUSSITE

Le step est considéré comme terminé uniquement si :

l'architecture est cohérente avec Step 2 / 2.1 / 3A
les boundaries sont explicites
aucune dépendance inverse n'est introduite
aucun code prématuré n'est ajouté
les tests passent
lint passe
typecheck passe
build passe
aucune circular dependency n'est introduite
la documentation reflète réellement l'état du repository
les changements sont minimaux et justifiés

Commence maintenant par auditer le repository réel, puis implémente uniquement le prochain incrément architectural justifié par cet audit. Ne me demande pas de confirmation avant de travailler : prends la décision architecturale la plus conservative et cohérente avec les étapes déjà validées, puis justifie-la dans le rapport final.
```
