#!/usr/bin/env node
// Creatrix spec-pass INVENTORY generator (phase 1).
// Read-only over the source tree. Deterministic output (sorted, no timestamps except source SHA).
//
//   node docs/spec/tools/inventory.mjs            # writes docs/spec/inventory/{inventory.json,INVENTORY.md}
//   CX_TYPESCRIPT=/path/to/node_modules/typescript node docs/spec/tools/inventory.mjs
//
// Extracts (AST, not regex, wherever the source is TS):
//   components · Zustand state/actions (+ external reference counts) · registry hotkeys + handler
//   bindings · raw keydown handlers and the literal keys they test · Electron menu commands +
//   renderer dispatch · dialogs · drag sources / drop targets / DnD payload types · context menus ·
//   empty states · panels · feature flags · data-testids · planning docs (status, decisions,
//   open markers, stale file/line citations, testids cited in docs but absent from code).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const FE = path.join(ROOT, 'frontend')
const SRC = path.join(FE, 'src')
const OUT = path.join(ROOT, 'docs/spec/inventory')

function loadTs() {
  const cands = [process.env.CX_TYPESCRIPT, path.join(FE, 'node_modules/typescript')].filter(Boolean)
  for (const c of cands) {
    try { return createRequire(path.join(ROOT, 'x.js'))(c) } catch {}
  }
  throw new Error('typescript not found: run `npm ci` in frontend/ or set CX_TYPESCRIPT')
}
const ts = loadTs()

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')
const walk = (dir, pred, acc = []) => {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '__tests__') walk(p, pred, acc) }
    else if (pred(p)) acc.push(p)
  }
  return acc
}
const isSrc = (p) => /\.(ts|tsx)$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p) && !p.endsWith('.d.ts')
const files = walk(SRC, isSrc)
const sources = new Map()
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8')
  sources.set(f, { text, sf: ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS) })
}
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
const loc = (f, sf, node) => `${rel(f)}:${lineOf(sf, node)}`
const strVal = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text
  : n && ts.isTemplateExpression(n) ? n.head.text + '${…}' : undefined
const visit = (node, fn) => { fn(node); ts.forEachChild(node, (c) => visit(c, fn)) }
const isPascal = (s) => /^[A-Z][A-Za-z0-9]*$/.test(s)

// ---------- enclosing component resolution ----------
function enclosingComponent(node) {
  let n = node.parent
  while (n) {
    if (ts.isFunctionDeclaration(n) && n.name && isPascal(n.name.text)) return n.name.text
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n))) {
      let p = n.parent
      while (p && ts.isCallExpression(p)) p = p.parent // memo(forwardRef(...))
      if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && isPascal(p.name.text)) return p.name.text
    }
    n = n.parent
  }
  return '(module)'
}

// ---------- 1. components + JSX attribute scan ----------
const components = []
const jsxUsage = new Map() // tag -> Set(file)
const testids = []
const attrSites = { doubleClick: [], contextMenu: [], dragSource: [], dropTarget: [], keyDown: [], pointerDown: [], dialog: [], emptyState: [] }
const classTokens = new Map() // token -> [loc]

