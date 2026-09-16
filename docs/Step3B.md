# DevLens — Step 3B — HTTP Crawler Implementation

# MASTER IMPLEMENTATION PROMPT

Tu travailles directement sur le repository DevLens actuel.

Ta mission est d'implémenter le Step 3B : la première implémentation concrète du crawler HTTP de DevLens.

IMPORTANT :

- Travaille directement dans le repository.
- Inspecte l'état réel du code avant toute modification.
- Ne suppose jamais qu'un fichier, une API ou une structure existe sans la vérifier.
- Respecte l'architecture déjà en place.
- Ne réimplémente pas ce qui existe déjà.
- Ne fais pas de refactor hors scope.
- Ne demande pas de confirmation pour les décisions mineures : inspecte, décide selon les contraintes ci-dessous, implémente, teste et rapporte.
- Si une décision architecturale importante est réellement bloquante, documente-la plutôt que d'inventer une solution complexe.
- Le résultat doit être du code production-quality, pas un prototype jetable.
- Ne rajoute aucune fonctionnalité produit non demandée.

============================================================

1. CONTEXTE DU PROJET
   \============================================================

DevLens est un monorepo pnpm orienté analyse technique de sites web.

Architecture actuelle :

apps/
web/
worker/

packages/
core/
crawler/
analyzer/
detectors/
database/
validation/
config/

Le projet utilise notamment :

- Node.js 24
- pnpm 11
- TypeScript strict
- ESM pour les packages libraries
- ESLint 10
- Prettier
- Vitest
- Next.js pour l'application web

La fondation du projet a déjà été auditée et corrigée.

Les validations précédentes sont vertes :

- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- madge --circular

Ne dégrade pas ces garanties.

============================================================ 2. HISTORIQUE DES STEPS DÉJÀ TERMINÉS
============================================================

STEP 1 — FOUNDATION

La fondation du monorepo a été stabilisée :

- ESM correctement configuré
- Node 24 aligné avec CI
- tests exclus des builds
- TypeScript strict
- ESLint + Prettier
- workspace pnpm fonctionnel
- packages correctement structurés
- aucune dépendance circulaire
- aucun test compilé dans dist

STEP 2 — PURE DOMAIN MODEL

@devlens/core contient maintenant le modèle métier pur.

Concepts principaux :

- Scan
- ScanTarget
- ScanStatus
- SiteSnapshot
- Technology
- Detection
- Evidence

Value objects :

- ScanId
- TechnologyId
- Url
- Hostname
- Timestamp
- Confidence
- HttpStatus
- TechnologyCategory

Le domaine ne dépend pas de Node.js, HTTP, navigateur, framework ou infrastructure.

STEP 2.1 — DOMAIN REVIEW

Le modèle a été corrigé et validé.

Décisions importantes :

1. ScanStatus ne contient pas de SiteSnapshot.
2. Scan lifecycle et scan results sont séparés.
3. TechnologyCategory est un branded string extensible.
4. ScanTarget contient URL + hostname.
5. SiteSnapshot est un artefact indépendant.
6. Toutes les structures du domaine sont readonly.
7. Les transitions de Scan sont immuables.
8. Les value objects valident leurs invariants.

STEP 3A — CRAWLER BOUNDARY

Une interface Crawler a été créée dans @devlens/crawler :

import type { ScanTarget, SiteSnapshot } from '@devlens/core';

export interface Crawler {
crawl(target: ScanTarget): Promise<SiteSnapshot>;
}

Cette interface est la boundary officielle entre l'application et l'implémentation de crawling.

Le package crawler dépend de core.

Core ne dépend jamais de crawler.

============================================================ 3. MODÈLE DE DOMAINE À RESPECTER
============================================================

Scan :

interface Scan {
readonly id: ScanId;
readonly target: ScanTarget;
readonly status: ScanStatus;
readonly createdAt: Timestamp;
}

ScanTarget :

interface ScanTarget {
readonly url: Url;
readonly hostname: Hostname;
}

ScanStatus :

type ScanStatus =
| {
readonly type: 'pending';
}
| {
readonly type: 'running';
readonly startedAt: Timestamp;
}
| {
readonly type: 'completed';
readonly completedAt: Timestamp;
}
| {
readonly type: 'failed';
readonly failedAt: Timestamp;
readonly error: ScanError;
};

IMPORTANT :

Le completed state NE contient PAS de snapshot.

Le crawler produit un SiteSnapshot indépendant.

SiteSnapshot conceptuellement :

interface SiteSnapshot {
readonly url: Url;
readonly hostname: Hostname;
readonly capturedAt: Timestamp;
readonly http: HttpObservation;
readonly html: HtmlObservation;
readonly resources: ReadonlyArray<Resource>;
}

HttpObservation :

interface HttpObservation {
readonly statusCode: HttpStatus;
readonly headers: ReadonlyArray<HttpHeader>;
readonly contentType: string;
readonly finalUrl: Url;
}

HtmlObservation :

interface HtmlObservation {
readonly title: string;
readonly description: string | null;
}

Le code réel du repository est la source de vérité.
Utilise les types exacts actuellement présents dans @devlens/core et ne recopie pas aveuglément les exemples ci-dessus si les noms exacts diffèrent légèrement.

============================================================ 4. OBJECTIF DU STEP 3B
============================================================

Implémenter une première implémentation HTTP concrète :

HttpCrawler

qui implémente :

Crawler

Architecture cible :

Crawler
↓
HttpCrawler
↓
native fetch
↓
SiteSnapshot

