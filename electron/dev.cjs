'use strict'

/**
 * 桌面端开发模式：先起 Vite，再拉起 Electron 指向该地址。
 * 用法：npm run app:dev
 */

const { spawn } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const PORT = 5173
const ORIGIN = `http://127.0.0.1:${PORT}`

const electronPath = require('electron')

const children = []

function shutdown(code = 0) {
  children.forEach((child) => {
    if (child && !child.killed) {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
    }
  })
  process.exit(code)
}

const vite = spawn(process.execPath, [VITE_BIN, '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env
})
children.push(vite)

vite.stdout.on('data', (chunk) => process.stdout.write(chunk))
vite.stderr.on('data', (chunk) => process.stderr.write(chunk))
vite.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`[dev] Vite 退出，code=${code}`)
    shutdown(code)
  }
})

function waitForServer(retries = 60) {
  const probe = (left) => {
    const req = http.get(ORIGIN, (res) => {
      res.resume()
      startElectron()
    })
    req.on('error', () => {
      if (left <= 0) {
        console.error('[dev] Vite 未在预期时间内就绪')
        shutdown(1)
        return
      }
      setTimeout(() => probe(left - 1), 500)
    })
    req.setTimeout(1000, () => req.destroy())
  }
  probe(retries)
}

function startElectron() {
  const env = { ...process.env, AAC_DEV_SERVER: ORIGIN }
  // 某些工具链会注入 ELECTRON_RUN_AS_NODE，会让 Electron 退化成 node，必须剔除
  delete env.ELECTRON_RUN_AS_NODE
  const electron = spawn(electronPath, ['.'], {
    cwd: ROOT,
    stdio: 'inherit',
    env
  })
  children.push(electron)
  electron.on('exit', (code) => shutdown(code || 0))
}

waitForServer()
process.on('SIGINT', () => shutdown(0))