for (const [f, { sf }] of sources) {
  if (!f.endsWith('.tsx')) continue
  // declarations
  for (const st of sf.statements) {
    const exported = !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (ts.isFunctionDeclaration(st) && st.name && isPascal(st.name.text)) components.push({ name: st.name.text, at: loc(f, sf, st), exported })
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !isPascal(d.name.text) || !d.initializer) continue
      let i = d.initializer
      while (ts.isCallExpression(i) && i.arguments[0]) i = i.arguments[0]
      if (ts.isArrowFunction(i) || ts.isFunctionExpression(i)) components.push({ name: d.name.text, at: loc(f, sf, d), exported })
    }
  }
  visit(sf, (node) => {
    if (!(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) return
    const tag = node.tagName.getText(sf)
    if (!jsxUsage.has(tag)) jsxUsage.set(tag, new Set())
    jsxUsage.get(tag).add(rel(f))
    const attrs = {}
    for (const a of node.attributes.properties) {
      if (!ts.isJsxAttribute(a)) continue
      const nm = a.name.getText(sf)
      const init = a.initializer
      let v = true
      if (init && ts.isStringLiteral(init)) v = init.text
      else if (init && ts.isJsxExpression(init) && init.expression) v = strVal(init.expression) ?? `{${init.expression.getText(sf).slice(0, 60)}}`
      attrs[nm] = v
    }
    const comp = enclosingComponent(node)
    const site = { at: loc(f, sf, node), component: comp, tag }
    if (attrs['data-testid'] !== undefined) testids.push({ id: String(attrs['data-testid']), ...site })
    if (attrs.onContextMenu) attrSites.contextMenu.push(site)
    if (attrs.onDoubleClick) attrSites.doubleClick.push(site)
    if (attrs.draggable || attrs.onDragStart) attrSites.dragSource.push({ ...site, draggable: attrs.draggable ?? null })
    if (attrs.onDrop || attrs.onDragOver || attrs.onDragEnter) attrSites.dropTarget.push({ ...site, handlers: ['onDrop', 'onDragOver', 'onDragEnter'].filter((k) => attrs[k]) })
    if (attrs.onKeyDown || attrs.onKeyUp) attrSites.keyDown.push(site)
    if (attrs.onPointerDown || attrs.onMouseDown) attrSites.pointerDown.push(site)
    const cls = typeof attrs.className === 'string' ? attrs.className : ''
    const role = typeof attrs.role === 'string' ? attrs.role : ''
    if (role === 'dialog' || role === 'alertdialog' || attrs['aria-modal'] || /(^|\s)[\w-]*dialog(\s|$)/.test(cls)) attrSites.dialog.push({ ...site, role: role || null, className: cls || null })
    if (tag === 'EmptyState' || /--empty\b/.test(cls)) attrSites.emptyState.push({ ...site, className: cls || null, text: typeof attrs.message === 'string' ? attrs.message : (typeof attrs.hint === 'string' ? attrs.hint : null) })
    for (const t of cls.split(/\s+/).filter(Boolean)) {
      if (!classTokens.has(t)) classTokens.set(t, [])
      classTokens.get(t).push(site.at)
    }
  })
}
const importers = new Map() // name -> Set(file) via import specifiers
for (const [f, { sf }] of sources) for (const st of sf.statements) {
  if (!ts.isImportDeclaration(st) || !st.importClause) continue
  const names = []
  if (st.importClause.name) names.push(st.importClause.name.text)
  const nb = st.importClause.namedBindings
  if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) names.push((e.propertyName ?? e.name).text)
  for (const n of names) { if (!importers.has(n)) importers.set(n, new Set()); importers.get(n).add(rel(f)) }
}
for (const c of components) {
  const used = [...new Set([...(jsxUsage.get(c.name) ?? []), ...(importers.get(c.name) ?? [])])].filter((u) => u !== c.at.split(':')[0] || (jsxUsage.get(c.name) ?? new Set()).has(u)).sort()
  c.mountedIn = used
  c.file = c.at.split(':')[0]
}
components.sort((a, b) => a.at.localeCompare(b.at))

// ---------- 2. Zustand stores ----------
const stores = []
const allText = [...sources].map(([f, s]) => ({ f: rel(f), text: s.text }))
for (const [f, { sf }] of sources) {
  if (!rel(f).includes('/stores/')) continue
  visit(sf, (node) => {
    if (!ts.isCallExpression(node)) return
    const callee = node.expression
    const isCreate = (ts.isIdentifier(callee) && callee.text === 'create') ||
      (ts.isCallExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'create')
    if (!isCreate) return
    let fn = node.arguments[0]
    while (fn && ts.isCallExpression(fn)) fn = fn.arguments[0] // persist(...)/devtools(...)
    if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return
    let body = fn.body
    if (ts.isParenthesizedExpression(body)) body = body.expression
    if (ts.isBlock(body)) { const r = body.statements.find(ts.isReturnStatement); body = r?.expression; if (body && ts.isParenthesizedExpression(body)) body = body.expression }
    if (!body || !ts.isObjectLiteralExpression(body)) return
    let decl = node.parent
    while (decl && !ts.isVariableDeclaration(decl)) decl = decl.parent
    const name = decl && ts.isIdentifier(decl.name) ? decl.name.text : '(anon)'
    const state = [], actions = []
    for (const p of body.properties) {
      const key = p.name?.getText(sf)
      if (!key) continue
      const isFn = ts.isMethodDeclaration(p) || (ts.isPropertyAssignment(p) && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer)))
      ;(isFn ? actions : state).push({ name: key, at: loc(f, sf, p) })
    }
    // external reference count: files other than this store that mention `.name` or `name` as a word
    const self = rel(f)
    for (const a of actions) {
      const re = new RegExp(`\\b${a.name}\\b`)
      a.refs = allText.filter((t) => t.f !== self && re.test(t.text)).map((t) => t.f).sort()
    }
    stores.push({ store: name, file: self, at: loc(f, sf, node), state, actions })
  })
}
stores.sort((a, b) => a.file.localeCompare(b.file))