Le crawler doit :

1. recevoir un ScanTarget
2. effectuer une requête HTTP GET
3. suivre les redirects
4. conserver l'URL initiale conceptuellement distincte de l'URL finale
5. récupérer le status HTTP
6. récupérer les headers
7. récupérer le content-type
8. récupérer le body lorsqu'il est pertinent
9. extraire le title HTML
10. extraire la meta description
11. créer un SiteSnapshot valide
12. retourner ce snapshot
13. produire des erreurs infrastructure propres lorsque la requête échoue

Le résultat doit rester petit et focalisé.

============================================================ 5. RÈGLE ARCHITECTURALE PRINCIPALE
============================================================

Le domaine doit rester pur.

NE MODIFIE PAS @devlens/core pour adapter le crawler.

Le crawler doit s'adapter au domaine.

Ne fais jamais entrer dans le domaine :

- Response
- Headers
- URL native Node/browser
- Request
- AbortController
- Buffer
- Node streams
- DOM
- HTMLDocument
- Playwright types
- browser types
- Node-specific classes

Le domaine doit uniquement recevoir ses propres structures.

Architecture :

@devlens/core
↑
│
@devlens/crawler
│
└── HTTP implementation

Jamais :

@devlens/core → @devlens/crawler

============================================================ 6. HTTP IMPLEMENTATION
============================================================

Utilise le fetch natif disponible avec Node.js 24.

NE PAS ajouter :

- axios
- got
- node-fetch
- superagent
- request
- undici directement

Sauf problème concret démontré dans l'environnement actuel, aucun package HTTP supplémentaire n'est autorisé.

Le crawler doit effectuer :

GET

avec des headers raisonnables.

Minimum :

User-Agent
Accept: text/html,application/xhtml+xml

User-Agent par défaut raisonnable :

