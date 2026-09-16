# Step 20 — Real-World Robustness & Adversarial Detection Testing

## Contexte

DevLens vient de terminer son premier cycle significatif de couverture technologique.

État actuel :

```text
32 technologies
6 detectors
8 evidence types
124 golden fixture tests
857 total tests
0 circular dependencies
```

Le pipeline est :

```text
SiteSnapshot
    ↓
CompositeDetector
    ↓
DeduplicatingDetector
    ↓
ScoringDetector
    ↓
ScanResult
```

Les golden fixtures garantissent maintenant une couverture complète du catalogue.

Cependant, les golden fixtures restent principalement des **snapshots contrôlés**.

L'étape suivante consiste à vérifier que les signatures restent fiables lorsque plusieurs signaux réalistes apparaissent simultanément et lorsqu'elles sont confrontées à des cas adversariaux.

## Objectif

Auditer la robustesse réelle du moteur de détection face à :

- signatures ambiguës ;
- technologies coexistantes ;
- URLs similaires ;
- headers trompeurs ;
- HTML contenant des mentions non fonctionnelles ;
- bundles génériques ;
- ressources tierces ;
- plusieurs frameworks/CMS ;
- pages partiellement observables ;
- contenu incomplet ;
- variations réalistes de casse, query strings et chemins.

> **Les golden fixtures prouvent que DevLens détecte ce qu'il doit détecter. Le Step 20 doit vérifier qu'il ne détecte pas ce qu'il ne doit pas détecter.**

---

# 1. Adversarial fixture audit

Commencer par auditer les 32 technologies existantes et identifier les signatures les plus susceptibles de produire des false positives.

Classer chaque signature :

```text
LOW RISK
MEDIUM RISK
HIGH RISK
```

Critères :

- substring matching ;
- generic script names ;
- generic headers ;
- generic meta values ;
- CDN domains ;
- framework names ;
- technology names apparaissant fréquemment dans du contenu tiers.

Ne modifier aucune signature à ce stade.

---

# 2. False-positive matrix

Construire une matrice :

| Technology | Signature | Plausible collision | Current protection | Test needed |
| ---------- | --------- | ------------------- | ------------------ | ----------- |
| ...        | ...       | ...                 | ...                | ...         |

Prioriser les collisions réalistes.

Exemples de scénarios :

```text
Cloudflare
→ X-Powered-By: cloudflare
→ body contains "cloudflare"
→ asset URL contains cloudflare

Plausible
→ unrelated URL containing "plausible"
→ documentation mentioning plausible.io
→ fake subdomain

PrestaShop
→ generic generator containing "PrestaShop-like"
→ content mentioning PrestaShop

React
→ generic JS bundle containing "react"
→ article text containing React

Next.js
→ URL containing "/next/"
→ unrelated next-navigation assets
```

Adapter les cas aux signatures réellement présentes dans le code.

---

# 3. Case normalization

Tester les signatures pertinentes avec :

- uppercase ;
- lowercase ;
- mixed case.

Déterminer si la détection actuelle est volontairement case-sensitive ou case-insensitive.

Ne pas modifier le comportement sans justification.

Si une signature devrait être insensible à la casse mais ne l'est pas, documenter le problème et corriger uniquement si nécessaire.

---

# 4. URL variation

Pour les signatures basées sur des URLs, tester :

```text
/path
/path/
/path?query=1
/path?utm_source=test
https://host/path
https://host/path/
```

Tester également les hostnames proches mais incorrects :

```text
technology.example
technology.example.com.fake
fake-technology.example.com
```

L'objectif est d'éviter les substring matches trop permissifs.

---

# 5. Header adversarial testing

Pour les `HeaderDetector` signatures :

- header correct ;
- header absent ;
- mauvaise valeur ;
- valeur contenant le token ;
- header similaire ;
- casing ;
- plusieurs headers.

Tester notamment les signatures fortes récemment ajoutées.

Un header contenant un nom de technologie n'est pas nécessairement une preuve de cette technologie.

---

# 6. Meta tag adversarial testing

Pour `MetaTagDetector` :

- `generator` correct ;
- valeur similaire ;
- valeur contenant le nom ;
- HTML text-only mention ;
- mauvaise casse ;
- meta tag absent ;
- plusieurs generator tags.

Le detector doit continuer à utiliser l'observation structurée des meta tags et non une recherche brute dans le HTML.

---

# 7. Script URL adversarial testing

Pour `ScriptUrlDetector` :

- URL exacte ;
- URL avec query string ;
- URL avec version ;
- URL proche ;
- domaine homonyme ;
- sous-domaine non officiel ;
- chemin contenant le token ;
- fichier JS générique.

Une URL tierce qui contient un mot-clé ne doit pas automatiquement constituer une preuve.

Tester particulièrement les nouvelles signatures et les signatures historiques connues comme substring-sensitive.

---

# 8. Script content adversarial testing

Auditer `ContentScriptDetector` avec :

- global réellement présent ;
- commentaire contenant le nom ;
- string contenant le nom ;
- variable locale portant le même nom ;
- objet réellement exposé sur `window` ;
- code minifié ;
- whitespace variation.

Le detector doit privilégier un signal réellement observable plutôt qu'une simple mention textuelle.

---

# 9. Resource & Link adversarial testing

Pour `ResourceDetector` et `LinkDetector` :

tester :

- URL correcte ;
- URL proche ;
- chemin similaire ;
- domaine externe ;
- contenu non pertinent ;
- resource vide ;
- resource malformée ;
- link sans relation réelle.

Ne pas élargir les signatures simplement pour augmenter le recall.

