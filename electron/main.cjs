'use strict'

/**
 * 全渠道坐席辅助系统 · 桌面端主进程
 *
 * 关键点：
 * 1. 用自定义 app:// 协议（standard + secure）加载打包后的 dist，而不是 file://。
 *    file:// 下两个窗口的 localStorage / BroadcastChannel 归属不稳定，
 *    而本系统的跨账号联动完全依赖这两者，必须给所有窗口一个共同的、可持久化的 origin。
 * 2. 客户窗口走 window.open，由 setWindowOpenHandler 接管成独立 BrowserWindow。
 * 3. 关闭后台节流：坐席页在后台时也要能实时收到客户消息。
 */

const { app, BrowserWindow, Menu, protocol, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')

const APP_SCHEME = 'app'
const APP_HOST = 'aac'
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
const ROOT = path.join(__dirname, '..')
const DIST_DIR = path.join(ROOT, 'dist')
const DEV_SERVER = process.env.AAC_DEV_SERVER || ''
const IS_DEV = Boolean(DEV_SERVER)

const CUSTOMER_TITLE = '在线咨询'
const MAIN_TITLE = '全渠道坐席辅助系统'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
}

/** 自定义协议必须在 ready 之前声明特权 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

let mainWindow = null
let customerWindow = null
let quitting = false

/* ------------------------------ 窗口状态记忆 ------------------------------ */

function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function readWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    if (!raw || typeof raw !== 'object') return null
    const { width, height, x, y, maximized } = raw
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    return { width: Math.max(1180, width), height: Math.max(700, height), x, y, maximized: Boolean(maximized) }
  } catch {
    return null
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return
  try {
    const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
    const payload = { ...bounds, maximized: win.isMaximized() }
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
    fs.writeFileSync(stateFile(), JSON.stringify(payload))
  } catch {
    /* 记忆失败不影响使用 */
  }
}

/* ------------------------------ app:// 资源服务 ------------------------------ */

function mimeOf(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    let pathname = '/'
    try {
      pathname = new URL(request.url).pathname
    } catch {
      return new Response('Bad Request', { status: 400 })
    }

    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^[/\\]+/, '')
    const target = path.resolve(DIST_DIR, relative)

    // 防目录穿越
    if (target !== DIST_DIR && !target.startsWith(DIST_DIR + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      const data = await fsp.readFile(target)
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mimeOf(target), 'Cache-Control': 'no-cache' }
      })
    } catch {
      // 前端是 hash 路由，未命中的静态资源一律 404；直接访问根路径已回落到 index.html
      return new Response('Not Found', { status: 404 })
    }
  })
}

/* ------------------------------ 窗口创建 ------------------------------ */

const baseWebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
  // 坐席窗口在后台（客户窗口获得焦点）时仍要实时收消息
  backgroundThrottling: false
}

function loadRoute(win, hash) {
  if (IS_DEV) {
    win.loadURL(`${DEV_SERVER}/${hash || ''}`)
  } else {
    win.loadURL(`${APP_ORIGIN}/index.html${hash || ''}`)
  }
}

/**
 * 判断是否为应用内部地址。
 * 注意：custom scheme 在 Node 的 URL 解析里不是 special scheme，parsed.origin 恒为 "null"，
 * 所以只能比对 protocol + host，不能用 origin。
 */
function isInternalUrl(url) {
  let parsed = null
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (IS_DEV) {
    const dev = new URL(DEV_SERVER)
    return parsed.protocol === dev.protocol && parsed.host === dev.host
  }
  return parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST
}

function hardenContents(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    let parsed = null
    try {
      parsed = new URL(url)
    } catch {
      return { action: 'deny' }
    }

    if (isInternalUrl(url)) {
      // 客户对话窗口：复用已存在的窗口，避免重复弹出
      if (parsed.hash.includes('/customer-chat')) {
        if (customerWindow && !customerWindow.isDestroyed()) {
          customerWindow.show()
          customerWindow.focus()
          return { action: 'deny' }
        }
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 880,
            minWidth: 400,
            minHeight: 620,
            title: CUSTOMER_TITLE,
            icon: path.join(__dirname, 'icon.png'),
            autoHideMenuBar: true,
            backgroundColor: '#eef3fb',
            webPreferences: baseWebPreferences
          }
        }
      }
      return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: baseWebPreferences } }
    }

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return
    event.preventDefault()
    if (/^https?:/.test(url) || url.startsWith('mailto:')) shell.openExternal(url)
  })

  // 不申请系统级权限（摄像头、定位等），演示系统用不到
  contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
}

function createMainWindow() {
  const saved = readWindowState()

  mainWindow = new BrowserWindow({
    width: saved?.width || 1440,
    height: saved?.height || 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1180,
    minHeight: 700,
    show: false,
    title: MAIN_TITLE,
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0f1b2e',
    autoHideMenuBar: true,
    webPreferences: baseWebPreferences
  })

  if (saved?.maximized) mainWindow.maximize()

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', () => saveWindowState(mainWindow))
  mainWindow.on('closed', () => {
    mainWindow = null
    if (!quitting) app.quit()
  })

  mainWindow.webContents.on('did-create-window', (child) => {
    if (child.webContents.getURL().includes('/customer-chat')) {
      customerWindow = child
      child.on('closed', () => {
        customerWindow = null
      })
    }
  })

  hardenContents(mainWindow.webContents)
  loadRoute(mainWindow, '#/')

  // F12 / Ctrl+Shift+I 打开调试（界面上不暴露入口）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const devtoolsCombo = input.control && input.shift && input.key.toLowerCase() === 'i'
    if (input.key === 'F12' || devtoolsCombo) {
      mainWindow.webContents.toggleDevTools()
      event.preventDefault()
    }
  })
}

/* ------------------------------ 生命周期 ------------------------------ */

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.aac.agentassist')
    Menu.setApplicationMenu(null)
    registerAppProtocol()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('before-quit', () => {
    quitting = true
    saveWindowState(mainWindow)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
