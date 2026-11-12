/**
 * Client half of dsh-video-editing.
 *
 * ONE React page (`VideoEditingPage`), registered as a right-Sidebar tab
 * through whichever registry the deployment offers:
 *
 * - the official column (`ctx.sidebarRightTabs` + the keyed
 *   `sidebar.right.pane.tab` slot), used when dsh-better-sidebar is absent;
 * - dsh-better-sidebar (`ctx.betterSidebar.registerTab`), which itself bridges
 *   every descriptor into the official column when both are installed.
 *
 * The two registries cannot share a `kind`: better-sidebar registers its own
 * native type *under the descriptor id*, and the official registry admits one
 * registration per kind. So exactly one path runs, chosen by what is present,
 * with the real column preferred while its service is live.
 *
 * All page data comes from the Host half over the package-private RPC
 * (`host.call`), so no Harness Client package is imported and the page keeps
 * working across host upgrades.
 */
window.__ModuleLoader__.load({
  id: 'dsh-video-editing',
  factory(require) {
    const React = require('react')
    const { createElement: h, useCallback, useEffect, useRef, useState } = React

    /** This package's locale namespace. */
    const NS = 'videoEditing'

    /** The implementation id used on the official column. */
    const OFFICIAL_ID = 'dsh-video-editing:page'

    /** The page kind on the official column; distinct from the better-sidebar id. */
    const OFFICIAL_KIND = 'videoEditing'

    /** The title used when the column passes only text. */
    const FALLBACK_TITLE = () => t('title')

    /** Locale dictionary, registered once per activation. */
    const EN = {
      'title': 'Video editing',
      'guide.title': 'Video editing',
      'guide.description': 'Check FFmpeg, install it, and start editing video.',
      'checking': 'Checking for FFmpeg…',
      'installed': 'FFmpeg is ready',
      'installed.hint': 'Video editing tools are available on this machine.',
      'missing': 'FFmpeg is not installed',
      'missing.hint': 'Video editing needs FFmpeg. Install it below and the editor unlocks when the download finishes.',
      'missing.source': 'Download source: {source}',
      'action.install': 'Install FFmpeg',
      'action.reinstall': 'Install again',
      'action.cancel': 'Cancel download',
      'action.retry': 'Check again',
      'progress.waiting': 'Starting the download…',
      'progress.downloading': 'Downloading {percent}%',
      'progress.received': '{received} of {total}',
      'progress.receivedUnknown': '{received} downloaded',
      'progress.verifying': 'Verifying the archive…',
      'progress.extracting': 'Extracting FFmpeg…',
      'progress.probing': 'Checking the installed build…',
      'progress.cancelled': 'Download cancelled',
      'progress.done': 'FFmpeg installed',
      'error.title': 'Something went wrong',
      'error.retry': 'Try again',
      'version.label': 'FFmpeg version',
      'version.unknown': 'unknown',
      'version.command': 'Binary',
      'empty.hint': 'Select a session to use the video editing page.',
      'unsupported': 'Automatic installation is not available on this platform. Install FFmpeg manually and press Check again.',
    }

    const ZH = {
      'title': '视频剪辑',
      'guide.title': '视频剪辑',
      'guide.description': '检测 FFmpeg，一键安装，然后开始剪辑视频。',
      'checking': '正在检测 FFmpeg…',
      'installed': 'FFmpeg 已就绪',
      'installed.hint': '本机已具备视频剪辑所需的工具。',
      'missing': '未检测到 FFmpeg',
      'missing.hint': '视频剪辑需要 FFmpeg。请在下方安装，下载完成后即可进入编辑页面。',
      'missing.source': '下载源：{source}',
      'action.install': '安装 FFmpeg',
      'action.reinstall': '重新安装',
      'action.cancel': '取消下载',
      'action.retry': '重新检测',
      'progress.waiting': '正在开始下载…',
      'progress.downloading': '正在下载 {percent}%',
      'progress.received': '已下载 {received} / {total}',
      'progress.receivedUnknown': '已下载 {received}',
      'progress.verifying': '正在校验安装包…',
      'progress.extracting': '正在解压 FFmpeg…',
      'progress.probing': '正在检查已安装的版本…',
      'progress.cancelled': '下载已取消',
      'progress.done': 'FFmpeg 安装完成',
      'error.title': '出错了',
      'error.retry': '重试',
      'version.label': 'FFmpeg 版本',
      'version.unknown': '未知',
      'version.command': '可执行文件',
      'empty.hint': '请选择一个会话以使用视频剪辑页面。',
      'unsupported': '当前平台暂不支持自动安装，请手动安装 FFmpeg 后点击重新检测。',
    }

    /** Translate through the host locale service, falling back to this table. */
    let translate = key => EN[key] ?? key

    /**
     * Bind the namespace and return a translate function.
     * @param ctx - client context.
     */
    function bindLocale(ctx) {
      const locale = ctx.get('locale')
      if (locale === undefined || typeof locale.register !== 'function') {
        return () => {}
      }
      const dispose = locale.register(NS, { en: EN, zh: ZH })
      const bound = typeof locale.bind === 'function' ? locale.bind(NS) : undefined
      if (bound !== undefined) {
        translate = (key, params) => {
          const text = bound(key)
          return params === undefined ? text : interpolate(text, params)
        }
      }
      return dispose
    }

    /** Fill `{name}` placeholders. */
    function interpolate(text, params) {
      return text.replace(/\{(\w+)\}/gu, (whole, name) => (name in params ? String(params[name]) : whole))
    }

    /** The page's stylesheet, token-only so both themes read correctly. */
    const CSS = `
.dve-root{box-sizing:border-box;height:100%;overflow:auto;padding:24px 20px;display:flex;flex-direction:column;gap:18px;
  color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55;
  background:var(--dsw-alias-bg-base)}
.dve-card{box-sizing:border-box;width:100%;max-width:460px;margin:0 auto;padding:22px;display:flex;flex-direction:column;gap:16px;
  background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:14px}
.dve-head{display:flex;align-items:center;gap:12px}
.dve-glyph{flex:none;width:34px;height:34px;display:flex;align-items:center;justify-content:center;
  color:var(--dsw-alias-label-secondary)}
.dve-title{font-size:15px;font-weight:600}
.dve-state{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dve-state[data-tone="ok"]{color:var(--dsw-alias-state-success-primary)}
.dve-state[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}
.dve-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.dve-actions{display:flex;flex-wrap:wrap;gap:8px}
.dve-btn{font:inherit;font-size:12px;padding:7px 14px;border-radius:8px;cursor:pointer;
  color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);
  border:.5px solid var(--dsw-alias-border-l2)}
.dve-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2)}
.dve-btn:disabled{opacity:.55;cursor:default}
.dve-btn[data-variant="primary"]{color:var(--dsw-alias-bg-base);background:var(--dsw-alias-brand-primary);border-color:transparent}
.dve-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dve-progress{display:flex;flex-direction:column;gap:6px}
.dve-track{height:6px;border-radius:3px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
.dve-fill{height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary);transition:width .2s ease}
.dve-fill[data-indeterminate="true"]{width:35%!important;animation:dve-slide 1.1s ease-in-out infinite}
@keyframes dve-slide{0%{transform:translateX(-100%)}100%{transform:translateX(285%)}}
.dve-meta{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums}
.dve-error{margin:0;padding:10px 12px;border-radius:8px;font-size:12px;white-space:pre-wrap;
  color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2);
  border:.5px solid var(--dsw-alias-state-error-primary)}
.dve-version{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border-radius:10px;
  background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1)}
.dve-version-label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dve-version-value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:20px;font-weight:600;word-break:break-all}
.dve-version-bin{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;word-break:break-all;
  color:var(--dsw-alias-label-secondary)}
`

    /** The page's glyph (a clapperboard), inheriting `currentColor`. */
    function ClapperGlyph(props) {
      const size = props.size ?? 24
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M3 8.5h18v10.2a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 18.7V8.5Z' }),
        h('path', { d: 'M3.8 4.6 20.2 3l.5 3.3L4.3 7.9 3.8 4.6Z' }),
        h('path', { d: 'm8.2 7.3.9-3.2M13 6.8l.9-3.2M17.8 6.3l.9-3.2' }),
      )
    }

    /** Format a byte count for the progress line. */
    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB']
      let value = bytes
      let unit = 0
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
      }
      return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
    }

    /**
     * The page's data channel: this plugin's own static routes on the origin
     * serving the page. A static client bundle has no package-private RPC
     * (`host.call` belongs to the dynamic runner), so plain `fetch` against
     * the plugin's routes is the transport that works everywhere.
     */
    const API_BASE = '/video-editing/runtime'

    /**
     * Call one Host method by name.
     *
     * `detect`, `progress` and `info` are GETs (safe, cacheless); `start` and
     * `cancel` are POSTs because they change state.
     * @param method - the Host method name.
     * @param args - its arguments.
     */
    async function callHost(method, args) {
      const query = method === 'progress' ? `?jobId=${encodeURIComponent(args?.jobId ?? '')}` : ''
      const readOnly = method === 'detect' || method === 'progress' || method === 'info'
      const response = await fetch(`${API_BASE}/${method}${query}`, readOnly
        ? { method: 'GET', credentials: 'same-origin', cache: 'no-store' }
        : {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(args ?? {}),
        })
      let body
      try {
        body = await response.json()
      } catch {
        throw new Error(`The video editing service did not answer correctly (HTTP ${response.status}).`)
      }
      if (!response.ok || body?.error !== undefined) {
        throw new Error(body?.error ?? `The video editing service failed (HTTP ${response.status}).`)
      }
      return body
    }

    /** One install progress frame, or `{ state: 'idle' }`. */
    function pollProgress(jobId) {
      return callHost('progress', { jobId })
    }

    /**
     * The whole page: detect, install with progress, then the version view.
     * @param props - slot props; `scope` names the session when the column
     *   provides one.
     */
    function VideoEditingPage(props) {
      const [detection, setDetection] = useState({ state: 'checking' })
      const [install, setInstall] = useState({ state: 'idle' })
      const alive = useRef(true)

      useEffect(() => () => { alive.current = false }, [])

      const refresh = useCallback(async () => {
        setDetection({ state: 'checking' })
        try {
          const result = await callHost('detect', {})
          if (alive.current) setDetection({ state: 'ready', ...result })
        } catch (error) {
          if (alive.current) {
            setDetection({ state: 'ready', installed: false, error: errorMessage(error) })
          }
        }
      }, [])

      useEffect(() => { void refresh() }, [refresh])

      const start = useCallback(async () => {
        setInstall({ state: 'starting' })
        try {
          const { jobId } = await callHost('start', {})
          if (!alive.current) return
          let current = { jobId, state: 'downloading', phase: 'preparing', percent: 0 }
          setInstall(current)
          while (alive.current) {
            const frame = await pollProgress(jobId)
            if (!alive.current) return
            current = { ...frame, jobId }
            setInstall(current)
            if (frame.state === 'done') {
              await refresh()
              return
            }
            if (frame.state === 'failed' || frame.state === 'cancelled') return
            await new Promise(resolve => setTimeout(resolve, 220))
          }
        } catch (error) {
          if (alive.current) setInstall({ state: 'failed', error: errorMessage(error) })
        }
      }, [refresh])

      const cancel = useCallback(async () => {
        if (install.jobId === undefined) return
        await callHost('cancel', { jobId: install.jobId })
      }, [install.jobId])

      const busy = install.state === 'starting'
        || install.state === 'downloading'
        || install.state === 'done' && detection.state === 'checking'

      const installed = detection.state === 'ready' && detection.installed === true
      const running = install.state === 'starting' || install.state === 'downloading'

      return h('div', { className: 'dve-root', 'data-video-editing': true },
        h('div', { className: 'dve-card' },
          h('div', { className: 'dve-head' },
            h('span', { className: 'dve-glyph' }, h(ClapperGlyph, { size: 30 })),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } },
              h('div', { className: 'dve-title' }, t('title')),
              h('div', {
                className: 'dve-state',
                'data-tone': installed ? 'ok' : detection.state === 'ready' ? 'warn' : undefined,
              }, detection.state === 'checking' ? t('checking')
                : installed ? t('installed')
                  : t('missing')),
            ),
          ),

          detection.state === 'ready' && detection.error !== undefined
            && h('p', { className: 'dve-error', role: 'alert' },
              `${t('error.title')}: ${detection.error}`),

          detection.state === 'ready' && installed
            && h('div', { className: 'dve-version' },
              h('span', { className: 'dve-version-label' }, t('version.label')),
              h('span', { className: 'dve-version-value' }, detection.version ?? t('version.unknown')),
              detection.command !== undefined && h('span', { className: 'dve-version-bin' }, `ffmpeg — ${detection.command}`),
            ),

          detection.state === 'ready' && !installed && h('p', { className: 'dve-hint' }, t('missing.hint')),

          detection.state === 'ready' && !installed && detection.sources !== undefined && detection.sources.length > 0
            && h('p', { className: 'dve-hint' }, t('missing.source', { source: detection.sources[0].label })),

          detection.state === 'ready' && !installed && (detection.sources === undefined || detection.sources.length === 0)
            && h('p', { className: 'dve-hint' }, t('unsupported')),

          running && h(ProgressPanel, { frame: install, onCancel: cancel }),
          install.state === 'failed' && h('p', { className: 'dve-error', role: 'alert' },
            `${t('error.title')}: ${install.error ?? ''}`),
          install.state === 'cancelled' && h('p', { className: 'dve-hint' }, t('progress.cancelled')),

          // The requested finished state is a bare page that states the
          // version. The reinstall/check controls stay, but only as a quiet
          // secondary row, so the version remains the page's whole content.
          h('div', { className: 'dve-actions' },
            detection.state === 'ready' && !installed && (detection.sources?.length ?? 0) > 0
              && h('button', {
                type: 'button', className: 'dve-btn', 'data-variant': 'primary',
                disabled: busy || running, onClick: () => { void start() },
              }, install.state === 'failed' ? t('action.retry') : t('action.install')),
            detection.state === 'ready' && h('button', {
              type: 'button', className: 'dve-btn', disabled: running,
              onClick: () => { void (installed ? start() : refresh()) },
            }, installed ? t('action.reinstall') : t('action.retry')),
          ),
        ),
      )
    }

    /** The install progress card. */
    function ProgressPanel(props) {
      const frame = props.frame
      const percent = typeof frame.percent === 'number' ? frame.percent : 0
      const total = typeof frame.total === 'number' && frame.total > 0 ? frame.total : 0
      const indeterminate = frame.state === 'starting' || (frame.phase === 'downloading' && total === 0)
      const label = frame.state === 'starting' ? t('progress.waiting')
        : frame.phase === 'verifying' ? t('progress.verifying')
          : frame.phase === 'extracting' ? t('progress.extracting')
            : frame.phase === 'probing' ? t('progress.probing')
              : t('progress.downloading', { percent })
      const detail = typeof frame.received === 'number'
        ? total > 0
          ? t('progress.received', { received: formatBytes(frame.received), total: formatBytes(total) })
          : t('progress.receivedUnknown', { received: formatBytes(frame.received) })
        : ''
      return h('div', { className: 'dve-progress', 'data-phase': frame.phase },
        h('div', { className: 'dve-track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100,
          'aria-valuenow': indeterminate ? undefined : percent, 'aria-label': t('progress.downloading', { percent }) },
          h('div', {
            className: 'dve-fill',
            'data-indeterminate': indeterminate ? 'true' : undefined,
            style: { width: `${indeterminate ? 35 : Math.max(0, Math.min(100, percent))}%` },
          }),
        ),
        h('div', { className: 'dve-meta' },
          h('span', undefined, label),
          h('span', undefined, detail),
        ),
        h('div', { className: 'dve-actions' },
          h('button', { type: 'button', className: 'dve-btn', onClick: props.onCancel }, t('action.cancel')),
        ),
      )
    }

    /** One readable line from an unknown failure. */
    function errorMessage(error) {
      if (error instanceof Error) return error.message
      if (typeof error === 'string') return error
      return String(error)
    }

    /** The page shell that feeds the locale translator. */
    function makePage() {
      /**
       * Re-bind the module translator on every render, so a language change
       * reaches the next paint. Reading the binding is pure; nothing is
       * registered here.
       * @param props - slot props, passed straight through.
       */
      function Page(props) {
        const bound = Page.binding
        if (bound !== undefined) {
          translate = (key, params) => {
            const text = bound(key)
            return params === undefined ? text : interpolate(text, params)
          }
        }
        return h(VideoEditingPage, props)
      }
      Page.binding = undefined
      Page.displayName = 'VideoEditingPage'
      return Page
    }

    /** Whether a session is on screen; some seats pass an empty scope. */
    function hasSession(scope) {
      return scope !== undefined && typeof scope.sessionId === 'string' && scope.sessionId !== ''
    }

    return {
      inject: ['slots', 'locale', 'styles'],
      apply(ctx) {
        ctx.effect(() => bindLocale(ctx), 'video-editing: locale')

        // Styles are optional: a deployment without the styles service still
        // gets a working page, just with the host's default tokens.
        const styles = ctx.get('styles')
        if (styles !== undefined && typeof styles.insert === 'function') {
          ctx.effect(() => styles.insert(CSS), 'video-editing: styles')
        }

        const Page = makePage()
        const locale = ctx.get('locale')
        Page.binding = locale !== undefined && typeof locale.bind === 'function' ? locale.bind(NS) : undefined

        // --- The page's one home -------------------------------------------
        // Both registries are requested in ONE fiber so the choice is made
        // from a single, consistent view of the services, and re-made whenever
        // either appears or disappears.
        //
        // dsh-better-sidebar wins when present: its service bridges every
        // descriptor into the official column itself (it registers the
        // descriptor id as a native kind), so also registering an official
        // type would show two capsules for one page — and the two registries
        // refuse a shared kind, so they cannot be merged into one entry.
        const home = ctx.inject(['sidebarRightTabs', 'betterSidebar'], injected => {
          const better = injected.get('betterSidebar')
          if (better !== undefined && typeof better.registerTab === 'function') {
            return better.registerTab({
              id: OFFICIAL_ID,
              title: () => FALLBACK_TITLE(),
              description: () => t('guide.description'),
              icon: size => h(ClapperGlyph, { size }),
              order: 40,
              single: true,
              component: props => h(Page, props),
            })
          }
          const tabs = injected.get('sidebarRightTabs')
          if (tabs === undefined || typeof tabs.register !== 'function') return
          const disposeType = tabs.register({
            id: OFFICIAL_ID,
            kind: OFFICIAL_KIND,
            priority: 'extension',
            keepMounted: true,
            title: () => FALLBACK_TITLE(),
            guide: [{
              id: 'video-editing',
              order: 40,
              title: () => FALLBACK_TITLE(),
              description: () => t('guide.description'),
              icon: props => h(ClapperGlyph, { size: props?.size ?? 16 }),
            }],
          })
          const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: OFFICIAL_ID,
          }, Page))
          const disposeTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab.title',
            key: OFFICIAL_ID,
          }, () => h('span', undefined, FALLBACK_TITLE())))
          return () => {
            disposeTitle()
            disposeBody()
            disposeType()
          }
        })
        ctx.effect(() => () => { void home.dispose() }, 'video-editing: sidebar registration')
      },
    }
  },
})
