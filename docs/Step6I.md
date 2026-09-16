# Step 6I — ResourceDetector

## Contexte

DevLens dispose maintenant d'une observation de ressources contrôlée dans `HttpCrawler`.

Le crawler collecte actuellement des ressources same-origin limitées, notamment :

- robots.txt
- manifest.json
- CSS
- avec protection SSRF
- validation des redirects
- validation du content-type
- limite de taille
- limite du nombre de CSS
- persistance dans `SiteSnapshot.resources`

Le domaine possède donc maintenant :

```ts
interface Resource {
  url: Url;
  type: ResourceType;
  size: number;
  content: string;
  httpStatus: number;
  contentType: string | null;
}
```