---

# 10. Multi-technology coexistence

Créer plusieurs fixtures réalistes combinant :

```text
CMS + Analytics
CMS + CDN
Framework + Analytics
Ecommerce + Analytics
Framework + CDN
CMS + Ecommerce + Analytics
```

Vérifier :

- toutes les technologies légitimes sont détectées ;
- aucune technologie parasite n'apparaît ;
- deduplication fonctionne ;
- ranking reste déterministe ;
- evidence reste correcte.

---

# 11. Partial observation

Tester des snapshots incomplets :

```text
headers only
meta only
scripts only
resources only
links only
minimal HTML
```

Vérifier que chaque detector :

- ne crash pas ;
- ne produit pas d'évidence inventée ;
- ne dépend pas d'une observation absente ;
- conserve un résultat déterministe.

Les détecteurs doivent rester tolérants aux observations partielles.

---

# 12. Duplicate evidence

Créer des scénarios dans lesquels une même technologie est détectée plusieurs fois :

```text
same header
same script URL
same meta tag
same resource
```

Vérifier que :

```text
DeduplicatingDetector
```

continue de produire une evidence canonique.

Tester également :

- evidence identique provenant de plusieurs detectors ;
- evidence différente pour la même technologie ;
- ordre différent des observations.

Le résultat final doit rester stable.

---

# 13. Determinism under adversarial input

Pour chaque fixture adversariale :

```text
run 1
run 2
run 3
```

doit produire exactement le même résultat.

Tester :

- detection IDs ;
- confidence ;
- evidence ;
- ordering ;
- score final.

Aucun état global ne doit influencer le résultat.

---

# 14. No false-positive regression

Toutes les fixtures négatives existantes doivent continuer à passer.

Ajouter uniquement les nouvelles fixtures réellement justifiées.

Le test doit garantir :

```text
forbidden detections = absent
```

et non simplement :

```text
expected detections = present
```

Cette distinction est importante.

---

# 15. Signature quality findings

À la fin de l'audit, classer les findings :

### P0

False positive critique sur une signature forte.

### P1

False positive réaliste et reproductible.

### P2

Amélioration de précision possible mais sans impact significatif.

### Deferred

Comportement acceptable ou nécessitant une observation non disponible.

Ne pas corriger automatiquement tous les P2.

---

# 16. Corrections

Corriger uniquement les problèmes démontrés.

Les corrections peuvent inclure :

- matcher plus précis ;
- boundary d'URL ;
- comparaison structurée ;
- normalisation locale ;
- exclusion d'un faux positif ;
- signature plus spécifique.

Ne pas modifier :

- scoring global ;
- lifecycle ;
- persistence ;
- API ;
- crawler contract.

Toute modification de signature doit avoir :

```text
positive fixture
+
negative fixture
```

lorsqu'un false positive est concerné.

---

# 17. Real-world fixture quality

Les fixtures doivent rester réalistes.

Éviter :

```text
html = "<div>technology</div>"
```

pour représenter une vraie page.

Préférer des fragments plausibles :

- headers réalistes ;
- scripts réalistes ;
- resources réalistes ;
- HTML structuré ;
- plusieurs assets ;
- technologies tierces ;
- bruit non pertinent.

L'objectif est de rapprocher les fixtures de ce que `HttpCrawler` pourrait réellement observer.

---

# 18. Documentation

Mettre à jour :

```text
docs/architecture/detectors.md
```

si des signatures changent.

Créer :

```text
docs/Step20-report.md
```

Le rapport doit contenir :

1. Executive Summary
2. Adversarial methodology
3. Signature risk classification
4. False-positive matrix
5. Header tests
6. Meta tests
7. Script URL tests
8. Script content tests
9. Resource/link tests
10. Multi-technology fixtures
11. Partial observation
12. Deduplication
13. Determinism
14. Findings
15. Fixes
16. Deferred findings
17. Validation results

---

# Contraintes strictes

## Ne pas faire

- pas de scraping externe obligatoire ;
- pas de network probing ;
- pas de changement du crawler ;
- pas de changement du snapshot contract ;
- pas de changement du scoring ;
- pas de nouveau evidence type ;
- pas de nouveau detector sauf nécessité absolument démontrée ;
- pas de machine learning ;
- pas de probabilistic detection ;
- pas de heuristiques globales ;
- pas de suppression de technologies simplement parce qu'elles ont une signature imparfaite ;
- pas de baisse de précision pour augmenter recall ;
- pas de refactor massif.

## Principe

**Test the signature before changing the signature.**

Une signature qui semble fragile n'est pas nécessairement incorrecte.

Une signature ne doit être modifiée que lorsqu'un test démontre un comportement indésirable.

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

Puis vérifier explicitement :

```text
golden fixtures
negative fixtures
adversarial fixtures
determinism
catalog completeness
production detector
```

Comparer :

- tests avant/après ;
- fixtures avant/après ;
- technologies avant/après ;
- detectors avant/après ;
- éventuelles modifications de signatures.

## Critère de réussite

Le Step 20 est terminé lorsque :

- les signatures à risque ont été auditées ;
- les false positives plausibles sont testés ;
- les technologies coexistantes sont correctement détectées ;
- les snapshots partiels sont tolérés ;
- la déduplication reste correcte ;
- le pipeline reste déterministe ;
- aucune régression des golden fixtures n'est introduite ;
- les corrections de signatures sont justifiées par des tests ;
- aucune complexité architecturale inutile n'est ajoutée.

**Le système doit maintenant être capable de dire non aussi correctement qu'il sait dire oui.**
