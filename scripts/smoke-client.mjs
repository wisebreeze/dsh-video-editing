// Load the static Client bundle against a stub Cordis context and report what it registers.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const loaded = []

globalThis.window = {
  __ModuleLoader__: {
    load(meta) {
      loaded.push(meta)
    },
  },
}

const source = readFileSync(join(root, 'client.js'), 'utf8')
new Function('window', source)(globalThis.window)

const meta = loaded[0]
console.log('module id     :', meta?.id)

const require = (id) => {
  if (id === 'react') {
    return {
      createElement: () => null,
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useEffect: () => {},
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
    }
  }
  throw new Error(`unexpected require(${JSON.stringify(id)})`)
}

const exported = meta.factory(require)
console.log('exports       :', Object.keys(exported))

const plugin = exported.default ?? exported
console.log('inject        :', plugin.inject)

const registered = { tabs: [], slotRegs: [], locale: [], styles: [] }

function makeCtx() {
  const ctx = {
    _services: {},
    effect(fn) {
      const dispose = fn()
      return () => { if (typeof dispose === 'function') dispose() }
    },
    inject(names, cb) {
      const wanted = Array.isArray(names) ? names : []
      const ready = wanted.filter((n) => ctx._services[n] !== undefined)
      console.log(`  inject(${wanted.join(',')}) present=${ready.length}/${wanted.length}`)
      const dispose = cb({ get: (n) => ctx._services[n] })
      return { dispose: () => { if (typeof dispose === 'function') dispose() } }
    },
    slots: {
      inject(_name, cb) { return cb() },
      register(...args) { registered.slotRegs.push(args); return () => {} },
    },
  }
  ctx.get = (name) => ctx._services[name]
  return ctx
}

/** Recording stand-ins for each service, so registrations are observable. */
const serviceStub = {
  slots: () => ({
    inject: (_name, cb) => cb(),
    register: (...args) => { registered.slotRegs.push(args); return () => {} },
  }),
  locale: () => ({
    register: (...args) => { registered.locale.push(args[0]); return () => {} },
    bind: () => (key) => key,
  }),
  styles: () => ({
    insert: (...args) => { registered.styles.push(args[0]?.length ?? 0); return () => {} },
  }),
  betterSidebar: () => ({
    registerTab: (...args) => { registered.tabs.push(args[0]); return () => {} },
  }),
  sidebarRightTabs: () => ({
    register: (...args) => { registered.tabs.push(args[0]); return () => {} },
  }),
}

function run(label, services) {
  registered.tabs.length = 0
  registered.slotRegs.length = 0
  registered.locale.length = 0
  registered.styles.length = 0
  const ctx = makeCtx()
  ctx._services = services
  let error
  console.log(`\n== ${label} ==`)
  try {
    plugin.apply(ctx)
  } catch (cause) {
    error = cause
  }
  if (error !== undefined) {
    console.log('  THREW   :', error.message)
    return
  }
  console.log('  styles  :', registered.styles.length ? `inserted (${registered.styles[0]} chars)` : 'none')
  console.log('  locale  :', registered.locale.length ? registered.locale.join(',') : 'none')
  console.log('  tabs    :', registered.tabs.map((t) => `${t.kind ?? t.id}${t.priority ? ` (${t.priority})` : ''}`).join(', ') || 'none')
  console.log('  slots   :', registered.slotRegs.map((a) => a[0]?.name ?? a[0]).join(', ') || 'none')
  console.log('  guides  :', registered.tabs.flatMap((t) => (t.guide ?? []).map((g) => g.id)).join(', ') || 'none')
}

const base = () => ({
  slots: serviceStub.slots(),
  locale: serviceStub.locale(),
  styles: serviceStub.styles(),
})

// Official right sidebar only.
run('official right sidebar only', {
  ...base(),
  sidebarRightTabs: serviceStub.sidebarRightTabs(),
})

// dsh-better-sidebar only.
run('dsh-better-sidebar only', {
  ...base(),
  betterSidebar: serviceStub.betterSidebar(),
})

// Both present: better-sidebar must win, exactly one entry.
run('both sidebars present', {
  ...base(),
  sidebarRightTabs: serviceStub.sidebarRightTabs(),
  betterSidebar: serviceStub.betterSidebar(),
})

// Neither sidebar: page must stay inert rather than throw.
run('no sidebar service', base())
