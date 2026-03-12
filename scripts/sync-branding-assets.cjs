const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const sourcePath = path.join(rootDir, 'assets', 'branding', 'icon.png')
const targets = [
  path.join(rootDir, 'build', 'icon.png'),
  path.join(rootDir, 'public', 'logo.png'),
  path.join(rootDir, 'docs', 'assets', 'logo.png'),
]

if (!fs.existsSync(sourcePath)) {
  console.error(`Branding source not found: ${sourcePath}`)
  process.exit(1)
}

for (const targetPath of targets) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(sourcePath, targetPath)
  console.log(`Synced ${path.relative(rootDir, targetPath)}`)
}
