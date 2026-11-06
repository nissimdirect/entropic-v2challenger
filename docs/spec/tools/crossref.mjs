#!/usr/bin/env node
// crossref.mjs — mechanical cross-reference of EVERY plan doc (up · down · across).
//   node docs/spec/tools/crossref.mjs        (run inventory.mjs first; reads inventory/inventory.json)
// Writes docs/spec/inventory/{crossref.json,CROSSREF.md}. Planning-only tool: reads docs + inventory, never product code.
//
// UP     : which law rows (RATIFIED D*, RECONCILIATIONS R*) each doc cites; which docs restate law values that differ
//          (type floor <12px, Plex, separate layers panel); which docs carry decisions with no law row.
// DOWN   : per doc, code anchors that resolve vs not; per object (AREAS O01–O17), which docs + which code anchors.
// ACROSS : (1) hotkey claims — every doc line binding a key, grouped by normalized key, with the code registry meaning;
//          (2) ID collisions — the same decision/packet id DEFINED in >1 doc (unqualified cross-doc refs are ambiguous);
//          (3) object → doc fan-in (input to the semantic cross-doc readers).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..')
const OUT = path.join(ROOT, 'docs/spec/inventory')
const inv = JSON.parse(fs.readFileSync(path.join(OUT, 'inventory.json'), 'utf8'))
const allFiles = execFileSync('git', ['-C', ROOT, 'ls-files'], { maxBuffer: 1 << 28 }).toString().split('\n').filter(Boolean)

