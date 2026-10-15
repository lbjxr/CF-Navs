// 同步扩展图标：public/icon.png 是唯一事实来源，browser-extension/icon.png
// 是它的自包含副本（扩展以"加载已解压的扩展程序"方式直接加载该目录，
// 必须自带图标文件，不能引用 public/）。改完 public/icon.png 后跑一下本脚本。
import { copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
copyFileSync(resolve(root, 'public/icon.png'), resolve(root, 'browser-extension/icon.png'))
console.log('synced browser-extension/icon.png from public/icon.png')
