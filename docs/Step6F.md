Step 6F — ContentScriptDetector

Je recommande ContentScriptDetector avant ResourceDetector.

Pourquoi :

ScriptTag.content existe déjà depuis 6E.
Le crawler capture déjà le contenu des <script> inline.
Aucun nouveau fetch réseau n'est nécessaire.
Aucun changement de persistence n'est nécessaire au départ.
Cela permet d'attaquer directement le principal manque identifié : React / Vue / Angular / Astro, impossibles à déduire proprement d'une URL de bundle.
Le scope reste cohérent avec l'architecture actuelle.
Objectif

Créer :

packages/detectors/src/content-script-detector.ts
packages/detectors/src/content-script-detector.test.ts

Le detector inspecte uniquement :

snapshot.html.scripts

et uniquement les scripts dont :

script.src === null

Il ne fait :

aucun réseau ;
aucun accès DB ;
aucune dépendance framework ;
aucune exécution de JavaScript ;
aucune déduction à partir d'un bundle générique.
Signatures proposées

Je garderais volontairement une table très conservative.

Signature Technologie Catégorie Confiance
**NEXT_DATA** Next.js framework 95
next/router Next.js framework 90
next/navigation Next.js framework 90
react-dom React framework 90
ReactDOM React framework 90
createRoot( React framework 85
Vue.createApp Vue.js framework 95
createApp( Vue.js framework 80
@angular/core Angular framework 95
platformBrowserDynamic Angular framework 90
SvelteComponent Svelte framework 90
**SVELTE** Svelte framework 95
astro-island Astro framework 95

Mais il y a un point important :

Ne pas matcher naïvement createApp(

Cette signature peut apparaître dans énormément de code non-Vue.

Donc je préférerais dans un premier temps :

Vue.createApp

et éventuellement des marqueurs beaucoup plus spécifiques.

Même logique pour React : createRoot( seul est relativement faible.

Architecture

Le pipeline devient :

HTTP
│
▼
HttpCrawler
│
├── headers
├── meta tags
└── scripts
│
├── src ────────────────► ScriptUrlDetector
│
└── inline content ─────► ContentScriptDetector
│
▼
Detection[]
│
┌─────────────────┴─────────────────┐
▼ ▼
HeaderDetector MetaTagDetector
│ │
└──────────────┬────────────────────┘
▼
CompositeDetector
│
▼
ScanResult

Le gros avantage est que chaque detector possède une responsabilité très nette.

Point important : ne pas faire le dedup maintenant

Je repousserais le DeduplicatingDetector.

Avec 6E + 6F, on aura volontairement :

Next.js
├── MetaTagEvidence
├── ScriptUrlEvidence
└── ScriptContentEvidence

C'est en réalité une information intéressante.

Le problème n'est pas la duplication elle-même : c'est la représentation finale des preuves.

Je ferais donc le dedup après avoir suffisamment de sources d'évidence.

Step 6G
DeduplicatingDetector

pour transformer :

Next.js 90 — script URL
Next.js 95 — inline script
Next.js 85 — meta

en quelque chose comme :

Next.js
confidence: 95
evidence:

- script_url
- script_content
- meta_tag

Cela donnera beaucoup plus de valeur au modèle de données actuel.

Tests de Step 6F

Je viserais environ 20 tests, comme 6E.

Positifs
**NEXT_DATA** → Next.js
next/router → Next.js
next/navigation → Next.js
react-dom → React
ReactDOM → React
createRoot() → React
Vue.createApp() → Vue
@angular/core → Angular
platformBrowserDynamic() → Angular
SvelteComponent → Svelte
**SVELTE** → Svelte
astro-island → Astro
Comportement
plusieurs technologies dans plusieurs scripts
plusieurs signatures → une seule detection par technologie
script externe ignoré
script vide ignoré
script inline sans signature ignoré
matching case-insensitive si approprié
ScriptContentEvidence correctement structurée
confiance correcte
Faux positifs

Très important :

const text = "react-dom";

ne devrait pas forcément être considéré comme une preuve forte.

De même :

const framework = "vue";

ne doit pas déclencher Vue.

L'objectif de 6F doit être :

détecter des marqueurs structurels, pas des mots.

Nouvelle Evidence

Il faudra probablement ajouter :

type ScriptContentEvidence = {
type: 'script_content';
snippet: string;
};

Mais je modifierais légèrement le contrat.

Ne stocke jamais tout le contenu du script dans Detection.evidence.

À la place :

{
type: 'script_content',
snippet: '**NEXT_DATA**'
}

ou éventuellement une petite fenêtre autour du match.

Cela évite de transformer les détections en stockage arbitraire de JavaScript.

Ordre recommandé des prochaines étapes

Je ferais maintenant :

6E ✅ ScriptUrlDetector
│
▼
6F → ContentScriptDetector
│
▼
6G → DeduplicatingDetector
│
▼
6H → Resource observation
│
▼
6I → ResourceDetector
│
▼
7 → Detection quality / scoring
Pourquoi cet ordre ?

6F exploite immédiatement ce que 6E vient de construire.

6G donne ensuite une vraie sémantique au système d'evidence.

6H/6I élargissent enfin l'observation au-delà du HTML :

HTML
├── headers
├── meta
├── script URLs
└── inline scripts

Resources
├── JS
├── CSS
├── robots.txt
├── manifest.json
└── autres assets

Et seulement ensuite je passerais à un système de scoring plus sophistiqué.

Prompt agent recommandé

Tu peux donner directement celui-ci à ton agent :

DEVLENS — STEP 6F
Implement ContentScriptDetector

Context

Step 6E is complete.

The current DevLens architecture already has:

- SiteSnapshot.html.scripts
- ScriptTag { src: string | null; content: string }
- ScriptUrlEvidence
- ScriptUrlDetector
- HeaderDetector
- MetaTagDetector
- CompositeDetector
- Detection / Evidence / Technology domain contracts
- injected Detector architecture
- PostgreSQL persistence for snapshots and detections
- full test/typecheck/lint/build validation

Step 6E validation:

- 263 tests passed
- 9 skipped PostgreSQL integration tests
- typecheck passed
- lint passed
- build passed
- madge circular dependency check passed

Objective

Implement ContentScriptDetector.

The detector must inspect inline JavaScript captured in:

snapshot.html.scripts

Only inspect scripts where:

script.src === null

Do not fetch resources.
Do not execute JavaScript.
Do not access the database.
Do not add framework-specific runtime dependencies.

The detector must identify framework/library fingerprints from inline script CONTENT using conservative structural signatures.

Primary goal:

Address the React/Vue/Angular/Svelte/Astro detection gap that ScriptUrlDetector intentionally cannot solve.

Architecture

Create:

packages/detectors/src/content-script-detector.ts
packages/detectors/src/content-script-detector.test.ts

Reuse the existing Detector interface and createDetection() factory.

Export ContentScriptDetector from:

packages/detectors/src/index.ts

Re-export it through application if that is the existing project convention.

Wire it into both:

- web API detector composition
- worker detector composition

using the existing CompositeDetector.

Do not modify CompositeDetector deduplication behavior in this step.

Evidence

Add a new Evidence variant:

ScriptContentEvidence

Recommended shape:

{
type: 'script_content';
snippet: string;
}

The snippet must contain only the matched fingerprint or a very small relevant fragment.

Never store the complete JavaScript source inside Detection evidence.

Signature table

Start with a conservative signature table.

Recommended signatures:

Next.js:

- "**NEXT_DATA**" -> confidence 95
- "next/router" -> confidence 90
- "next/navigation" -> confidence 90

React:

- "react-dom" -> confidence 90
- "ReactDOM" -> confidence 90
- "createRoot(" -> confidence 85

Vue:

- "Vue.createApp" -> confidence 95

Do NOT use a generic "vue" substring.

Angular:

- "@angular/core" -> confidence 95
- "platformBrowserDynamic" -> confidence 90

Svelte:

- "SvelteComponent" -> confidence 90
- "**SVELTE**" -> confidence 95

Astro:

- "astro-island" -> confidence 95

Matching should be case-insensitive where technically appropriate, while preserving the original matched snippet in evidence.

False-positive requirements

Avoid generic substring detection.

Examples that must NOT automatically produce framework detections:

- generic JS bundle content
- arbitrary variable named "vue"
- arbitrary string containing "react"
- generic createApp usage without Vue-specific context
- node_modules paths
- external scripts
- empty inline scripts

Important:

"createApp(" by itself is NOT a Vue signature.

"vue" by itself is NOT a Vue signature.

"react" by itself is NOT a React signature.

The detector should prefer structural fingerprints.

Deduplication

Within ContentScriptDetector:

Only one Detection per technology.

If multiple inline scripts contain multiple signatures for the same technology:

produce one Detection.

Use the strongest/highest-confidence signature as the primary evidence.

The existing CompositeDetector must remain unchanged.

Therefore cross-detector duplicates are expected and must remain possible.

Tests

Add approximately 20 focused tests covering:

1. **NEXT_DATA** detects Next.js
2. next/router detects Next.js
3. next/navigation detects Next.js
4. react-dom detects React
5. ReactDOM detects React
6. createRoot() detects React
7. Vue.createApp() detects Vue
8. @angular/core detects Angular
9. platformBrowserDynamic detects Angular
10. SvelteComponent detects Svelte
11. **SVELTE** detects Svelte
12. astro-island detects Astro
13. multiple technologies across multiple inline scripts
14. multiple signatures for one technology produce one Detection
15. external scripts are ignored
16. empty scripts are ignored
17. scripts without fingerprints produce no detection
18. evidence shape is correct
19. strongest confidence is selected for duplicate technology signatures
20. generic false-positive cases do not detect React/Vue

Also add/update any affected existing tests.

Domain compatibility

Inspect the existing:

- Evidence
- Detection
- Technology
- value objects
- detector contracts
- snapshot contracts

before modifying them.

Do not invent incompatible abstractions.

Persistence

Do not introduce a new persistence column specifically for ScriptContentEvidence.

Existing Detection[] JSONB persistence should automatically preserve the new evidence variant.

Verify all TypeScript types remain compatible.

Documentation

Update the relevant architecture documentation:

- architecture/detectors.md
- architecture/overview.md

and any other document whose detector wiring or evidence model becomes outdated.

Validation

Run the full validation suite:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular

Do not consider Step 6F complete until all relevant checks pass.

Final report

Return:

1. objective
2. files created
3. files modified
4. signatures implemented
5. evidence model
6. deduplication behavior
7. false-positive protections
8. tests added
9. validation results
10. remaining architectural gaps
11. exact recommended next step

Do not implement ResourceDetector or cross-detector deduplication in Step 6F.
Keep the scope strictly limited to inline script content detection.
