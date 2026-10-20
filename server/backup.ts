// CLI：node dist-server/backup.mjs <db-path> <backup-path>
// 在线一致性备份：通过一条只读连接对运行中的库执行 VACUUM INTO，
// 得到事务一致的单文件备份（WAL 模式下也安全）。目标文件必须不存在。

import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'

const [dbPath, targetPath] = process.argv.slice(2)
if (!dbPath || !targetPath) {
  console.error('用法：backup <db-path> <backup-path>')
  process.exit(2)
}
if (!existsSync(dbPath)) {
  console.error(`源数据库不存在：${dbPath}`)
  process.exit(2)
}
if (existsSync(targetPath)) {
  console.error(`目标文件已存在，拒绝覆盖：${targetPath}`)
  process.exit(2)
}

const sqlite = new DatabaseSync(dbPath, { readOnly: true })
try {
  const escaped = targetPath.replace(/'/g, "''")
  sqlite.exec(`VACUUM INTO '${escaped}'`)
  const check = new DatabaseSync(targetPath, { readOnly: true })
  const integrity = Object.values(check.prepare('PRAGMA integrity_check').get() as Record<string, unknown>)[0]
  check.close()
  if (integrity !== 'ok') {
    console.error(`备份完整性校验失败：${String(integrity)}`)
    process.exit(1)
  }
  console.log(`备份完成且完整性校验通过：${targetPath}`)
} finally {
  sqlite.close()
}
