// CLI：node dist-server/migrate.mjs <d1-export.sql> <target.db>
// 目标文件必须不存在，避免误覆盖现有数据库。

import { existsSync, readFileSync } from 'node:fs'
import { importD1Export } from './migration'

const [sqlPath, targetPath] = process.argv.slice(2)
if (!sqlPath || !targetPath) {
  console.error('用法：migrate <d1-export.sql> <target.db>')
  process.exit(2)
}
if (existsSync(targetPath)) {
  console.error(`目标文件已存在，拒绝覆盖：${targetPath}`)
  process.exit(2)
}

const report = importD1Export(readFileSync(sqlPath, 'utf8'), targetPath)
console.log(JSON.stringify(report, null, 2))
if (report.integrity !== 'ok' || report.foreignKeyViolations > 0) {
  console.error('校验未通过：请勿将该数据库用于生产。')
  process.exit(1)
}
console.log('导入完成且校验通过。旧 jwt_secret 已轮换，管理员需重新登录。')
