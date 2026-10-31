// ESLint for the frontend. Only the naming convention is enforced (CLAUDE.md
// → Naming): descriptive identifiers, with `e` (DOM/React events), `i`/`j`
// (indexes) and `_` (unused) kept short. CI lints only the files a PR changes
// (`npm run lint:changed`), so existing code converges as it is edited.
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'src/lib/api/schema.gen.ts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      // properties: never — object keys and API fields (`{ x, y }`, `p.d`)
      // follow the data's shape, not ours.
      'id-length': ['error', { min: 2, exceptions: ['e', 'i', 'j', '_'], properties: 'never' }],
    },
  },
)
