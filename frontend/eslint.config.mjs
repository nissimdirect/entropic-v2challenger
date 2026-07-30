// eslint.config.mjs — UC6 accessibility gate (F3, OD-4 verdict)
//
// SCOPE: src/renderer/components/** ONLY. This is an ACCESSIBILITY gate, not a
// formatter — the ONLY rules here are eslint-plugin-jsx-a11y's recommended set,
// every one downgraded to "warn". No style rules, no TypeScript rules, ever.
// (typescript-eslint is present purely as the PARSER so .tsx files parse.)
//
// Enforcement is the ratchet, not eslint's exit code: scripts/a11y-ratchet.sh
// counts total warnings and compares against frontend/.a11y-ceiling
// (governance rules (a)-(d) documented in that script, same family as
// ui-ratchets.sh / hex-ratchet.sh). Adding a warning above the ceiling goes
// red in src/__tests__/a11y-ratchet.test.ts, which runs in the normal vitest
// sweep — no workflow change needed.
//
// Test override: A11Y_RATCHET_SRC_DIR (set by the fixture tests in
// a11y-ratchet.test.ts) widens the files glob to **/*.tsx because flat-config
// file patterns resolve relative to this config file, so fixture trees in
// os.tmpdir() could never match the live glob. In fixture mode the script
// passes ONLY the fixture directory as the lint target, so effective scope
// stays exactly what the script was pointed at.

import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'

const FIXTURE_MODE = Boolean(process.env.A11Y_RATCHET_SRC_DIR)

const files = FIXTURE_MODE
  ? ['**/*.tsx', '**/*.jsx']
  : ['src/renderer/components/**/*.tsx', 'src/renderer/components/**/*.jsx']

// Recommended jsx-a11y rules, every severity forced to "warn" (accessibility
// debt is ratcheted down via the ceiling, never a hard eslint error).
const a11yWarnRules = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, conf]) => [
    rule,
    Array.isArray(conf) ? ['warn', ...conf.slice(1)] : 'warn',
  ]),
)

export default [
  {
    files,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: a11yWarnRules,
  },
]
