// 在真实扩展环境里加载 newtab 页面并自检
const PORT = 9223
const IDS = [
  'lblkceheepmjfpnaplagjliaoifgpdjg',
  'gaboppojefnipphnflmcgcekppdbadhk',
  'pflhepneecjklgagkphgaoijcbjdhbid',
  'bhigglmnmklndmcfpigbnanocccoogbk',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function listTargets() {
  return fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
}

async function connect() {
  const targets = await listTargets()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const events = []
  ws.addEventListener('message', (e) => {
    const data = JSON.parse(e.data)
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data)
      pending.delete(data.id)
    } else if (data.method) {
      events.push(data)
    }
  })
  await new Promise((r) => ws.addEventListener('open', r))
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id
      pending.set(mid, resolve)
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  return { send, events, close: () => ws.close() }
}

const { send, events, close } = await connect()
await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')

let hit = null
for (const id of IDS) {
  const url = `chrome-extension://${id}/index.html`
  await send('Page.navigate', { url })
  await sleep(1800)
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector('#app')
      const hasApp = !!app && app.children.length > 0
      return {
        href: location.href,
        title: document.title,
        hasApp,
        widgets: document.querySelectorAll('.shell').length,
        links: document.querySelectorAll('.link').length,
        search: !!document.querySelector('.search__input'),
      }
    })()`,
    returnByValue: true,
  })
  const value = res.result?.result?.value
  if (value?.hasApp) {
    hit = { id, url, ...value }
    break
  }
}

if (!hit) {
  console.log(JSON.stringify({ ok: false, reason: 'no extension page rendered', ids: IDS }, null, 2))
  close()
  process.exit(1)
}

// 进一步在扩展环境里验证：chrome.storage 可用性、_favicon、config 落盘
const probe = await send('Runtime.evaluate', {
  expression: `(async () => {
    const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage?.local
    let storageOk = false
    try {
      await chrome.storage.local.set({ '__probe': 1 })
      const got = await chrome.storage.local.get('__probe')
      storageOk = got.__probe === 1
      await chrome.storage.local.remove('__probe')
    } catch (e) { storageOk = String(e) }
    const cfg = await chrome.storage.local.get('edge-nav:config')
    const img = document.querySelector('.link__icon img')
    return {
      hasChrome,
      storageOk,
      faviconSrc: img ? img.getAttribute('src') : null,
      faviconLoaded: img ? img.complete && img.naturalWidth > 0 : false,
      configSaved: !!cfg['edge-nav:config'],
      clock: document.querySelector('.clock__time')?.textContent?.trim(),
      weatherTemp: document.querySelector('.weather__temp')?.textContent?.trim(),
    }
  })()`,
  returnByValue: true,
  awaitPromise: true,
})

const errors = events
  .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
  .map((e) => e.params.entry.text)
  .slice(0, 6)

console.log(JSON.stringify({ ok: true, page: hit, probe: probe.result?.result?.value, errors }, null, 2))
close()
