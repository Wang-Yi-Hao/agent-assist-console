'use strict'

/**
 * afterPack：给 Windows 可执行文件写入图标与版本信息。
 *
 * 为什么自己写：electron-builder 默认用 app-builder 的 rcedit 做这件事，
 * 而该步骤会强制下载 winCodeSign 归档；该归档内含 macOS 的符号链接，
 * 在非管理员（未开启开发者模式）的 Windows 上解压必然失败，整条打包链就断了。
 * 这里改为纯 JS 实现（resedit 本身就是 electron-builder 的依赖），
 * 配合 win.signAndEditExecutable = false 使用。
 */

const path = require('node:path')
const fs = require('node:fs')
const { NtExecutable, NtExecutableResource, Resource } = require('resedit')

// resedit 的 exports 未开放子路径，这里按主入口所在目录解析，避免依赖内部导出表
const reseditDistDir = path.dirname(require.resolve('resedit'))
const IconFile = require(path.join(reseditDistDir, 'data', 'IconFile.js')).default

const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.ico')

function findMainExe(appOutDir, productFilename) {
  const expected = path.join(appOutDir, `${productFilename}.exe`)
  if (fs.existsSync(expected)) return expected
  const candidates = fs
    .readdirSync(appOutDir)
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .map((name) => path.join(appOutDir, name))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)
  return candidates[0] || null
}

function applyIcon(resource) {
  if (!fs.existsSync(ICON_PATH)) {
    console.warn('[afterPack] 未找到 build/icon.ico，跳过图标写入')
    return
  }
  const iconFile = IconFile.from(fs.readFileSync(ICON_PATH))
  const icons = iconFile.icons.map((item) => item.data)
  const groups = Resource.IconGroupEntry.fromEntries(resource.entries)
  if (groups.length === 0) {
    Resource.IconGroupEntry.replaceIconsForResource(resource.entries, 1, 1033, icons)
    return
  }
  for (const group of groups) {
    Resource.IconGroupEntry.replaceIconsForResource(resource.entries, group.id, group.lang, icons)
  }
}

function applyVersionInfo(resource, meta) {
  const infos = Resource.VersionInfo.fromEntries(resource.entries)
  if (infos.length === 0) return

  const numbers = String(meta.version)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)

  for (const info of infos) {
    const languages = info.getAllLanguagesForStringValues()
    const language = languages[0] || { lang: 1033, codepage: 1200 }
    info.setStringValues(language, {
      FileDescription: meta.description,
      ProductName: meta.productName,
      LegalCopyright: meta.copyright,
      CompanyName: meta.companyName,
      InternalName: meta.productFilename,
      OriginalFilename: `${meta.productFilename}.exe`,
      FileVersion: meta.version,
      ProductVersion: meta.version
    })
    const fixed = info.fixedInfo
    fixed.fileVersionMS = ((numbers[0] || 0) << 16) | (numbers[1] || 0)
    fixed.fileVersionLS = ((numbers[2] || 0) << 16) | (numbers[3] || 0)
    fixed.productVersionMS = fixed.fileVersionMS
    fixed.productVersionLS = fixed.fileVersionLS

    // 修改必须写回资源表才会生效
    info.outputToResourceEntries(resource.entries)
  }
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const { appOutDir, packager } = context
  const { appInfo } = packager
  const exePath = findMainExe(appOutDir, appInfo.productFilename)
  if (!exePath) {
    throw new Error(`[afterPack] 在 ${appOutDir} 中未找到可执行文件`)
  }

  const executable = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true })
  const resource = NtExecutableResource.from(executable)

  applyIcon(resource)
  applyVersionInfo(resource, {
    version: appInfo.version,
    productName: appInfo.productName,
    productFilename: appInfo.productFilename,
    description: appInfo.productName,
    companyName: appInfo.companyName || appInfo.productName,
    copyright: appInfo.copyright || ''
  })

  resource.outputResource(executable)
  fs.writeFileSync(exePath, Buffer.from(executable.generate()))
  console.log(`[afterPack] 已写入图标与版本信息：${path.basename(exePath)}`)
}
