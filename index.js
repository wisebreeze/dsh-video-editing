/**
 * Host half of dsh-video-editing.
 *
 * ONE operation set, owned here:
 *
 * - `detect()`      - is an FFmpeg binary available, and what is its version;
 * - `version()`     - the version string only;
 * - `start()`       - download a static FFmpeg build into this plugin's own
 *                     data directory, reporting byte progress;
 * - `progress(id)`  - the live progress of a running or finished install;
 * - `cancel(id)`    - stop one running install.
 *
 * A small static asset surface (`/video-editing/runtime/*`) exposes detection
 * and progress without authentication, so a page on any transport can poll a
 * download that this Host is performing.
 *
 * Nothing here edits the profile's `cordis.patch.yml`, and nothing is written
 * outside this plugin's data directory (`$DSH_HOME/plugin-data/video-editing`).
 *
 * @module dsh-video-editing
 */
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { inflateRawSync } from 'node:zlib'

/** Stable service key; the Client half reads the same name. */
const SERVICE = 'videoEditing'

/** Static asset prefix served by this plugin (never behind authentication). */
const RUNTIME_PREFIX = '/video-editing/runtime'

/** How many finished installs stay addressable for progress polling. */
const JOB_HISTORY = 8

/**
 * Download sources, in order. Each entry describes one archive: `kind` is the
 * container (`zip` today), `flavor` the platform dialect, and `sha256` a
 * known-good digest when one is pinned (`''` means "not pinned"; the archive
 * is still verified structurally before extraction).
 * @param platform - Node's `process.platform`.
 */
function sourcesFor(platform) {
  if (platform !== 'win32') return []
  return [
    {
      id: 'gyan-win64',
      label: 'gyan.dev release essentials',
      flavor: 'win64',
      kind: 'zip',
      url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
      sha256: '',
    },
  ]
}

