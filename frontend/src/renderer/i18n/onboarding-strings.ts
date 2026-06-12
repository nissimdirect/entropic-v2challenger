/**
 * P3.5 — Onboarding string table.
 *
 * Single source of truth for all user-facing copy in the first-launch
 * onboarding ritual. Every string lives here; no scattered literals in
 * component files. Copy changes are PRs to THIS file first, code second.
 *
 * Voice rules (DESIGN-SPEC §3/§8):
 * - Device/data/identity strings: IBM Plex Mono, lowercase.
 * - Dialog/UI prose: IBM Plex Sans, sentence case.
 * - UPPERCASE only at identity moments.
 *
 * Source of truth: docs/roadmap/ONBOARDING-SPEC.md §3/§4/§6/§7.
 */

export const ONBOARDING = {
  // ── §2 Boot line ──────────────────────────────────────────────────────
  'boot.line': 'creatrix v{appVersion} — {effectCount} effects loaded',

  // ── §3 Demos drawer ──────────────────────────────────────────────────
  'drawer.title': 'Demos',
  'drawer.subtitle': 'Three small projects. Each one teaches one idea.',

  'drawer.card.y_is_time.title': 'y_is_time',
  'drawer.card.y_is_time.body': 'The audio is painted vertically — each row is a moment in time.',

  'drawer.card.painted_blur.title': 'painted_blur',
  'drawer.card.painted_blur.body': 'Blur isn\'t one number anymore. Paint where it stays sharp.',

  'drawer.card.audio_lfo_stripes.title': 'audio_lfo_stripes',
  'drawer.card.audio_lfo_stripes.body': 'Sound becomes vision — the LFO\'s rate becomes the stripe count.',

  'drawer.card.open': 'open',
  'drawer.card.missing': 'demo file missing — reinstall demos to restore',

  'drawer.footer.dismiss': 'Don\'t show demos on launch',

  // ── §4 Opening a demo ──────────────────────────────────────────────
  'drawer.draftToast': 'Your project was kept as a draft.',
  'demo.reset': 'reset demo',
  'demo.resetConfirm': 'Reset this demo to its original state? Your edits to it will be lost.',

  // ── §6 Tour (P3.7) ────────────────────────────────────────────────
  // C1 — per-demo (content varies by which demo is open)
  'tour.c1.y_is_time': 'the lane|This lane runs down the frame, not along the clip. Drag any point — it\'s live.',
  'tour.c1.painted_blur': 'the field|This image is the blur amount, per pixel. Dark stays sharp.',
  'tour.c1.audio_lfo_stripes': 'the operator|A 50 Hz LFO drawn into space. Loud music packs the stripes tighter.',
  // C2–C5 — shared
  'tour.c2.preview': 'preview|The result renders here. Scrub anywhere on the timeline.',
  'tour.c3.chain': 'device chain|Effects stack left to right. Drag to reorder, double-click to edit.',
  'tour.c4.browser': 'browser|Everything draggable lives here — effects, operators, instruments.',
  'tour.c5.yours': 'make it yours|This project is editable. Break it. New project: Cmd+N.',

  // Tour controls
  'tour.next': 'next',
  'tour.skip': 'skip tour',

  // ── §7 Dismiss + no-engagement prompt ────────────────────────────
  'prompt.hideDemos': 'Demos keep opening at launch. Hide them?',
} as const

export type OnboardingKey = keyof typeof ONBOARDING
