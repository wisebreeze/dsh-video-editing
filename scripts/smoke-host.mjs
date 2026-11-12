// Load the Host half against a stub Cordis context and report what it wired up.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function makeCtx() {
  const disposers = []
  const provided = new Map()
  const routes = []
  const services = new Set(['webServer', 'subprocess'])
  const ctx = {
    effect(fn) {
      const dispose = fn()
      disposers.push(typeof dispose === 'function' ? dispose : () => {})
      return () => {}
    },
    provide(name, value) {
      provided.set(name, value)
      return () => provided.delete(name)
    },
    get service() { return { services } },
    set service(_) {},
    get(name) { return name === 'webServer' ? webServer : name === 'subprocess' ? subprocess : undefined },
    inject(names, cb) { cb(ctx) },
    webServer: undefined,
  }
  const webServer = {
    register(route) {
      routes.push(route)
      return () => {}
    },
  }
  const subprocess = {
    spawn: () => ({
      done: Promise.resolve({ exitCode: 1 }),
      collected: { stdout: { readFrom: () => ({ text: '' }) }, stderr: { readFrom: () => ({ text: '' }) } },
    }),
  }
  ctx.get = (name) => (name === 'webServer' ? webServer : name === 'subprocess' ? subprocess : undefined)
  return { ctx, provided, routes, webServer, subprocess }
}

const mod = await import('../index.js')
const plugin = mod.default ?? mod
const name = plugin?.name ?? '(no name)'
const inject = plugin?.inject
const apply = plugin?.apply

console.log('plugin name   :', name)
console.log('inject        :', Array.isArray(inject) ? inject : inject && Object.keys(inject))
console.log('has apply     :', typeof apply === 'function')

const { ctx, provided, routes } = makeCtx()
const fakeCtx = Object.assign(ctx, { webServer: ctx.get('webServer') })
apply(fakeCtx)

console.log('provided      :', [...provided.keys()])
console.log('routes        :', routes.map((r) => `${r.kind} ${r.path}`))

const svc = provided.get('videoEditing')
if (svc) {
  console.log('service keys  :', Object.getOwnPropertyNames(Object.getPrototypeOf(svc)).filter((k) => k !== 'constructor'))
  const info = svc.info?.() ?? null
  console.log('info          :', JSON.stringify(info))
  const detect = await svc.detect()
  console.log('detect        :', JSON.stringify(detect))
}
