/** WordPress — CMS (meta generator + script URL + resource body + link href). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const wordpress: TechnologyDefinition = {
  id: 'wordpress',
  name: 'WordPress',
  category: 'cms',
  // meta-tag generator — `wp-content` content ordering is handled below
  metaSignatures: [
    {
      tagName: 'generator',
      matchContent: 'wordpress',
      technologyId: 'wordpress',
      confidence: 90,
      version: {
        source: 'matchedValue',
        rule: { pattern: /wordpress\s+(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
  // script URLs: wp-content BEFORE wp-includes (evidence-preference order)
  scriptUrlSignatures: [
    { matchUrl: 'wp-content', technologyId: 'wordpress', confidence: 90 },
    { matchUrl: 'wp-includes', technologyId: 'wordpress', confidence: 90 },
  ],
  // resource bodies: wp-admin/wp-includes (robots), --wp--preset--/wp-block- (css)
  resourceSignatures: [
    { matchType: 'robots', matchContent: 'wp-admin', technologyId: 'wordpress', confidence: 90 },
    { matchType: 'robots', matchContent: 'wp-includes', technologyId: 'wordpress', confidence: 90 },
    { matchType: 'css', matchContent: '--wp--preset--', technologyId: 'wordpress', confidence: 95 },
    { matchType: 'css', matchContent: 'wp-block-', technologyId: 'wordpress', confidence: 90 },
  ],
  // link hrefs: path segments wp-content / wp-includes / wp-json
  linkSignatures: [
    {
      matchKind: 'path_segment',
      matchValue: 'wp-content',
      technologyId: 'wordpress',
      confidence: 90,
    },
    {
      matchKind: 'path_segment',
      matchValue: 'wp-includes',
      technologyId: 'wordpress',
      confidence: 90,
    },
    { matchKind: 'path_segment', matchValue: 'wp-json', technologyId: 'wordpress', confidence: 90 },
  ],
};