// ---------- 3. hotkey registry + bindings ----------
const shortcuts = [], registered = []
for (const [f, { sf }] of sources) {
  visit(sf, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'DEFAULT_SHORTCUTS' && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      for (const el of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(el)) continue
        const o = { at: loc(f, sf, el) }
        for (const p of el.properties) if (ts.isPropertyAssignment(p)) o[p.name.getText(sf)] = strVal(p.initializer) ?? p.initializer.getText(sf)
        shortcuts.push(o)
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'register' &&
        /shortcut/i.test(node.expression.expression.getText(sf)) && strVal(node.arguments[0])) {
      registered.push({ action: strVal(node.arguments[0]), at: loc(f, sf, node) })
    }
  })
}
const normKeys = (k) => String(k).toLowerCase().split('+').map((s) => s.trim()).sort((a, b) => a.localeCompare(b)).join('+')
const regSet = new Set(registered.map((r) => r.action))
const defSet = new Set(shortcuts.map((s) => s.action))
const conflictMap = new Map()
for (const s of shortcuts) {
  const k = `${normKeys(s.keys)}@${s.context ?? 'normal'}`
  if (!conflictMap.has(k)) conflictMap.set(k, [])
  conflictMap.get(k).push(s)
}
const hotkeyConflicts = [...conflictMap].filter(([, v]) => v.length > 1).map(([k, v]) => ({ key: k, actions: v.map((s) => `${s.action} (${s.at})`) }))

