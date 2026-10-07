/** Supabase — BaaS backend (x-supabase-api header + @supabase/supabase-js import specifier). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const supabase: TechnologyDefinition = {
  id: 'supabase',
  name: 'Supabase',
  category: 'service_worker',
  // x-supabase-api is a Supabase-specific response header (strongest signal).
  headerSignatures: [
    {
      headerName: 'x-supabase-api',
      matchValue: '',
      technologyId: 'supabase',
      confidence: 95,
    },
  ],
  // @supabase/supabase-js is the import specifier (survives minification
  // as a string literal). __session is the auth state storage key.
  contentSignatures: [
    { matchContent: '@supabase/supabase-js', technologyId: 'supabase', confidence: 85 },
    { matchContent: 'createClient', technologyId: 'supabase', confidence: 60 },
  ],
  // supabase.co is Supabase's CDN/base URL (hosted JS client, edge functions).
  linkSignatures: [
    {
      matchKind: 'hostname',
      matchValue: 'supabase.co',
      technologyId: 'supabase',
      confidence: 85,
    },
    {
      matchKind: 'hostname',
      matchValue: 'supabase.io',
      technologyId: 'supabase',
      confidence: 80,
    },
  ],
  // Supabase JS client bundle fetched from supabase.co CDN.
  resourceContentSignatures: [
    {
      matchType: 'script',
      matchContent: '@supabase/supabase-js',
      technologyId: 'supabase',
      confidence: 80,
    },
  ],
};