// ---------- doc universe (wider than phase 1: every tracked .md that plans, specs, decides or reports) ----------
const EXCLUDE = [/^frontend\//, /^backend\//, /node_modules/, /^\.specify\/templates\//, /^docs\/spec\/inventory\//, /^\.github\//]
const docFiles = allFiles.filter((p) => p.endsWith('.md') && !EXCLUDE.some((r) => r.test(p)))
const kindOf = (p) =>
  p.startsWith('docs/frontend/RATIFIED') ? 'law' :
  p.startsWith('docs/frontend/') ? 'law-adjacent' :
  p.startsWith('docs/spec/') ? 'spec-pass' :
  p.startsWith('openspec/') ? 'openspec' :
  p.startsWith('docs/roadmap/packets/') ? 'packet' :
  p.startsWith('docs/roadmap/') ? 'roadmap' :
  p.startsWith('docs/plans/') ? 'plan' :
  p.startsWith('docs/phases/') ? 'phase' :
  p.startsWith('docs/decisions/') ? 'decision' :
  p.startsWith('docs/mockups/') ? 'mockup-index' :
  /UAT|uat|RESULTS|ADDENDUM/.test(p) ? 'uat' :
  p.startsWith('docs/') ? 'doc' : 'repo-root'

// ---------- objects (AREAS.md lens D) — keyword fan-in; deliberately generous, readers prune ----------
const OBJECTS = {
  O01: ['project', 'autosave', 'unsaved', 'onboarding', 'save as', 'recent project', '.glitch', 'persistence'],
  O02: ['track', 'layer', 'z-order', 'solo', 'mute', 'blend', 'opacity', 'master track', 'track header'],
  O03: ['clip', 'trim', 'slip', 'slide', 'split', 'ripple', 'razor', 'reverse', 'speed'],
  O04: ['device', 'effect', 'instrument', 'sampler', 'frame bank', 'granulator', 'drum rack', 'generator', 'device chain', 'rack'],
  O05: ['param', 'knob', 'slider', 'macro'],
  O06: ['automation', 'lane', 'curve', 'latch', 'touch', 'overdub', 'breakpoint', 'trigger'],
  O07: ['modulation', 'lfo', 'operator', 'sidechain', 'kentaro', 'routing', 'layertap', 'field mapping', 'mod matrix'],
  O08: ['mask', 'matte', 'lasso', 'wand', 'marquee', 'chroma', 'key ', 'selection tool'],
  O09: ['marker', 'loop', 'selection region', 'loopregion', 'brace'],
  O10: ['browser', 'library', 'preset', 'folder', 'favorite', 'search'],
  O11: ['tool', 'rail', 'hotkey', 'shortcut', 'cycle'],
  O12: ['pad', 'perform', 'multicam', 'switcher', 'choke'],
  O13: ['midi', 'cc ', 'learn', 'controller'],
  O14: ['freeze', 'flatten', 'cache', 'memory pressure', 'render cache'],
  O15: ['export', 'render queue', 'encode'],
  O16: ['undo', 'redo', 'history'],
  O17: ['panel', 'window', 'pop-out', 'popout', 'dock', 'workspace', 'monitor', 'layout'],
}

// ---------- hotkey normalization (mirrors utils/shortcuts.ts normalizeKeyString: ctrl,alt,shift,meta + key) ----------
const MOD = { cmd: 'meta', '⌘': 'meta', meta: 'meta', cmdorctrl: 'meta', command: 'meta', ctrl: 'ctrl', control: 'ctrl', '⌃': 'ctrl', shift: 'shift', '⇧': 'shift', alt: 'alt', opt: 'alt', option: 'alt', '⌥': 'alt' }
const ORDER = ['ctrl', 'alt', 'shift', 'meta']
const KEYWORD = { del: 'delete', delete: 'delete', backspace: 'backspace', esc: 'escape', escape: 'escape', space: 'space', enter: 'enter', return: 'enter', tab: 'tab', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', '↑': 'arrowup', '↓': 'arrowdown', '←': 'arrowleft', '→': 'arrowright', plus: '=' }
function normKey(raw) {
  const parts = raw.replace(/\s+/g, '').split('+').filter(Boolean)
  if (!parts.length) return null
  const mods = new Set(); let key = null
  for (const p of parts) { const l = p.toLowerCase(); if (MOD[l]) mods.add(MOD[l]); else key = KEYWORD[l] ?? l }
  if (!key || /^(click|drag|scroll|wheel|hover|doubleclick|dblclick|rightclick)$/.test(key)) return null // gestures handled elsewhere
  if (key.length > 1 && !/^(f\d{1,2}|delete|backspace|escape|space|enter|tab|arrow(up|down|left|right)|home|end|pageup|pagedown)$/.test(key)) return null
  return [...ORDER.filter((m) => mods.has(m)), key].join('+')
}
const COMBO = /(?<![\w])((?:(?:Cmd|⌘|Ctrl|Control|⌃|Shift|⇧|Alt|Opt|Option|⌥|Meta|CmdOrCtrl)\s*\+\s*)+(?:[A-Za-z0-9]\b|[=\-\[\]\\/.,;'`]|F\d{1,2}|Del(?:ete)?|Backspace|Esc(?:ape)?|Space|Enter|Return|Tab|Up|Down|Left|Right|[↑↓←→]))/g
// bare single-key table rows: | `w` | wand | …  or  | W | Lasso |
const BARE_ROW = /^\s*\|\s*`?([A-Za-z0-9\[\]=\-\\/.,;]|Space|Esc|Escape|Delete|Backspace|Tab|Enter)`?\s*\|\s*([^|]{2,80})\|/

// registry meanings
const reg = new Map()
for (const r of inv.hotkeys.registry) { const k = normKey(r.keys.replace(/meta/g, 'Cmd')) ?? r.keys; if (!reg.has(k)) reg.set(k, []); reg.get(k).push({ action: r.action, label: r.label, context: r.context, at: r.at }) }
for (const m of inv.menu.items ?? []) { if (!m.accelerator) continue; const k = normKey(m.accelerator); if (!k) continue; if (!reg.has(k)) reg.set(k, []); reg.get(k).push({ action: `menu:${m.action ?? m.role}`, label: `${m.menu} › ${m.label}`, context: 'menu-label', at: m.at }) }

// ---------- law rows ----------
const lawText = fs.readFileSync(path.join(ROOT, 'docs/frontend/RATIFIED-FOUNDATIONS.md'), 'utf8')
const LAW_ROWS = [...lawText.matchAll(/^\|\s*(D\d+(?:\.\d+)?a?)\s*\|/gm)].map((m) => m[1])

// ---------- per-doc scan ----------
const codeSet = new Set(allFiles)
const byBase = new Map(); for (const p of allFiles) { const b = path.basename(p); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(p) }
const storeActions = new Set(inv.stores.flatMap((s) => s.actions.map((a) => a.name)))
const components = new Set(inv.components.map((c) => c.name))
const ID_DEF = /^\s*(?:\|\s*\**|#{1,6}\s+|[-*]\s+\**|\**)\s*((?:OD|PK|MK|PUX|PD|PS|PV|PA|P\d+)[-.]?[A-Z]?\d+(?:\.\d+)?[a-z]?|R\d+|D\d+(?:\.\d+)?a?|Q\d+|F-\d{4}-\d+)\b\**\s*(?:\||[—:–.\-)]|\*\*)/
const hotkeyClaims = [], idDefs = [], lawRestatements = [], docs = []
for (const p of docFiles) {
  const lines = fs.readFileSync(path.join(ROOT, p), 'utf8').split('\n')
  const lower = lines.join('\n').toLowerCase()
  const kind = kindOf(p)
  const superseded = /SUPERSEDED|superseded by|status:\s*(superseded|archived|abandoned|dead)/i.test(lines.slice(0, 15).join('\n'))
  const objHits = Object.fromEntries(Object.entries(OBJECTS).map(([o, ws]) => [o, ws.reduce((n, w) => n + (lower.split(w).length - 1), 0)]).filter(([, n]) => n > 0))
  const lawCites = new Set(); const codeAnchors = { ok: 0, missing: 0 }; const storeRefs = new Set(); const compRefs = new Set()
  for (const [i, l] of lines.entries()) {
    const at = `${p}:${i + 1}`
    // UP: law cites (only when the line plausibly refers to the law table)
    if (/RATIFIED|ratified|FOUNDATIONS|\bD\d+(\.\d)?a?\b.*(row|law|verdict)|law row/.test(l) || kind === 'law') for (const m of l.matchAll(/\b(D\d+(?:\.\d+)?a?)\b/g)) if (LAW_ROWS.includes(m[1])) lawCites.add(m[1])
    for (const m of l.matchAll(/\bR(\d+)\b/g)) if (/RECONCILIATION/.test(l)) lawCites.add(`R${m[1]}`)
    // UP: restated law values that contradict D5/D6/D2
    if (kind !== 'law' && !/supersed|was 11|formerly|dead|reversal|rejected|retired|~~/i.test(l)) {
      if (/\b(9|10|10\.5|11|11\.5)\s?px\b/.test(l) && /font|type|text|floor|label|size|caption|px\s*(mono|sans)/i.test(l)) lawRestatements.push({ law: 'D6', at, text: l.trim().slice(0, 200) })
      if (/\bPlex\b/.test(l)) lawRestatements.push({ law: 'D5', at, text: l.trim().slice(0, 200) })
      if (/separate layers? panel|layers panel \(separate|photoshop-style layers panel/i.test(l) && !/no feature may|never|no separate/i.test(l)) lawRestatements.push({ law: 'D2', at, text: l.trim().slice(0, 200) })
    }
    // ACROSS: hotkeys
    for (const m of l.matchAll(COMBO)) { const k = normKey(m[1]); if (k) hotkeyClaims.push({ key: k, raw: m[1], at, kind, superseded, text: l.trim().slice(0, 220) }) }
    const b = l.match(BARE_ROW)
    if (b && /key|hotkey|shortcut|tool|press/i.test(lines.slice(Math.max(0, i - 12), i).join(' '))) { const k = normKey(b[1]); if (k && !/^[-:]+$/.test(b[2].trim())) hotkeyClaims.push({ key: k, raw: b[1], at, kind, superseded, text: l.trim().slice(0, 220) }) }
    // ACROSS: id definitions
    const d = l.match(ID_DEF); if (d) idDefs.push({ id: d[1], at, doc: p, kind, text: l.trim().slice(0, 160) })
    // DOWN: code anchors + symbol refs
    for (const m of l.matchAll(/([\w./-]+\.(?:tsx?|py|css|mjs|sh))(?::\d+)?/g)) { const q = m[1]; const hit = codeSet.has(q) || allFiles.some((f) => f.endsWith('/' + q)) || (!q.includes('/') && byBase.has(q)); hit ? codeAnchors.ok++ : codeAnchors.missing++ }
    for (const m of l.matchAll(/`([a-zA-Z_]\w{3,})\(?\)?`/g)) { if (storeActions.has(m[1])) storeRefs.add(m[1]); if (components.has(m[1])) compRefs.add(m[1]) }
  }
  docs.push({ path: p, kind, lines: lines.length, superseded, objects: objHits, lawCites: [...lawCites].sort(), codeAnchors, storeRefs: [...storeRefs].sort(), componentRefs: [...compRefs].sort() })
}

// ---------- ACROSS: hotkey key → meanings ----------
const keyMap = new Map()
for (const c of hotkeyClaims) { if (!keyMap.has(c.key)) keyMap.set(c.key, []); keyMap.get(c.key).push(c) }
const hotkeys = [...keyMap.entries()].map(([key, claims]) => ({ key, code: reg.get(key) ?? [], docCount: new Set(claims.map((c) => c.at.split(':')[0])).size, claims })).sort((a, b) => b.claims.length - a.claims.length)
// keys the code binds that no doc mentions, and keys docs bind that code does not
const docKeys = new Set(keyMap.keys())
const codeOnlyKeys = [...reg.keys()].filter((k) => !docKeys.has(k))
const docOnlyKeys = hotkeys.filter((h) => !h.code.length && h.claims.some((c) => !c.superseded)).map((h) => h.key)

// ---------- ACROSS: id collisions ----------
const idMap = new Map()
for (const d of idDefs) { if (!idMap.has(d.id)) idMap.set(d.id, []); idMap.get(d.id).push(d) }
const idCollisions = [...idMap.entries()].map(([id, defs]) => ({ id, docs: [...new Set(defs.map((d) => d.doc))], defs })).filter((x) => x.docs.length > 1).sort((a, b) => b.docs.length - a.docs.length)

// ---------- UP: law fan-in; docs that decide without a law cite ----------
const lawFanIn = Object.fromEntries([...LAW_ROWS, 'R1', 'R2', 'R3', 'R4'].map((r) => [r, docs.filter((d) => d.lawCites.includes(r)).map((d) => d.path)]))
const decidingDocsWithoutLaw = docs.filter((d) => ['openspec', 'packet', 'roadmap', 'plan'].includes(d.kind) && !d.superseded && !d.lawCites.length && idDefs.some((x) => x.doc === d.path && /^OD-|^D\d/.test(x.id))).map((d) => d.path)

// ---------- DOWN: object → docs ----------
const objectDocs = Object.fromEntries(Object.keys(OBJECTS).map((o) => [o, docs.filter((d) => (d.objects[o] ?? 0) >= 3).sort((a, b) => b.objects[o] - a.objects[o]).map((d) => ({ path: d.path, kind: d.kind, hits: d.objects[o], superseded: d.superseded }))]))

let sha = 'unknown'; try { sha = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim() } catch {}
const out = {
  generatedFrom: sha, docUniverse: docs.length,
  counts: { docs: docs.length, byKind: docs.reduce((a, d) => ((a[d.kind] = (a[d.kind] ?? 0) + 1), a), {}), hotkeyClaims: hotkeyClaims.length, distinctKeys: hotkeys.length, docOnlyKeys: docOnlyKeys.length, codeOnlyKeys: codeOnlyKeys.length, idDefinitions: idDefs.length, idCollisions: idCollisions.length, lawRestatements: lawRestatements.length, decidingDocsWithoutLaw: decidingDocsWithoutLaw.length },
  lawRows: LAW_ROWS, lawFanIn, lawRestatements, decidingDocsWithoutLaw, hotkeys, docOnlyKeys, codeOnlyKeys, idCollisions, objectDocs, docs,
}
fs.writeFileSync(path.join(OUT, 'crossref.json'), JSON.stringify(out, null, 1))

// ---------- markdown ----------
const md = []; const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const t = (h, rows) => { md.push(`| ${h.join(' | ')} |`, `|${h.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`), '') }
md.push('# CROSSREF (generated by tools/crossref.mjs — do not hand-edit)', '', `Source \`${sha}\` · ${docs.length} docs · full data \`crossref.json\`. Mechanical only: every row is a LEAD for the semantic cross-doc pass, not a verdict.`, '')
md.push('## Counts', ''); t(['metric', 'value'], Object.entries(out.counts).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]))
md.push('## UP · law fan-in (docs citing each ratified row)', ''); t(['row', 'docs citing', 'sample'], Object.entries(lawFanIn).map(([r, ds]) => [r, ds.length, ds.slice(0, 4).join(', ')]))
md.push('## UP · restated values that contradict law (non-superseded lines)', ''); t(['law', 'at', 'text'], lawRestatements.map((x) => [x.law, x.at, x.text.slice(0, 140)]))
md.push('## UP · deciding docs (define OD-/D-ids) that never cite a law row', ''); md.push(decidingDocsWithoutLaw.map((d) => `- ${d}`).join('\n') || '- none', '')
md.push('## ACROSS · hotkeys with >1 distinct doc meaning or a code meaning (top 60 by claims)', '')
t(['key', 'code meaning', 'docs', 'claims', 'sample claims (doc:line — text)'], hotkeys.slice(0, 60).map((h) => [h.key, h.code.map((c) => `${c.action}@${c.at.split('/').pop()}`).join('; ') || '— none —', h.docCount, h.claims.length, h.claims.filter((c) => !c.superseded).slice(0, 3).map((c) => `${c.at} — ${c.text.slice(0, 70)}`).join(' ⏐ ')]))
md.push('### Keys docs bind that code never binds (non-superseded)', '', docOnlyKeys.join(' · ') || 'none', '')
md.push('### Keys code binds that no doc mentions', '', codeOnlyKeys.join(' · ') || 'none', '')
md.push('## ACROSS · id collisions (same id DEFINED in >1 doc)', ''); t(['id', '#docs', 'docs'], idCollisions.slice(0, 80).map((x) => [x.id, x.docs.length, x.docs.slice(0, 6).join(', ')]))
md.push('## DOWN · object → docs (≥3 keyword hits; readers prune)', ''); t(['object', '#docs', 'top docs'], Object.entries(objectDocs).map(([o, ds]) => [o, ds.length, ds.slice(0, 6).map((d) => d.path).join(', ')]))
md.push('## Docs (universe)', ''); t(['doc', 'kind', 'superseded hdr', 'law cites', 'code anchors ok/missing', 'store refs', 'objects (hits)'], docs.map((d) => [d.path, d.kind, d.superseded ? 'yes' : '', d.lawCites.join(' '), `${d.codeAnchors.ok}/${d.codeAnchors.missing}`, d.storeRefs.length, Object.entries(d.objects).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([o, n]) => `${o}:${n}`).join(' ')]))
fs.writeFileSync(path.join(OUT, 'CROSSREF.md'), md.join('\n'))
console.log(JSON.stringify(out.counts))
