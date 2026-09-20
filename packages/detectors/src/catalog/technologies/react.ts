/** React — library/framework (inline react-dom + ReactDOM fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const react: TechnologyDefinition = {
  id: 'react',
  name: 'React',
  category: 'framework',
  // react-dom before ReactDOM (highest-confidence first; both 90 here)
  contentSignatures: [
    { matchContent: 'react-dom', technologyId: 'react', confidence: 90 },
    { matchContent: 'ReactDOM', technologyId: 'react', confidence: 90 },
  ],
};