/** The executable name this platform's FFmpeg ships under. */
function binaryName(platform) {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

/** Where this plugin keeps its own files (never the profile directory). */
function dataRoot() {
  // `DSH_HOME` already names the Harness home (`~/.dsh`) when it is set; a
  // Host launched without it still has a real home directory, and a temp
  // directory would silently lose an install on the next reboot.
  const dshHome = process.env.DSH_HOME
  const base = dshHome !== undefined && dshHome !== ''
    ? dshHome
    : join(process.env.USERPROFILE || process.env.HOME || tmpdir(), '.dsh')
  return join(base, 'plugin-data', 'video-editing')
}

/** Normalize a reported version line to a short, readable string. */
function parseVersion(text) {
  const match = /ffmpeg version\s+([^\s,]+)/iu.exec(text) ?? /^(\S+)/u.exec(text.trim())
  return match?.[1] ?? text.trim()
}

/** A readable one-line reason from an unknown error. */
function describeError(error) {
  if (error instanceof Error) {
    const code = error.code === undefined ? '' : ` (${String(error.code)})`
    return `${error.message}${code}`
  }
  return String(error)
}

/** Snapshot one job for JSON transport. */
function snapshot(job) {
  const out = {
    jobId: job.id,
    state: job.state,
    phase: job.phase,
    source: job.source,
    label: job.label,
    received: job.received,
    total: job.total,
    percent: job.percent,
    elapsedMs: Math.max(0, Date.now() - job.startedAt),
    updatedAt: job.updatedAt,
  }
  if (job.error != null) out.error = job.error
  if (job.version != null) out.version = job.version
  if (job.command != null) out.command = job.command
  return out
}

/** The service face, published as `ctx.videoEditing`. */
class VideoEditingService {
  /** @param ctx - owning Cordis context. */
  constructor(ctx) {
    this.ctx = ctx
    /** @type {Map<string, object>} */
    this.jobs = new Map()
    /** @type {string[]} absolute paths of binaries this service installed */
    this.installed = []
    this.root = dataRoot()
    this.binDir = join(this.root, 'bin')
    this.downloadDir = join(this.root, 'downloads')
  }

  /** The abstract subprocess service, when this profile mounts one. */
  subprocess() {
    return this.ctx.get('subprocess')
  }

  /** Every candidate executable this service would run, best first. */
  candidates() {
    const name = binaryName(process.platform)
    const list = [...this.installed, join(this.binDir, name)]
    if (process.platform === 'win32') {
      for (const base of [process.env.LOCALAPPDATA, process.env.ProgramFiles]) {
        if (typeof base === 'string' && base !== '') list.push(join(base, 'ffmpeg', 'bin', name))
      }
    }
    list.push(name)
    return [...new Set(list)]
  }

  /**
   * Probe one executable. A missing binary and a present-but-broken binary are
   * different answers, so the failure carries its reason.
   * @param command - absolute path or bare PATH name.
   * @param signal - optional cancellation.
   */
  async probe(command, signal) {
    const subprocess = this.subprocess()
    if (subprocess === undefined) {
      return { ok: false, command, reason: 'The subprocess service is unavailable in this profile.' }
    }
    let handle
    try {
      handle = subprocess.spawn({
        argv: [command, '-version'],
        cwd: this.root,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 1 << 16 },
          stderr: { maxBytes: 1 << 16 },
        },
        graceMs: 5_000,
        signal,
      })
    } catch (error) {
      return { ok: false, command, reason: describeError(error) }
    }
    let outcome
    try {
      outcome = await handle.done
    } catch (error) {
      return { ok: false, command, reason: describeError(error) }
    }
    const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
    const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    if (outcome.exitCode !== 0) {
      const line = stderr.trim().split(/\r?\n/u)[0]
      return { ok: false, command, reason: line || `FFmpeg exited with code ${String(outcome.exitCode)}` }
    }
    const header = stdout.trim() || stderr.trim()
    return { ok: true, command, version: parseVersion(header), header }
  }

  /**
   * Detection: the first candidate that answers `-version` wins.
   * @param signal - optional cancellation.
   */
  async detect(signal) {
    for (const command of this.candidates()) {
      const result = await this.probe(command, signal)
      if (result.ok) {
        return { installed: true, ...result, platform: process.platform }
      }
    }
    return {
      installed: false,
      platform: process.platform,
      sources: sourcesFor(process.platform),
      dataRoot: this.root,
    }
  }

  /** The version string only, or a readable absence. */
  async version(signal) {
    const result = await this.detect(signal)
    if (!result.installed) {
      return { installed: false, reason: 'FFmpeg is not installed yet.', platform: result.platform }
    }
    return { installed: true, version: result.version, command: result.command }
  }

  /**
   * Start one guided install. Returns immediately with the job id; the page
   * polls {@link progress}.
   * @param sourceId - a source id from `detect().sources`; the first by default.
   */
  start(sourceId) {
    const sources = sourcesFor(process.platform)
    if (sources.length === 0) {
      throw new Error(`No FFmpeg download source is configured for ${process.platform}.`)
    }
    const source = sources.find(entry => entry.id === sourceId) ?? sources[0]
    for (const job of this.jobs.values()) {
      if (job.state === 'downloading') throw new Error('An FFmpeg download is already running.')
    }
    const job = {
      id: randomUUID(),
      state: 'downloading',
      phase: 'preparing',
      source: source.id,
      label: source.label,
      received: 0,
      total: 0,
      percent: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      controller: new AbortController(),
      error: null,
      version: null,
      command: null,
    }
    this.jobs.set(job.id, job)
    this.trimJobs()
    void this.run(job, source).catch(error => {
      job.state = 'failed'
      job.phase = 'failed'
      job.error = describeError(error)
      job.updatedAt = Date.now()
    })
    return { jobId: job.id, source: source.id, label: source.label }
  }

  /** The live progress of one job (a finished job is still readable). */
  progress(jobId) {
    const job = jobId ? this.jobs.get(jobId) : undefined
    if (job !== undefined) return snapshot(job)
    const latest = [...this.jobs.values()].at(-1)
    return latest === undefined ? { state: 'idle', phase: 'idle' } : snapshot(latest)
  }

  /**
   * Cancel one running download.
   * @param jobId - the job to stop.
   */
  cancel(jobId) {
    const job = this.jobs.get(jobId)
    if (job === undefined || job.state !== 'downloading') return false
    job.cancelled = true
    job.controller.abort()
    return true
  }

  /** Keep only the most recent finished jobs addressable. */
  trimJobs() {
    const finished = [...this.jobs.values()].filter(job => job.state !== 'downloading')
    for (const job of finished.slice(0, Math.max(0, finished.length - JOB_HISTORY))) this.jobs.delete(job.id)
  }

  /**
   * The whole install: download to a temp file, verify, extract, probe.
   * @param job - the live job record.
   * @param source - the chosen archive.
   */
  async run(job, source) {
    await mkdir(this.downloadDir, { recursive: true })
    await mkdir(this.binDir, { recursive: true })
    const archive = join(this.downloadDir, `${source.id}-${job.id}.zip`)
    try {
      job.phase = 'downloading'
      job.updatedAt = Date.now()
      await this.download(job, source.url, archive)
      if (job.cancelled === true) return this.finishCancelled(job)

      job.phase = 'verifying'
      job.updatedAt = Date.now()
      const bytes = await readFile(archive)
      if (source.sha256 !== '') {
        const digest = createHash('sha256').update(bytes).digest('hex')
        if (digest !== source.sha256) throw new Error('The downloaded archive failed its checksum.')
      }

      job.phase = 'extracting'
      job.updatedAt = Date.now()
      const binary = await this.extract(bytes, archive)

      job.phase = 'probing'
      job.updatedAt = Date.now()
      const result = await this.probe(binary)
      if (!result.ok) throw new Error(`The downloaded FFmpeg did not run: ${result.reason}`)

      this.installed.unshift(binary)
      job.state = 'done'
      job.phase = 'done'
      job.percent = 100
      job.version = result.version
      job.command = binary
      job.updatedAt = Date.now()
      return job
    } finally {
      await rm(archive, { force: true })
    }
  }

  /** Stop a cancelled job without pretending it finished. */
  finishCancelled(job) {
    job.state = 'cancelled'
    job.phase = 'cancelled'
    job.error = null
    job.updatedAt = Date.now()
    return job
  }

  /**
   * Stream one archive with byte progress. A Content-Length becomes the total;
   * without one the bar stays indeterminate but bytes received keep counting.
   * @param job - live job record.
   * @param url - archive URL.
   * @param destination - file path to write.
   */
  async download(job, url, destination) {
    const response = await fetch(url, {
      signal: job.controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'dsh-video-editing' },
    })
    if (!response.ok || response.body === null) {
      throw new Error(`The download server answered ${String(response.status)} ${response.statusText}.`)
    }
    const declared = Number(response.headers.get('content-length') ?? '0')
    job.total = Number.isFinite(declared) && declared > 0 ? declared : 0
    let received = 0
    const body = Readable.fromWeb(response.body)
    body.on('data', chunk => {
      received += chunk.length
      job.received = received
      job.percent = job.total > 0 ? Math.min(100, Math.round((received / job.total) * 100)) : 0
      job.updatedAt = Date.now()
    })
    await pipeline(body, createWriteStream(destination))
    job.percent = job.total > 0 ? 100 : 0
    job.updatedAt = Date.now()
  }

  /**
   * Extract the FFmpeg binary out of a ZIP archive into `bin/`. A static build
   * puts it under `<build>/bin/ffmpeg.exe`; any member whose basename is the
   * executable's name is accepted, which also covers other packagings.
   * @param bytes - the whole archive.
   * @param archivePath - its path, for error messages.
   * @returns the extracted executable's absolute path.
   */
  async extract(bytes, archivePath) {
    const name = binaryName(process.platform)
    const members = readZipDirectory(bytes)
    const member = members.find(entry => !entry.directory && basenameOf(entry.name) === name)
    if (member === undefined) {
      throw new Error(`The archive did not contain ${name} (${archivePath}).`)
    }
    const data = readZipMember(bytes, member)
    const target = resolve(this.binDir, name)
    if (!target.startsWith(resolve(this.binDir) + sep)) {
      throw new Error('Refused to extract outside the plugin directory.')
    }
    await mkdir(this.binDir, { recursive: true })
    await writeFile(target, data, { mode: 0o755 })
    if (process.platform !== 'win32') await access(target)
    return target
  }
}