DevLens/0.1 (+https://devlens.local)

ou une valeur cohérente avec le projet.

Ne mets pas une URL fictive publique si le projet possède déjà une convention de branding/user-agent.

============================================================ 7. CONFIGURATION
============================================================

Introduis uniquement la configuration réellement nécessaire.

Une API raisonnable serait :

interface HttpCrawlerOptions {
readonly timeoutMs?: number;
readonly userAgent?: string;
readonly maxBodyBytes?: number;
readonly maxRedirects?: number;
}

Valeurs par défaut raisonnables :

timeout :
10 secondes

maxBodyBytes :
5 MiB

maxRedirects :
10

Ces valeurs peuvent être adaptées si le projet possède déjà des conventions.

IMPORTANT :

Ne crée pas un système de configuration global.

Ne crée pas :

- ConfigManager
- ServiceContainer
- Environment abstraction
- DI framework
- Config registry

Une simple option locale suffit.

============================================================ 8. FETCH INJECTION / TESTABILITÉ
============================================================

Le crawler doit être testable sans accès Internet.

Évite les tests qui dépendent d'un vrai site.

Prévois une injection simple de fetch si nécessaire.

Exemple conceptuel :

type FetchLike = typeof fetch;

interface HttpCrawlerDependencies {
readonly fetch: FetchLike;
}

Puis :

new HttpCrawler({
fetch: mockFetch
});

Mais adapte cette API à l'architecture réelle du package.

IMPORTANT :

Ne rends pas l'API publique inutilement compliquée uniquement pour les tests.

Une petite injection de fonction suffit.

N'ajoute pas de framework de mocking externe.

Vitest est déjà disponible.

============================================================ 9. TIMEOUT
============================================================

Le crawler doit avoir un vrai timeout réseau.

Utilise AbortController ou une mécanique native équivalente.

Une requête ne doit jamais pouvoir rester bloquée indéfiniment.

Le timeout doit être transformé en erreur infrastructure identifiable.

Par exemple :

CrawlError.code === 'timeout'

Le timeout doit aussi nettoyer correctement le signal/ressource associé.

Évite les timers qui restent actifs après résolution de la requête.

============================================================ 10. REDIRECTS
============================================================

Les redirects doivent être supportés.

Utilise le comportement natif de fetch ou implémente explicitement une limite si nécessaire.

Le nombre maximal de redirects doit être limité.

Par défaut :

10

L'URL demandée initialement reste celle du ScanTarget.

L'URL finale doit provenir de la réponse finale.

Exemple :

ScanTarget.url :

http://example.com

response.url :

https://www.example.com/

Le snapshot doit refléter :

finalUrl = https://www.example.com/

Ne modifie jamais ScanTarget.

Ne remplace jamais l'URL originale par l'URL finale dans le target.

============================================================ 11. HTTP STATUS
============================================================

Le status doit être converti avec la factory du domaine existante.

Si le core contient :

createHttpStatus(...)

utilise-la.

Ne fais pas :

response.status as HttpStatus

Ne fais pas de cast aveugle.

Le résultat doit être un véritable HttpStatus.

============================================================ 12. HTTP ERRORS VS NETWORK ERRORS
============================================================

Très important :

Une réponse HTTP 4xx ou 5xx est une observation HTTP valide.

Par exemple :

404

doit pouvoir produire un SiteSnapshot avec :

statusCode = 404

Même chose pour :

500

Ne traite pas automatiquement :

response.ok === false

comme une erreur réseau.

Distinction obligatoire :

NETWORK FAILURE
≠
HTTP ERROR RESPONSE

Une requête qui atteint le serveur et reçoit :

404

est une réponse HTTP réelle.

Le snapshot doit pouvoir la représenter.

Une requête qui ne peut pas atteindre le serveur doit produire un CrawlError.

============================================================ 13. HEADERS
============================================================

Les headers natifs de fetch ne doivent jamais être stockés dans le domaine.

Convertis :

Headers

vers la structure de domaine exacte actuellement définie.

Conceptuellement :

interface HttpHeader {
readonly name: string;
readonly value: string;
}

Les noms peuvent être normalisés en lowercase pour obtenir une représentation stable.

Exemple :

Content-Type

devient :

content-type

Conserve les valeurs sans modification inutile.

N'expose jamais directement :

Headers

dans SiteSnapshot.

============================================================ 14. CONTENT TYPE
============================================================

Extraire :

content-type

depuis les headers.

Le résultat doit être placé dans :

HttpObservation.contentType

Si le header est absent, utilise la représentation prévue par le modèle existant.

Ne modifie pas le domaine uniquement pour gérer un header absent.

Le crawler doit fonctionner même si :

content-type

est absent.

============================================================ 15. HTML DETECTION
============================================================

Le crawler doit reconnaître au minimum :

text/html

application/xhtml+xml

comme contenu HTML.

Pour ces réponses :

- récupérer le body
- extraire title
- extraire meta description

Pour les autres types :

- ne pas parser le body comme HTML
- ne pas tenter d'extraire title/description

Exemple :

application/json

ne doit pas être traité comme HTML.

============================================================ 16. BODY SIZE LIMIT
============================================================

Le crawler doit être protégé contre des réponses extrêmement grandes.

Objectif :

éviter une consommation mémoire illimitée.

Valeur par défaut raisonnable :

5 MiB

ou valeur cohérente avec le projet.

IMPORTANT :

Ne fais pas simplement :

const html = await response.text();

si cela rend impossible toute protection contre une réponse énorme.

Il faut au minimum vérifier que la réponse ne dépasse pas la limite avant de charger une quantité arbitraire de données.

Si Content-Length est disponible et dépasse immédiatement la limite :

rejeter rapidement.

Mais attention :

Content-Length n'est pas toujours présent ou fiable.

Le comportement doit rester sûr avec :

- réponse chunked
- absence de Content-Length
- Content-Length incorrect

Si nécessaire, utilise une stratégie de lecture contrôlée du body.

N'implémente pas un système de streaming excessivement complexe si une solution simple et robuste suffit.

En cas de dépassement :

CrawlError.code === 'too_large'

ou convention équivalente.

============================================================ 17. HTML PARSING
============================================================

Le crawler doit extraire uniquement :

<title>
<meta name="description">

Ne construis PAS un parser HTML artisanal massif basé sur des centaines de regex.

Évalue d'abord le code existant et les dépendances disponibles.

Ne rajoute pas une grosse bibliothèque HTML simplement par habitude.

Si un parser HTML externe est réellement nécessaire pour garantir un parsing robuste :

1. vérifie d'abord les dépendances déjà disponibles
2. évalue le coût
3. n'ajoute une dépendance que si elle est réellement justifiée
4. documente pourquoi

IMPORTANT :

Le scope de Step 3B reste volontairement minimal.

Il n'est pas demandé de faire un parseur HTML complet.

Le parser doit gérer raisonnablement :

- HTML standard
- title absent
- meta description absente
- attributs avec guillemets
- casse HTML
- espaces
- HTML malformé courant
- Unicode

La sortie attendue :

title : string

description : string | null

============================================================ 18. TITLE
============================================================

Extraire le contenu de :

<title>

Exemple :

<title>DevLens</title>

donne :

DevLens

Nettoie raisonnablement les espaces.

Ne transforme pas le contenu en autre chose.

Si aucun title n'est présent :

title = ''

ou la convention déjà définie dans le domaine.

============================================================ 19. META DESCRIPTION
============================================================

Chercher :

<meta name="description" content="...">

Gérer raisonnablement les variantes :

<meta name="description" content="...">

<meta content="..." name="description">

La comparaison de name doit être insensible à la casse.

Si absente :

description = null

Ne prends pas automatiquement :

og:description

twitter:description

etc.

Ce sera potentiellement une étape future.

============================================================ 20. RESOURCES
============================================================

NE PAS implémenter le crawling des ressources dans Step 3B.

Le champ :

resources

peut être :

[]

sauf si le modèle actuel impose une autre représentation.

Ne télécharge pas :

- CSS
- JS
- images
- fonts
- vidéos
- iframes

Ne fais pas de crawling récursif.

Ne fais pas de network graph.

Ne fais pas de dependency graph.

La détection des ressources appartient à une étape future.

============================================================ 21. SNAPSHOT CONSTRUCTION
============================================================

Construire un SiteSnapshot valide.

Conceptuellement :

{
url,
hostname,
capturedAt,
http: {
statusCode,
headers,
contentType,
finalUrl
},
html: {
title,
description
},
resources: []
}

Utilise les factories du domaine existantes :

createUrl(...)
createHostname(...)
createTimestamp(...)
createHttpStatus(...)

si elles existent et sont nécessaires.

Ne fais pas de casts TypeScript inutiles.

Ne construis pas de fake domain objects.

============================================================ 22. TIMESTAMP
============================================================

Le snapshot doit avoir :

capturedAt

Utilise la factory existante :

createTimestamp(new Date())

ou la convention réelle du core.

Ne stocke pas :

Date

dans le domaine si le domaine utilise Timestamp.

Ne crée pas ton propre format timestamp.

============================================================ 23. URL
============================================================

Le crawler reçoit déjà un :

Url

depuis ScanTarget.

Le runtime peut utiliser les primitives natives nécessaires pour effectuer fetch.

Mais aucune primitive runtime ne doit être stockée dans SiteSnapshot.

Le domaine doit recevoir :

Url

et non :

URL

Si la factory du core valide les URLs, utilise-la.

============================================================ 24. HOSTNAME
============================================================

Le snapshot doit utiliser le hostname associé au target selon les conventions du domaine.

Ne change pas arbitrairement le hostname du ScanTarget simplement parce qu'un redirect existe.

Attention :

ScanTarget représente l'intention initiale.

Snapshot représente l'observation.

Si la structure actuelle du domaine donne une règle différente, respecte le code réel et documente la décision.

============================================================ 25. ERROR MODEL
============================================================

Créer une erreur infrastructure dédiée si aucune convention équivalente n'existe déjà.

Conceptuellement :

class CrawlError extends Error {
readonly code: CrawlErrorCode;
}

Codes possibles :

'invalid_target'
'timeout'
'network_error'
'too_large'
'unsupported_content'
'http_error'

Mais n'ajoute pas inutilement :

'http_error'

si les 4xx/5xx ne sont pas considérés comme exceptions.

Recommandation :

Les erreurs réseau et infrastructure doivent être :

CrawlError

Les réponses HTTP 4xx/5xx doivent rester des snapshots valides.

Exemples :

DNS failure
→ network_error

connection refused
→ network_error

timeout
→ timeout

body > limit
→ too_large

invalid target
→ invalid_target

HTTP 404
→ SiteSnapshot

HTTP 500
→ SiteSnapshot

============================================================ 26. ERROR CAUSE
============================================================

Lorsque possible, conserve la cause originale :

new CrawlError(
'network_error',
'...',
{ cause: error }
)

Ne perds pas inutilement la cause.

Mais ne rends pas le domaine dépendant de cette erreur.

CrawlError est une erreur d'infrastructure du package crawler.

============================================================ 27. INVALID TARGET
============================================================

Le crawler reçoit normalement un ScanTarget déjà valide.

Cependant, vérifie les contraintes runtime nécessaires avant fetch.

Ne pars pas du principe que le type TypeScript garantit toutes les données à runtime.

Si nécessaire, refuse les valeurs invalides.

Ne recrée pas une deuxième validation complète du domaine.

Le core reste responsable de ses propres invariants.

Le crawler est responsable des préconditions nécessaires à son fonctionnement.

============================================================ 28. SECURITY — SSRF
============================================================

Le crawler effectue des requêtes vers des URLs potentiellement fournies par des utilisateurs.

C'est un risque SSRF.

Tu dois :

1. identifier explicitement le risque
2. inspecter l'architecture existante
3. déterminer où la validation SSRF devrait vivre
4. implémenter une protection simple si elle peut être faite proprement sans architecture excessive
5. sinon documenter clairement la limitation

IMPORTANT :

Ne prétends pas que le crawler est sécurisé contre SSRF si ce n'est pas réellement le cas.

Un crawler public peut potentiellement accéder à :

- localhost
- 127.0.0.1
- réseaux privés
- metadata endpoints
- services internes

Ne construis toutefois pas un énorme système de sécurité réseau dans Step 3B.

Si une vraie protection SSRF nécessite une résolution DNS contrôlée, une politique réseau ou une validation multi-couche, documente que cela doit être traité au boundary applicatif/infrastructure.

Ne laisse pas ce sujet complètement ignoré.

============================================================ 29. REDIRECT SSRF
============================================================

Attention particulière :

Même si l'URL initiale est publique, un redirect peut mener vers une adresse privée.

Exemple :

https://public.example
↓
http://127.0.0.1:8080

Ne considère pas uniquement l'URL initiale.

Si une protection SSRF est implémentée, les redirects doivent être pris en compte.

Si elle n'est pas implémentée dans Step 3B :

documente explicitement cette limitation.

============================================================ 30. FILE STRUCTURE
============================================================

Avant de créer des fichiers, inspecte la structure réelle de :

packages/crawler/src

Tu peux utiliser une structure de ce type :

packages/crawler/
src/
crawler.ts
http-crawler.ts
crawl-error.ts
...
tests

Mais ne crée pas automatiquement tous ces fichiers.

Crée uniquement les fichiers réellement nécessaires.

Une architecture simple est préférable à une architecture surdimensionnée.

Par exemple :

crawler.ts
http-crawler.ts
crawl-error.ts

peut parfaitement suffire.

Ne crée pas :

HttpClientFactory
HttpClientAdapter
CrawlerService
CrawlerManager
CrawlerConfigProvider
HtmlParsingService
SnapshotFactory
DomainMapper
etc.

s'ils ne sont pas réellement nécessaires.

============================================================ 31. PUBLIC API
============================================================

packages/crawler/src/index.ts doit exposer uniquement les éléments publics nécessaires.

Probablement :

export type { Crawler } from './crawler.js';
export { HttpCrawler } from './http-crawler.js';
export { CrawlError } from './crawl-error.js';
export type { CrawlErrorCode } from './crawl-error.js';

Mais adapte cela au code réel.

Les helpers internes doivent rester privés.

Ne rends pas publics des détails d'implémentation simplement parce qu'ils sont faciles à exporter.

============================================================ 32. DEPENDENCIES
============================================================

@devlens/crawler doit conserver :

@devlens/core

dans :

dependencies

et non devDependencies.

Raison :

Crawler expose des types issus de core dans son API publique.

Aucune nouvelle dépendance externe n'est autorisée sans justification claire.

Objectif :

No new dependencies.

============================================================ 33. TESTS — RÈGLE IMPORTANTE
============================================================

Les tests doivent être complètement déterministes.

Aucun test ne doit dépendre d'Internet.

NE PAS faire :

fetch('https://google.com')
fetch('https://github.com')
fetch('https://example.com')

dans les tests.

Utilise un fetch mock/injecté.

Vitest est déjà disponible.

============================================================ 34. TESTS OBLIGATOIRES
============================================================

Ajoute les tests nécessaires pour couvrir au minimum :

TEST 1 — BASIC HTML

Simuler :

HTTP 200

Content-Type :

text/html

HTML :

<html>
<head>
  <title>DevLens</title>
  <meta name="description" content="Website analysis">
</head>
<body>Hello</body>
</html>

Vérifier :

- status = 200
- title = DevLens
- description = Website analysis
- finalUrl correct
- headers présents
- resources = []

TEST 2 — MISSING TITLE

HTML sans title.

Vérifier le comportement défini par le modèle.

TEST 3 — MISSING DESCRIPTION

Vérifier :

description === null

TEST 4 — META ATTRIBUTE ORDER

Tester :

<meta content="Description" name="description">

et vérifier que la description est correctement extraite.

TEST 5 — CASE INSENSITIVITY

Tester :

<META NAME="DESCRIPTION" CONTENT="...">

TEST 6 — REDIRECT

Simuler une réponse finale différente de l'URL initiale.

Vérifier :

ScanTarget.url !== SiteSnapshot.http.finalUrl

et que finalUrl correspond à la réponse finale.

TEST 7 — HTTP 404

Vérifier qu'un 404 produit un snapshot valide.

TEST 8 — HTTP 500

Vérifier qu'un 500 produit un snapshot valide.

TEST 9 — NETWORK ERROR

Le fetch rejette.

Vérifier :

CrawlError

avec code approprié.

TEST 10 — TIMEOUT

Simuler une requête qui ne termine pas dans le délai.

Vérifier :

CrawlError

avec code timeout.

TEST 11 — OVERSIZED RESPONSE

Simuler un body dépassant maxBodyBytes.

Vérifier :

CrawlError

avec code too_large.

TEST 12 — NON HTML

Content-Type :

application/json

Vérifier :

- pas de parsing HTML
- title = valeur par défaut attendue
- description = null
- snapshot toujours valide si la réponse HTTP est exploitable

TEST 13 — HEADERS

Vérifier que les headers sont transformés en structures domaine.

Vérifier qu'aucun objet natif Headers ne fuit dans le snapshot.

TEST 14 — USER AGENT

Vérifier que le User-Agent configuré est envoyé.

TEST 15 — TIMEOUT CONFIGURATION

Tester qu'une valeur custom est respectée.

TEST 16 — MAX BODY CONFIGURATION

Tester qu'une limite personnalisée est respectée.

TEST 17 — INVALID / UNSUPPORTED TARGET

Si le crawler possède une validation runtime spécifique, la tester.

============================================================ 35. TESTS D'IMMUTABILITÉ / DOMAIN BOUNDARY
============================================================

Vérifier que le crawler ne modifie pas :

ScanTarget

Exemple :

const original = target;

await crawler.crawl(target);

expect(target).toEqual(original);

Le crawler produit un snapshot.

Il ne modifie jamais le target.

============================================================ 36. TESTS DE RÉGRESSION
============================================================

Les tests existants du core doivent continuer à passer.

Ne modifie pas les tests core sauf si une incompatibilité réelle est découverte.

Step 3B ne doit pas casser :

- Scan lifecycle
- value objects
- Detection
- Evidence
- Snapshot
- Technology

============================================================ 37. TYPE SAFETY
============================================================

Le projet utilise TypeScript strict.

Respecte notamment les options déjà configurées :

- strict
- exactOptionalPropertyTypes
- noUncheckedIndexedAccess
- noUnusedLocals
- noUnusedParameters

Évite :

any

@ts-ignore

@ts-expect-error

casts arbitraires

as unknown as ...

sauf justification réelle.

Ne désactive jamais TypeScript pour faire passer le build.

============================================================ 38. ESM
============================================================

Respecte l'architecture ESM existante.

Les imports locaux doivent suivre la convention du projet, par exemple :

import { ... } from './foo.js';

si c'est la convention actuelle.

Ne convertis pas le package en CommonJS.

Ne modifie pas la configuration ESM existante sans nécessité.

============================================================ 39. NO NODE TYPES IN DOMAIN
============================================================

Il est acceptable que le package crawler utilise Node.js.

Il est interdit que :

@devlens/core

importe des types Node.

Le crawler peut utiliser :

- AbortController
- fetch
- timers
- runtime Node APIs

mais ces éléments doivent rester dans crawler.

============================================================ 40. BODY READING
============================================================

Privilégie une stratégie robuste.

Cas à gérer :

A. Content-Length connu et > maxBodyBytes

→ rejeter immédiatement.

B. Content-Length absent

→ la lecture doit quand même être limitée.

C. Content-Length incorrect

→ ne pas faire confiance aveuglément à cette valeur.

D. Response body trop grande

→ arrêter la lecture dès que possible.

E. body vide

→ snapshot valide.

Ne conserve pas inutilement une copie multiple du body en mémoire.

============================================================ 41. CONTENT TYPE NORMALIZATION
============================================================

Les headers peuvent contenir :

text/html; charset=utf-8

Le crawler doit reconnaître correctement :

text/html

même si des paramètres sont présents.

Même principe pour :

application/xhtml+xml; charset=utf-8

N'écrase pas nécessairement la valeur brute dans HttpObservation.contentType si le modèle attend la valeur complète.

Utilise une valeur normalisée uniquement pour déterminer le comportement.

============================================================ 42. REDIRECT POLICY
============================================================

Utilise une politique claire.

Si fetch natif avec :

redirect: 'follow'

est utilisé :

- respecte maxRedirects si possible
- si fetch ne permet pas directement la limite souhaitée, implémente uniquement ce qui est nécessaire

Ne réimplémente pas un client HTTP complet.

============================================================ 43. USER AGENT
============================================================

Le User-Agent doit être :

- configurable
- déterministe
- non vide

Ne prétends pas être un navigateur.

Ne fais pas :

Mozilla/5.0 ...

sauf nécessité.

DevLens doit s'identifier comme crawler.

============================================================ 44. HTTPS / HTTP
============================================================

Le crawler doit fonctionner avec :

http://

et :

https://

selon les capacités natives du runtime.

Ne développe pas un système TLS personnalisé.

============================================================ 45. URL FRAGMENTS
============================================================

Les fragments :

#section

ne sont pas envoyés au serveur.

Respecte le comportement standard de fetch.

Ne transforme pas arbitrairement l'URL du domaine.

============================================================ 46. HTML ROBUSTNESS
============================================================

Le parsing minimal doit tolérer raisonnablement :

- balises en majuscules
- attributs dans un ordre différent
- espaces
- guillemets simples
- guillemets doubles
- HTML incomplet
- Unicode

Mais ne construis pas un parseur HTML complet.

============================================================ 47. PAS DE RESSOURCES
============================================================

Ne détecte pas encore :

<script src>
<link href>
<img src>
<iframe src>

Même si cela semble utile.

Cette fonctionnalité appartient aux prochaines étapes.

Le snapshot peut retourner :

resources: []

============================================================
48. PAS DE TECHNOLOGY DETECTION
============================================================

Ne détecte pas :

React
Next.js
Vue
WordPress
Cloudflare
Tailwind
Google Analytics
etc.

Même si le HTML permet déjà de le faire.

Ce sera le rôle de detectors/analyzer.

============================================================
49. PAS D'ANALYZER
============================================================

Ne calcule aucun :

- score
- confidence
- detection
- technology
- recommendation
- health score
- security score

Le crawler ne fait qu'observer.

============================================================
50. RESPONSIBILITY BOUNDARY

Le crawler est responsable de :

NETWORK OBSERVATION

Il n'est PAS responsable de :

BUSINESS DECISION

Exemple :

404

Le crawler observe :

404

L'application décide ensuite si :

scan = failed

ou :

scan = completed

Ne mélange pas ces responsabilités.

============================================================
51. DOCUMENTATION
============================================================

Mettre à jour la documentation architecture existante.

Inspecte d'abord :

docs/architecture/overview.md

docs/architecture/domain-model.md

Puis mets à jour ce qui est réellement nécessaire.

Créer :

docs/architecture/crawler.md

si cela apporte une vraie valeur.

Documenter :

1. Crawler boundary
2. HttpCrawler
3. native fetch
4. timeout
5. redirects
6. body size limit
7. HTTP status semantics
8. HTML extraction
9. error model
10. SSRF status
11. absence de browser execution
12. absence de resource crawling
13. future extension points

La documentation doit décrire l'architecture réellement implémentée.

Ne documente jamais une fonctionnalité qui n'existe pas.

============================================================
52. README
============================================================

Ne modifie README.md que si nécessaire.

Ne rajoute pas de documentation marketing.

============================================================
53. INSPECTION AVANT CODE
============================================================

Avant d'écrire du code :

1. inspecte package.json root
2. inspecte packages/crawler/package.json
3. inspecte packages/crawler/src
4. inspecte packages/crawler/tsconfig.json
5. inspecte packages/core/src/domain
6. inspecte packages/core/src/index.ts
7. inspecte les tests existants du crawler
8. inspecte les scripts root
9. inspecte les conventions d'import/export
10. inspecte les docs architecture

Tu dois comprendre :

- les noms exacts des types
- les factories disponibles
- les conventions de tests
- les conventions ESM
- les scripts de validation

avant de modifier quoi que ce soit.

============================================================
54. DESIGN AVANT IMPLEMENTATION
============================================================

Après inspection, détermine brièvement :

- quels fichiers doivent être créés
- lesquels doivent être modifiés
- comment fetch sera injecté
- comment timeout sera géré
- comment body size sera limité
- comment redirects seront gérés
- comment HTML sera extrait
- comment CrawlError sera structuré

Ne crée pas un document énorme.

Un petit plan interne suffit.

Puis implémente.

============================================================
55. MINIMALISM
============================================================

Règle très importante :

NE PAS créer une architecture pour les problèmes hypothétiques.

Évite :

- abstractions génériques
- interfaces inutilisées
- factories inutilisées
- services qui ne font que déléguer
- wrappers autour de fetch sans valeur
- classes statiques
- dependency injection framework
- repository pattern
- event system
- service locator

Le code doit être simple à comprendre par un développeur senior.

============================================================
56. EXTENSIBILITÉ
============================================================

L'implémentation doit être remplaçable plus tard.

Par exemple :

Crawler
├── HttpCrawler
└── FutureBrowserCrawler

Mais NE PAS implémenter FutureBrowserCrawler.

L'interface existante suffit.

============================================================
57. PERFORMANCE
============================================================

Optimisations raisonnables uniquement.

Objectifs :

- éviter les allocations inutiles
- ne pas copier plusieurs fois le body
- arrêter tôt si taille dépassée
- ne pas parser du non-HTML
- ne pas télécharger les ressources
- ne pas lancer de traitement parallèle inutile

Ne fais pas de micro-optimisations prématurées.

============================================================
58. OBSERVABILITÉ
============================================================

Ne rajoute pas de système de logging complexe.

Évite :

- pino
- winston
- telemetry SDK
- OpenTelemetry

sauf si déjà présent et nécessaire.

Les erreurs doivent être suffisamment explicites.

============================================================
59. SECURITY BOUNDARY
============================================================

Si tu identifies une vulnérabilité sérieuse qui ne peut pas être corrigée proprement dans Step 3B :

NE LA MASQUE PAS.

Documente :

- le problème
- le risque
- pourquoi il n'est pas traité ici
- où il devrait être traité
- ce qui devra être fait avant production

Mais ne transforme pas cette étape en projet de sécurité complet.

============================================================
60. VALIDATION OBLIGATOIRE
============================================================

Après implementation, exécute réellement :

pnpm lint

pnpm typecheck

pnpm test

pnpm build

et la commande madge utilisée actuellement par le repository.

Ne te contente pas d'affirmer que cela devrait fonctionner.

Les résultats doivent être réels.

============================================================
61. BUILD
============================================================

Vérifier :

- crawler compile
- core compile
- aucun test dans dist
- ESM correct
- declarations .d.ts correctes
- aucun import runtime inutile
- aucun cycle

============================================================
62. DIST
============================================================

Inspecte le dist de :

packages/crawler

et vérifie :

- aucun *.test.js
- aucun *.spec.js
- aucun artefact inattendu

Si les tests apparaissent dans dist, corrige le tsconfig conformément aux conventions déjà établies.

============================================================
63. DEPENDENCY GRAPH
============================================================

Le graphe doit rester :

core
↑
crawler

et :

core
↑
analyzer

core
↑
detectors

sans cycle.

Ne fais pas :

crawler → analyzer

crawler → detectors

core → crawler

============================================================
64. NO CROSS-SCOPE CHANGES
============================================================

Évite de modifier :

packages/analyzer

packages/detectors

packages/database

packages/validation

packages/config

apps/web

apps/worker

sauf si une modification est strictement nécessaire à la compilation ou à l'architecture de Step 3B.

Si tu dois modifier un autre package :

- explique pourquoi
- limite la modification au strict nécessaire
- rapporte-la dans le rapport final

============================================================
65. ACCEPTANCE CRITERIA
============================================================

Step 3B est considéré terminé uniquement si :

[ ] HttpCrawler existe

[ ] HttpCrawler implements Crawler

[ ] HTTP GET fonctionne

[ ] fetch natif est utilisé

[ ] aucune dépendance HTTP externe n'a été ajoutée sans justification

[ ] redirects fonctionnent

[ ] finalUrl est correctement renseignée

[ ] ScanTarget n'est pas muté

[ ] status HTTP est converti vers HttpStatus

[ ] headers sont convertis vers les structures domaine

[ ] aucun Headers natif ne fuit dans le domaine

[ ] content-type est capturé

[ ] HTML est détecté correctement

[ ] title est extrait

[ ] meta description est extraite

[ ] description absente = null

[ ] non-HTML n'est pas parsé comme HTML

[ ] resources restent vides

[ ] timeout fonctionne

[ ] body size limit fonctionne

[ ] network failures produisent CrawlError

[ ] HTTP 4xx restent représentables

[ ] HTTP 5xx restent représentables

[ ] causes d'erreur conservées quand pertinent

[ ] tests sans Internet

[ ] tests redirects

[ ] tests 404

[ ] tests 500

[ ] tests network failure

[ ] tests timeout

[ ] tests oversized response

[ ] tests non-HTML

[ ] tests headers

[ ] tests user-agent

[ ] tests configuration

[ ] core reste indépendant du crawler

[ ] aucune dépendance circulaire

[ ] aucun test compilé dans dist

[ ] pnpm lint passe

[ ] pnpm typecheck passe

[ ] pnpm test passe

[ ] pnpm build passe

[ ] madge passe

[ ] documentation mise à jour

[ ] aucun detector ajouté

[ ] aucun analyzer ajouté

[ ] aucune persistence ajoutée

[ ] aucune database ajoutée

[ ] aucun Playwright ajouté

[ ] aucune queue ajoutée

[ ] aucun Redis ajouté

[ ] aucune AI ajoutée

[ ] aucune auth ajoutée

[ ] aucun billing ajouté

============================================================
66. IMPORTANT — NE PAS TRICHER SUR LES TESTS
============================================================

Ne modifie pas les tests pour cacher un problème.

Ne réduis pas la couverture existante.

Ne supprime pas un test existant uniquement parce qu'il gêne l'implémentation.

Si un test existant est devenu incorrect à cause d'une évolution légitime du contrat :

- adapte-le minimalement
- documente la raison

============================================================
67. IMPORTANT — NE PAS MODIFIER LE DOMAINE POUR FACILITER L'IMPLÉMENTATION
============================================================

Le crawler doit s'adapter au domaine.

Ne change pas :

ScanStatus

SiteSnapshot

Detection

Evidence

Technology

Confidence

HttpStatus

Timestamp

Url

Hostname

simplement parce qu'une implémentation est plus pratique autrement.

Si une incohérence réelle du modèle est découverte :

1. ne la corrige pas silencieusement
2. documente-la
3. ne modifie le core que si absolument nécessaire
4. explique précisément l'impact

Le Step 2.1 a justement été réalisé pour stabiliser cette frontière.

============================================================
68. IMPORTANT — HTTP 4XX/5XX
============================================================

Principe à respecter :

Une réponse HTTP existe = observation.

Exemples :

200 → snapshot

301 → snapshot final après redirect

404 → snapshot

500 → snapshot

Une absence de réponse :

DNS failure
connection failure
timeout

→ CrawlError

Cette distinction est importante pour l'architecture future.

============================================================
69. IMPORTANT — PAS DE BROWSER
============================================================

Ce crawler HTTP ne doit pas :

- exécuter JS
- attendre hydration
- attendre network idle
- lancer Chromium
- calculer DOM après JS
- capturer screenshot

Il observe uniquement la réponse HTTP et le HTML source.

============================================================
70. IMPORTANT — PAS DE DETECTION
============================================================

Même si tu vois :

<script src="/_next/...">

ou :

<meta name="generator" ...>

ou :

X-Powered-By: Next.js

NE crée aucune Detection.

Le crawler observe.

Les detectors analyseront ensuite le snapshot.

============================================================
71. RAPPORT FINAL OBLIGATOIRE
============================================================

À la fin, réponds avec exactement cette structure :

# DevLens — Step 3B Final Report

## 1. Executive Summary

Résumé court de ce qui a été implémenté.

## 2. Files Created

Liste exacte.

## 3. Files Modified

Liste exacte.

## 4. HttpCrawler Architecture

Explique :

Crawler
↓
HttpCrawler
↓
fetch
↓
SiteSnapshot

## 5. HTTP Behaviour

Documente :

- method
- headers
- redirects
- timeout
- max body size
- content type
- HTTP status handling

## 6. HTML Extraction

Documente :

- title
- meta description
- unsupported HTML cases
- non-HTML behaviour

## 7. Error Model

Liste exactement les CrawlErrorCode utilisés.

Pour chaque code :

- quand il est produit
- comportement

## 8. Security / SSRF

Explique :

- protections réellement implémentées
- protections non implémentées
- risques restants
- où ils devront être traités

Ne prétends pas qu'une protection existe si elle n'existe pas.

## 9. Tests

Donne :

- nombre total de tests
- nombre de fichiers de tests
- catégories testées

Exemple :

- basic HTML
- redirects
- HTTP errors
- network errors
- timeout
- body size
- headers
- non-HTML
- configuration

## 10. Validation

Donne les résultats RÉELS :

pnpm lint
pnpm typecheck
pnpm test
pnpm build
madge --circular

Utilise les résultats réellement obtenus.

## 11. Dependency Changes

Indique :

- packages ajoutés
- packages supprimés
- changements devDependencies/dependencies

Si aucune nouvelle dépendance :

No new dependencies added.

## 12. Domain Boundary

Confirme que :

- core n'a pas été couplé à Node
- Response ne fuit pas dans le domaine
- Headers ne fuit pas dans le domaine
- URL runtime ne fuit pas dans le domaine
- crawler dépend de core et non l'inverse

## 13. Scope Verification

Confirme explicitement qu'aucun élément suivant n'a été implémenté :

- detectors
- analyzer
- technology detection
- persistence
- database
- Playwright
- browser automation
- Redis
- queues
- AI
- auth
- billing
- multi-page crawling
- resource crawling

## 14. Remaining Architectural Concerns

Liste les vrais problèmes restants.

Ne crée pas artificiellement des problèmes.

## 15. Recommended Next Step

Propose le prochain step architectural logique.

IMPORTANT :

NE PAS implémenter le prochain step.

============================================================
72. DEFINITION OF DONE
============================================================

Le travail est terminé uniquement lorsque :

1. le code compile
2. les tests passent
3. lint passe
4. typecheck passe
5. build passe
6. madge passe
7. aucun test n'est compilé dans dist
8. aucun package inutile n'a été ajouté
9. le domaine reste pur
10. le crawler est testable sans Internet
11. les erreurs réseau sont distinguées des réponses HTTP
12. timeout et body limit sont réellement appliqués
13. redirects sont correctement gérés
14. title + description sont extraits
15. la documentation correspond exactement au code
16. le rapport final est fourni

============================================================
73. RÈGLE FINALE
============================================================

Le but de Step 3B n'est PAS de créer un framework de crawling.

Le but est de construire une première implémentation HTTP solide de la boundary :

Crawler

qui fait exactement ceci :

ScanTarget
    ↓
HTTP GET
    ↓
HTTP response
    ↓
minimal observation
    ↓
SiteSnapshot

Le code doit être :

- simple
- professionnel
- testable
- sécurisé autant que possible
- maintenable
- remplaçable
- strictement séparé du domaine

Privilégie toujours :

1. simplicité
2. correctness
3. domain isolation
4. testability
5. security
6. maintainability
7. performance

Ne cherche pas à anticiper toutes les futures fonctionnalités.

Implémente uniquement Step 3B.