// ---------- 4. raw key handlers (shadow hotkeys outside the registry) ----------
const rawKeyHandlers = []
function keysTested(fnNode, sf) {
  const keys = new Set()
  visit(fnNode, (n) => {
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(n.operatorToken.kind)) {
      for (const [a, b] of [[n.left, n.right], [n.right, n.left]]) {
        let pa = a
        if (ts.isCallExpression(pa) && ts.isPropertyAccessExpression(pa.expression) && ['toLowerCase', 'toUpperCase'].includes(pa.expression.name.text)) pa = pa.expression.expression
        if (ts.isPropertyAccessExpression(pa) && ['key', 'code'].includes(pa.name.text) && strVal(b) !== undefined) keys.add(`${pa.name.text}:${strVal(b)}`)
      }
    }
    if (ts.isSwitchStatement(n) && ts.isPropertyAccessExpression(n.expression) && ['key', 'code'].includes(n.expression.name.text)) {
      for (const c of n.caseBlock.clauses) if (ts.isCaseClause(c) && strVal(c.expression) !== undefined) keys.add(`${n.expression.name.text}:${strVal(c.expression)}`)
    }
  })
  return [...keys].sort()
}
for (const [f, { sf }] of sources) {
  visit(sf, (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'addEventListener' &&
        ['keydown', 'keyup'].includes(strVal(node.arguments[0]))) {
      const target = node.expression.expression.getText(sf)
      let h = node.arguments[1]
      // resolve identifier handler within file
      if (h && ts.isIdentifier(h)) {
        let found
        visit(sf, (n) => {
          if (found) return
          if ((ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name?.getText(sf) === h.text) found = ts.isVariableDeclaration(n) ? n.initializer : n
        })
        if (found) h = found
      }
      rawKeyHandlers.push({ at: loc(f, sf, node), kind: `addEventListener(${strVal(node.arguments[0])}) on ${target}`, component: enclosingComponent(node), keys: h ? keysTested(h, sf) : [] })
    }
    if (ts.isJsxAttribute(node) && ['onKeyDown', 'onKeyUp'].includes(node.name.getText(sf)) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
      let h = node.initializer.expression
      if (ts.isIdentifier(h)) {
        let found
        visit(sf, (n) => { if (!found && (ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name?.getText(sf) === h.text) found = ts.isVariableDeclaration(n) ? n.initializer : n })
        if (found) h = found
      }
      rawKeyHandlers.push({ at: loc(f, sf, node), kind: `JSX ${node.name.getText(sf)}`, component: enclosingComponent(node), keys: keysTested(h, sf) })
    }
  })
}

// ---------- 4b. modifier checks (gesture table input) ----------
const modifierSites = []
for (const [f, { sf }] of sources) visit(sf, (n) => {
  if (ts.isPropertyAccessExpression(n) && ['altKey', 'shiftKey', 'metaKey', 'ctrlKey'].includes(n.name.text)) modifierSites.push({ at: loc(f, sf, n), modifier: n.name.text, component: enclosingComponent(n) })
})
const modifierByComponent = {}
for (const m of modifierSites) { const k = `${m.component} (${m.at.split(':')[0].replace('frontend/src/renderer/', '')})`; (modifierByComponent[k] ??= new Set()).add(m.modifier) }

// ---------- 5. menu commands + renderer dispatch ----------
const menu = [], menuHandled = []
const menuFile = path.join(SRC, 'main/menu.ts')
if (sources.has(menuFile)) {
  const { sf } = sources.get(menuFile)
  visit(sf, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return
    const props = Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map((p) => [p.name.getText(sf), p.initializer]))
    if (!props.label && !props.role) return
    if (props.submenu) return // container — recorded via children's path
    const rawLabel = strVal(props.label) ?? (props.label ? props.label.getText(sf) : null)
    const [label, accelInLabel] = rawLabel ? rawLabel.split('\t') : [null, undefined]
    let action = null
    if (props.click) visit(props.click, (n) => { if (!action && ts.isCallExpression(n) && n.expression.getText(sf) === 'sendAction') action = strVal(n.arguments[1]) ?? n.arguments[1]?.getText(sf) })
    // parent path
    const pathParts = []
    let p = node.parent
    while (p) {
      if (ts.isObjectLiteralExpression(p)) {
        const lp = p.properties.find((q) => ts.isPropertyAssignment(q) && q.name.getText(sf) === 'label')
        if (lp) pathParts.unshift(strVal(lp.initializer) ?? lp.initializer.getText(sf))
      }
      p = p.parent
    }
    menu.push({ menu: pathParts.join(' › '), label, accelerator: strVal(props.accelerator) ?? accelInLabel ?? null, role: strVal(props.role) ?? null, action, at: loc(menuFile, sf, node) })
  })
}
const menuDispatchFile = path.join(SRC, 'renderer/app/menuActions.ts')
const menuPrefixes = []
if (sources.has(menuDispatchFile)) {
  const { sf } = sources.get(menuDispatchFile)
  visit(sf, (n) => {
    if (ts.isCaseClause(n) && strVal(n.expression)) menuHandled.push({ action: strVal(n.expression), at: loc(menuDispatchFile, sf, n) })
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'startsWith' && strVal(n.arguments[0])) menuPrefixes.push(strVal(n.arguments[0]))
  })
}
const handledSet = new Set(menuHandled.map((m) => m.action))
const menuUnhandled = menu.filter((m) => m.action && !handledSet.has(m.action) && !menuPrefixes.some((p) => m.action.startsWith(p)))
// menu accelerator vs registry mismatch
const accelToKeys = (a) => normKeys(String(a).replace(/CmdOrCtrl|CommandOrControl|Cmd|Command/gi, 'meta').replace(/Plus/g, '='))
const regByKeys = new Map(shortcuts.map((s) => [normKeys(s.keys), s]))
const menuAccelAudit = menu.filter((m) => m.accelerator).map((m) => {
  const k = accelToKeys(m.accelerator)
  const s = regByKeys.get(k)
  return { menu: `${m.menu} › ${m.label}`, accelerator: m.accelerator, menuAction: m.action, registryAction: s?.action ?? null, at: m.at, registryAt: s?.at ?? null }
})