/**
 * The last path segment of a ZIP member name. Archives are written with `/`
 * by most tools, but some Windows tools emit `\`; both are accepted.
 * @param name - the member name.
 */
function basenameOf(name) {
  const segments = name.split(/[\\/]/u).filter(segment => segment !== '')
  return segments.at(-1) ?? ''
}

/**
 * Read a ZIP archive's central directory.
 * @param bytes - the archive.
 */
function readZipDirectory(bytes) {
  const endOffset = findEndOfCentralDirectory(bytes)
  if (endOffset < 0) throw new Error('The downloaded file is not a readable ZIP archive.')
  const total = bytes.readUInt16LE(endOffset + 10)
  let pointer = bytes.readUInt32LE(endOffset + 16)
  const entries = []
  for (let index = 0; index < total; index += 1) {
    if (pointer + 46 > bytes.length || bytes.readUInt32LE(pointer) !== 0x02014b50) {
      throw new Error('The ZIP central directory is malformed.')
    }
    const flags = bytes.readUInt16LE(pointer + 8)
    const method = bytes.readUInt16LE(pointer + 10)
    const compressedSize = bytes.readUInt32LE(pointer + 20)
    const nameLength = bytes.readUInt16LE(pointer + 28)
    const extraLength = bytes.readUInt16LE(pointer + 30)
    const commentLength = bytes.readUInt16LE(pointer + 32)
    const localOffset = bytes.readUInt32LE(pointer + 42)
    const name = bytes.subarray(pointer + 46, pointer + 46 + nameLength)
      .toString(flags & 0x0800 ? 'utf8' : 'latin1')
    entries.push({ name, method, compressedSize, localOffset, directory: name.endsWith('/') })
    pointer += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** Locate the end-of-central-directory signature, scanning backwards. */
function findEndOfCentralDirectory(bytes) {
  const stop = Math.max(0, bytes.length - 66_000)
  for (let index = bytes.length - 22; index >= stop; index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) return index
  }
  return -1
}

/**
 * Read one member's bytes, inflating it when it is deflated.
 * @param bytes - the archive.
 * @param entry - a directory entry from {@link readZipDirectory}.
 */
function readZipMember(bytes, entry) {
  const pointer = entry.localOffset
  if (pointer + 30 > bytes.length || bytes.readUInt32LE(pointer) !== 0x04034b50) {
    throw new Error('A ZIP member has an unreadable local header.')
  }
  const nameLength = bytes.readUInt16LE(pointer + 26)
  const extraLength = bytes.readUInt16LE(pointer + 28)
  const start = pointer + 30 + nameLength + extraLength
  const raw = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return raw
  if (entry.method === 8) return inflateRawSync(raw)
  throw new Error(`Unsupported ZIP compression method ${String(entry.method)}.`)
}

/** JSON response helper for the runtime assets. */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** A JSON failure envelope: the page shows `error` verbatim. */
function failure(error, status = 400) {
  return json({ error: describeError(error) }, status)
}

/**
 * Method guard for a route: answers 405 with `Allow` for anything else.
 * @param request - the incoming request.
 * @param allowed - the accepted method.
 */
function allow(request, allowed) {
  if (request.method === 'HEAD') return undefined
  if (request.method !== allowed) {
    return new Response(null, { status: 405, headers: { allow: `${allowed}, HEAD` } })
  }
  return undefined
}

/**
 * Run one action and answer its result or a readable failure.
 * @param run - the async action.
 */
async function action(run) {
  try {
    return json(await run())
  } catch (error) {
    return failure(error)
  }
}

/**
 * Static asset routes this plugin serves without authentication, so a page on
 * any transport can drive and observe a download this Host is performing.
 * @param server - the `webServer` service.
 * @param service - the video editing service.
 */
function registerRuntime(server, service) {
  const route = (path, handler) => server.register({
    kind: 'exact',
    path: `${RUNTIME_PREFIX}${path}`,
    resource: handler,
  })
  const disposers = [
    route('/info', async request => allow(request, 'GET') ?? json({
      version: '0.1.0',
      platform: process.platform,
      service: SERVICE,
    })),
    route('/detect', async request => allow(request, 'GET')
      ?? action(() => service.detect())),
    route('/progress', async request => {
      const blocked = allow(request, 'GET')
      if (blocked !== undefined) return blocked
      return json(service.progress(new URL(request.url).searchParams.get('jobId') ?? ''))
    }),
    route('/start', async request => {
      const blocked = allow(request, 'POST')
      if (blocked !== undefined) return blocked
      return action(async () => service.start(await readJson(request)))
    }),
    route('/cancel', async request => {
      const blocked = allow(request, 'POST')
      if (blocked !== undefined) return blocked
      const body = await readJson(request)
      return json({ cancelled: service.cancel(typeof body.jobId === 'string' ? body.jobId : '') })
    }),
  ]
  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

/**
 * Read a small JSON request body, tolerating an absent or empty one.
 *
 * A `WebResource` receives a WHATWG `Request`, whose body is a Web byte
 * stream (not a Node stream), so it is read through a reader rather than
 * `for await`.
 * @param request - the incoming request.
 */
async function readJson(request) {
  const type = request.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) return {}
  const body = request.body
  if (body === null) return {}
  const reader = body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1 << 16) throw new Error('The request body is too large.')
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  if (chunks.length === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Host plugin body.
 * @param ctx - Cordis context.
 */
export function apply(ctx) {
  const service = new VideoEditingService(ctx)
  ctx.effect(() => ctx.provide(SERVICE, service), 'video-editing: service')
  const server = ctx.get('webServer')
  if (server !== undefined) {
    ctx.effect(() => registerRuntime(server, service), 'video-editing: runtime assets')
  }
}

export { SERVICE as serviceName }
