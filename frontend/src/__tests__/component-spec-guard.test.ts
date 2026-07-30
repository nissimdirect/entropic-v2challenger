/**
 * component-spec-guard.test.ts — COMPONENT-SPEC companion guards (framework F1)
 *
 * The governing rule (CONTRIBUTING §Frontend UI Law): every framework
 * requirement ships with a script that enforces it, or it doesn't ship.
 * Two hand-maintained component docs rotted in this repo; these guards are
 * what keeps docs/frontend/COMPONENT-SPEC.md honest.
 *
 * Both guards use GRANDFATHER LISTS frozen at introduction (2026-07-30):
 * existing debt is tracked, not blessed — the F3 adoption sweep pays it
 * down and SHRINKS the lists (never grow them; kill criterion: a list
 * unchanged after 90 days → investigate).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const RENDERER = path.resolve(__dirname, '../renderer')
const TESTS_DIR = path.resolve(__dirname, '.')

// --- Guard A: shared primitives must have component-addressed tests ---

// Frozen 2026-07-30: 5 of the 7 existing primitives lack a name-matched
// test (Knob and Toast have real ones — components/common/knob.test.ts,
// toast.test.ts; the rest are covered only by ticket-named tests, if at
// all). New files in common/ (or a future primitives/) MUST ship a test
// whose filename starts with the component name.
const PRIMITIVES_WITHOUT_TESTS_GRANDFATHERED = [
  'NumberInput.tsx',
  'ParamLabel.tsx',
  'ParamTooltip.tsx',
  'Slider.tsx',
  'Tooltip.tsx',
]

function allTestFilenames(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else out.push(entry.name.toLowerCase())
    }
  }
  walk(TESTS_DIR)
  return out
}

// A "named test" for component Foo is a test file STARTING with "foo." or
// "foo-" — prefix match, not substring (macro-knob.test.ts is MacroKnob's
// test, not Knob's). Same rule as scripts/component-inventory.sh.
function hasNamedTest(testNames: string[], componentBase: string): boolean {
  const base = componentBase.toLowerCase()
  return testNames.some((t) => t.startsWith(`${base}.`) || t.startsWith(`${base}-`))
}

describe('COMPONENT-SPEC guard A — primitives have tests', () => {
  it('every non-grandfathered file in components/common/ has a matching test file', () => {
    const commonDir = path.join(RENDERER, 'components/common')
    const primitives = fs.readdirSync(commonDir).filter((f) => f.endsWith('.tsx'))
    const testNames = allTestFilenames()
    const missing = primitives.filter((file) => {
      if (PRIMITIVES_WITHOUT_TESTS_GRANDFATHERED.includes(file)) return false
      return !hasNamedTest(testNames, file.replace(/\.tsx$/, ''))
    })
    expect(
      missing,
      `New primitive(s) without a component-addressed test: ${missing.join(', ')}. ` +
        'Ship a test whose filename contains the component name (COMPONENT-SPEC §5). ' +
        'Do NOT add to the grandfather list — it only shrinks.',
    ).toEqual([])
  })

  it('the grandfather list only shrinks (entries must still exist and still lack tests)', () => {
    const commonDir = path.join(RENDERER, 'components/common')
    const testNames = allTestFilenames()
    for (const file of PRIMITIVES_WITHOUT_TESTS_GRANDFATHERED) {
      const exists = fs.existsSync(path.join(commonDir, file))
      if (!exists) {
        expect.fail(
          `${file} is on the grandfather list but no longer exists — remove it from the list.`,
        )
      }
      const nowTested = hasNamedTest(testNames, file.replace(/\.tsx$/, ''))
      if (nowTested) {
        expect.fail(
          `${file} now HAS a test — click the ratchet: remove it from ` +
            'PRIMITIVES_WITHOUT_TESTS_GRANDFATHERED in this same PR.',
        )
      }
    }
  })
})

// --- Guard B: new dialogs use the canonical `dialog` BEM root ---

// Frozen 2026-07-30: 10 *Dialog.tsx files exist; only UnsavedChangesDialog
// uses the canonical root. The other 9 are grandfathered until the F3
// unification sweep (one dialog per PR).
const DIALOGS_OFF_CONVENTION_GRANDFATHERED = [
  'components/dialogs/CrashRecoveryDialog.tsx',
  'components/dialogs/FeedbackDialog.tsx',
  'components/dialogs/RelinkDialog.tsx',
  'components/dialogs/TelemetryConsentDialog.tsx',
  'components/export/ExportDialog.tsx',
  'components/layout/AboutDialog.tsx',
  'components/library/PresetSaveDialog.tsx',
  'components/timeline/SpeedDialog.tsx',
  'components/upload/FileDialog.tsx',
]

const CANONICAL_ROOT = /className=\{?["'`]dialog(__|["'` ])/

function allDialogFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (/Dialog\w*\.tsx$/.test(entry.name)) out.push(p)
    }
  }
  walk(path.join(RENDERER, 'components'))
  return out
}

describe('COMPONENT-SPEC guard B — dialog root convention', () => {
  it('every non-grandfathered *Dialog.tsx uses the canonical dialog/dialog__ BEM root', () => {
    const offenders = allDialogFiles().filter((abs) => {
      const rel = path.relative(RENDERER, abs)
      if (DIALOGS_OFF_CONVENTION_GRANDFATHERED.includes(rel)) return false
      const src = fs.readFileSync(abs, 'utf8')
      return !CANONICAL_ROOT.test(src)
    })
    expect(
      offenders.map((p) => path.relative(RENDERER, p)),
      'New dialog(s) not using the canonical `dialog`/`dialog__*` root ' +
        '(pattern: UnsavedChangesDialog.tsx). Do NOT invent an 8th root — ' +
        'COMPONENT-SPEC §3. The grandfather list only shrinks.',
    ).toEqual([])
  })

  it('the dialog grandfather list only shrinks', () => {
    for (const rel of DIALOGS_OFF_CONVENTION_GRANDFATHERED) {
      const abs = path.join(RENDERER, rel)
      if (!fs.existsSync(abs)) {
        expect.fail(`${rel} is grandfathered but no longer exists — remove it from the list.`)
      }
      const src = fs.readFileSync(abs, 'utf8')
      if (CANONICAL_ROOT.test(src)) {
        expect.fail(
          `${rel} now uses the canonical root — click the ratchet: remove it from ` +
            'DIALOGS_OFF_CONVENTION_GRANDFATHERED in this same PR.',
        )
      }
    }
  })
})