// ---------- 6. DnD payloads ----------
const dndPayloads = []
for (const [f, { sf }] of sources) visit(sf, (n) => {
  if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['setData', 'getData'].includes(n.expression.name.text) && /dataTransfer/i.test(n.expression.expression.getText(sf)))
    dndPayloads.push({ op: n.expression.name.text, type: strVal(n.arguments[0]) ?? n.arguments[0]?.getText(sf), at: loc(f, sf, n), component: enclosingComponent(n) })
  if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'includes' && /dataTransfer\.types/.test(n.expression.expression.getText(sf)))
    dndPayloads.push({ op: 'types.includes', type: strVal(n.arguments[0]) ?? n.arguments[0]?.getText(sf), at: loc(f, sf, n), component: enclosingComponent(n) })
})
// pointer-drag candidates: pointer/mouse-down sites in files that also attach move listeners
const pointerDrag = attrSites.pointerDown.filter((s) => /(pointermove|mousemove)/.test(sources.get(path.join(ROOT, s.at.split(':')[0]))?.text ?? ''))

// ---------- 7. feature flags ----------
const flags = new Map()
for (const [f, { text }] of sources) text.split('\n').forEach((ln, i) => {
  for (const m of ln.matchAll(/\bF_[A-Z0-9_]{3,}\b/g)) { if (!flags.has(m[0])) flags.set(m[0], []); flags.get(m[0]).push(`${rel(f)}:${i + 1}`) }
})

// ---------- 8. panels ----------
const panels = components.filter((c) => /Panel$|Dock$|Drawer$|Sidebar$|Inspector$/.test(c.name) || c.file.includes('/layout/'))
  .map((c) => ({ name: c.name, at: c.at, mountedIn: c.mountedIn }))

// ---------- 9. planning docs ----------
const DOC_ROOTS = ['docs/plans', 'docs/roadmap', 'openspec', 'docs/frontend', 'docs/mockups']
const docFiles = DOC_ROOTS.flatMap((d) => walk(path.join(ROOT, d), (p) => p.endsWith('.md')))
const lastDates = {}
try {
  const log = execFileSync('git', ['-C', ROOT, 'log', '--format=@%cs', '--name-only', '--', ...DOC_ROOTS], { maxBuffer: 1 << 28 }).toString()
  let d
  for (const ln of log.split('\n')) { if (ln.startsWith('@')) d = ln.slice(1); else if (ln && !lastDates[ln]) lastDates[ln] = d }
} catch {}
const allRepoFiles = execFileSync('git', ['-C', ROOT, 'ls-files'], { maxBuffer: 1 << 28 }).toString().split('\n').filter(Boolean)
const byBase = new Map()
for (const p of allRepoFiles) { const b = path.basename(p); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(p) }
const lineCount = new Map()
const countLines = (p) => { if (!lineCount.has(p)) { try { lineCount.set(p, fs.readFileSync(path.join(ROOT, p), 'utf8').split('\n').length) } catch { lineCount.set(p, 0) } } return lineCount.get(p) }
const testidSet = new Set(testids.map((t) => t.id))
const testidPrefixes = testids.filter((t) => t.id.includes('${…}')).map((t) => t.id.split('${…}')[0]).filter((p) => p.length > 2)
const docs = []
for (const df of docFiles) {
  const text = fs.readFileSync(df, 'utf8')
  const lines = text.split('\n')
  const r = rel(df)
  const title = (lines.find((l) => /^#\s/.test(l)) ?? '').replace(/^#\s+/, '').trim()
  const statusLine = lines.find((l) => /^\s*[>*_\s]*\**status\**\s*[:—-]/i.test(l))
  const decisions = [...new Set([...text.matchAll(/\b(OD-\d+[a-z]?|D\d+(?:\.\d+)?[a-z]?|R\d+|F-\d{4}-\d+)\b/g)].map((m) => m[1]))].sort()
  const openMarkers = lines.map((l, i) => [l, i + 1]).filter(([l]) => /\b(OPEN|TBD|PENDING|UNRESOLVED|NOT user-reviewed|awaiting)\b|❓|⏳/.test(l)).map(([l, n]) => `${n}: ${l.trim().slice(0, 140)}`)
  // file citations
  const stale = []
  for (const [i, l] of lines.entries()) for (const m of l.matchAll(/`?([\w./-]+\.(?:tsx?|py|css|mjs|sh|json))(?::(\d+))?`?/g)) {
    const p = m[1]; const ln = m[2] ? Number(m[2]) : null
    if (/^(https?|www)/.test(p) || p.startsWith('.') && !p.startsWith('./')) continue
    let hits = allRepoFiles.filter((q) => q === p || q.endsWith('/' + p))
    if (!hits.length && !p.includes('/')) hits = byBase.get(p) ?? []
    if (!hits.length) {
      const before = l.slice(0, m.index)
      const runtime = /[~/]$|\.(entropic|creatrix)\/?$/.test(before) || /^\/|^~/.test(p) || /\.json$/.test(p) && !p.includes('/')
      const planned = /\b(new|NEW|create|creates|add|adds|will|planned|future|→ new)\b/.test(l)
      const moved = !runtime && p.includes('/') ? (byBase.get(path.basename(p)) ?? []) : []
      stale.push({ line: i + 1, cite: m[0].replace(/`/g, ''), problem: runtime ? 'runtime-path' : moved.length ? `moved? → ${moved.slice(0, 2).join(', ')}` : planned ? 'not-in-repo:planned?' : 'not-in-repo' })
      continue
    }
    if (ln && hits.length === 1 && ln > countLines(hits[0])) stale.push({ line: i + 1, cite: m[0].replace(/`/g, ''), problem: `line>${countLines(hits[0])}` })
  }
  // testids cited in doc lines that talk about test-ids
  const missingTestids = []
  for (const [i, l] of lines.entries()) {
    if (!/test-?id|data-testid/i.test(l)) continue
    for (const m of l.matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9{}$…]+)+)`/g)) {
      const id = m[1]
      if (testidSet.has(id) || testidPrefixes.some((p) => id.startsWith(p)) || /[{}$…]/.test(id)) continue
      missingTestids.push({ line: i + 1, id })
    }
  }
  docs.push({ path: r, title, lines: lines.length, lastCommit: lastDates[r] ?? 'uncommitted', status: statusLine?.trim().slice(0, 160) ?? null, decisions, openMarkers: openMarkers.length, openSample: openMarkers.slice(0, 8), staleCites: stale, missingTestids })
}

// ---------- assemble ----------
let sha = 'unknown'
try { sha = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim() } catch {}
const unreferencedActions = stores.flatMap((s) => s.actions.filter((a) => a.refs.length === 0).map((a) => ({ store: s.store, action: a.name, at: a.at })))
const orphanComponents = components.filter((c) => c.exported && c.mountedIn.length === 0 && !/App$|Root$|Entry$/.test(c.name))
const inv = {
  generatedFrom: sha, roots: ['frontend/src', ...DOC_ROOTS],
  counts: {
    sourceFiles: files.length, components: components.length, orphanComponents: orphanComponents.length,
    stores: stores.length, storeActions: stores.reduce((n, s) => n + s.actions.length, 0), unreferencedActions: unreferencedActions.length,
    registryHotkeys: shortcuts.length, registeredHandlers: registered.length, hotkeyConflicts: hotkeyConflicts.length,
    rawKeyHandlers: rawKeyHandlers.length, menuItems: menu.length, menuUnhandled: menuUnhandled.length,
    dialogs: attrSites.dialog.length, dragSources: attrSites.dragSource.length, dropTargets: attrSites.dropTarget.length,
    pointerDragCandidates: pointerDrag.length, dndPayloadSites: dndPayloads.length, contextMenus: attrSites.contextMenu.length,
    emptyStates: attrSites.emptyState.length, doubleClickSites: attrSites.doubleClick.length, modifierChecks: modifierSites.length, panels: panels.length, featureFlags: flags.size, testids: testidSet.size,
    planningDocs: docs.length, docsWithStaleCites: docs.filter((d) => d.staleCites.length).length,
    citesNotInRepo: docs.reduce((n, d) => n + d.staleCites.filter((s) => s.problem === 'not-in-repo').length, 0),
    citesPlannedNotInRepo: docs.reduce((n, d) => n + d.staleCites.filter((s) => s.problem.startsWith('not-in-repo:')).length, 0),
    citesRuntimePaths: docs.reduce((n, d) => n + d.staleCites.filter((s) => s.problem === 'runtime-path').length, 0),
    citesMovedFile: docs.reduce((n, d) => n + d.staleCites.filter((s) => s.problem.startsWith('moved?')).length, 0),
    citesLineBeyondEOF: docs.reduce((n, d) => n + d.staleCites.filter((s) => s.problem.startsWith('line>')).length, 0), docTestidsMissingInCode: docs.reduce((n, d) => n + d.missingTestids.length, 0),
  },
  components, orphanComponents, stores, unreferencedActions,
  hotkeys: { registry: shortcuts, registered, defaultsWithoutHandler: shortcuts.filter((s) => !regSet.has(s.action)).map((s) => ({ action: s.action, at: s.at })),
    handlersWithoutDefault: registered.filter((r) => !defSet.has(r.action)), conflicts: hotkeyConflicts, rawKeyHandlers },
  menu: { items: menu, handled: menuHandled, prefixes: [...new Set(menuPrefixes)].sort(), unhandled: menuUnhandled, acceleratorAudit: menuAccelAudit },
  dialogs: attrSites.dialog, dragSources: attrSites.dragSource, dropTargets: attrSites.dropTarget, pointerDragCandidates: pointerDrag, dndPayloads,
  doubleClick: attrSites.doubleClick, modifierSites, contextMenus: attrSites.contextMenu, emptyStates: attrSites.emptyState, panels,
  featureFlags: Object.fromEntries([...flags].sort().map(([k, v]) => [k, v])),
  testids: [...testidSet].sort(), docs,
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify(inv, null, 1) + '\n')

// ---------- markdown ----------
const md = []
const t = (hdr, rows) => { md.push(`| ${hdr.join(' | ')} |`, `|${hdr.map(() => '---').join('|')}|`); for (const r of rows) md.push(`| ${r.map((c) => String(c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`); md.push('') }
md.push('# INVENTORY (generated — do not hand-edit)', '', `Source: \`${sha}\` · regenerate: \`node docs/spec/tools/inventory.mjs\` · full data: \`inventory.json\``, '')
md.push('## Counts', ''); t(['metric', 'n'], Object.entries(inv.counts))
md.push('## Hotkeys — registry (`default-shortcuts.ts`)', ''); t(['action', 'keys', 'context', 'category', 'handler bound', 'at'], shortcuts.map((s) => [s.action, s.keys, s.context, s.category, regSet.has(s.action) ? 'yes' : '**NO**', s.at]))
md.push('### Registry conflicts (same keys + context)', ''); t(['keys@context', 'actions'], hotkeyConflicts.map((c) => [c.key, c.actions.join('; ')]))
md.push('### Handlers registered for actions not in the registry', ''); t(['action', 'at'], inv.hotkeys.handlersWithoutDefault.map((r) => [r.action, r.at]))
md.push('### Raw key handlers outside the registry (shadow hotkeys)', ''); t(['at', 'kind', 'component', 'keys tested'], rawKeyHandlers.map((r) => [r.at, r.kind, r.component, r.keys.join(' ')]))
md.push('## Menu commands (`main/menu.ts`)', ''); t(['menu', 'label', 'accelerator', 'action', 'renderer handles', 'at'], menu.map((m) => [m.menu, m.label, m.accelerator, m.action ?? (m.role ? `role:${m.role}` : ''), m.action ? (handledSet.has(m.action) || menuPrefixes.some((p) => m.action.startsWith(p)) ? 'yes' : '**NO**') : '', m.at]))
md.push('### Menu accelerator ↔ registry audit', ''); t(['menu item', 'accelerator', 'menu action', 'registry action on same keys', 'at'], menuAccelAudit.map((a) => [a.menu, a.accelerator, a.menuAction, a.registryAction ?? '**none**', a.at]))
md.push('## Zustand stores', ''); t(['store', 'file', 'state keys', 'actions', 'actions w/ no external ref'], stores.map((s) => [s.store, s.file, s.state.length, s.actions.length, s.actions.filter((a) => !a.refs.length).map((a) => a.name).join(', ')]))
md.push('## Components', ''); t(['component', 'at', 'exported', 'mounted in'], components.map((c) => [c.name, c.at, c.exported ? 'y' : '', c.mountedIn.join(', ') || (c.exported ? '**orphan**' : '(file-local)')]))
md.push('## Panels', ''); t(['panel', 'at', 'mounted in'], panels.map((p) => [p.name, p.at, p.mountedIn.join(', ')]))
md.push('## Dialogs', ''); t(['component', 'at', 'role', 'className'], attrSites.dialog.map((d) => [d.component, d.at, d.role, d.className]))
md.push('## Drag & drop', '', '### HTML5 drag sources', ''); t(['component', 'at', 'tag', 'draggable'], attrSites.dragSource.map((d) => [d.component, d.at, d.tag, d.draggable]))
md.push('### HTML5 drop targets', ''); t(['component', 'at', 'tag', 'handlers'], attrSites.dropTarget.map((d) => [d.component, d.at, d.tag, d.handlers.join(',')]))
md.push('### DataTransfer payload types', ''); t(['op', 'type', 'component', 'at'], dndPayloads.map((d) => [d.op, d.type, d.component, d.at]))
md.push('### Pointer-drag candidates (pointer/mouse-down in files with move listeners)', ''); t(['component', 'at', 'tag'], pointerDrag.map((d) => [d.component, d.at, d.tag]))
md.push('## Context menus (onContextMenu)', ''); t(['component', 'at', 'tag'], attrSites.contextMenu.map((d) => [d.component, d.at, d.tag]))
md.push('## Modifier-key checks by component (gesture-table input)', ''); t(['component (file)', 'modifiers tested'], Object.entries(modifierByComponent).sort().map(([k, v]) => [k, [...v].sort().join(' ')]))
md.push('## Double-click sites', ''); t(['component', 'at', 'tag'], attrSites.doubleClick.map((d) => [d.component, d.at, d.tag]))
md.push('## Empty states', ''); t(['component', 'at', 'tag', 'className', 'text'], attrSites.emptyState.map((d) => [d.component, d.at, d.tag, d.className, d.text]))
md.push('## Feature flags', ''); t(['flag', 'sites'], [...flags].sort().map(([k, v]) => [k, `${v.length}: ${v.slice(0, 4).join(', ')}${v.length > 4 ? ' …' : ''}`]))
md.push('## Planning docs', ''); t(['doc', 'title', 'lines', 'last commit', 'decision ids', 'open markers', 'stale cites', 'doc testids not in code'], docs.map((d) => [d.path, d.title.slice(0, 70), d.lines, d.lastCommit, d.decisions.length, d.openMarkers, d.staleCites.length, d.missingTestids.length]))
md.push('### Code citations that do not resolve (runtime paths omitted; `planned?` = line reads like a planned new file)', ''); t(['doc', 'line', 'cite', 'problem'], docs.flatMap((d) => d.staleCites.filter((s) => s.problem !== 'runtime-path').map((s) => [d.path, s.line, s.cite, s.problem])))
md.push('### Test-ids cited in docs but absent from code', ''); t(['doc', 'line', 'testid'], docs.flatMap((d) => d.missingTestids.map((s) => [d.path, s.line, s.id])))
fs.writeFileSync(path.join(OUT, 'INVENTORY.md'), md.join('\n'))
console.log(JSON.stringify(inv.counts, null, 1))
