import { ipcMain, type BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { WindowTitleSchema } from '../validation/schemas'
import { getErrorMessage } from '../utils/error'
import { logger } from '../utils/logger'

const DOC_FILES = [
  'README.md',
  'docs/index.md',
  'docs/getting-started/QUICKSTART.md',
  'docs/getting-started/START_HERE.md',
  'docs/getting-started/START_APP.md',
  'docs/developer/README.md',
  'docs/developer/TESTING.md',
  'docs/architecture/ARCHITECTURE.md',
  'docs/features/LLM_INTEGRATION.md',
  'docs/features/SETTINGS.md',
  'docs/features/WHATS_NEW.md',
  'docs/reference/QUICK_REFERENCE.md',
  'docs/reference/index.md'
]

export function registerWindowDocHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('set-window-title', (_event, titleInput: unknown) => {
    const parseResult = WindowTitleSchema.safeParse(titleInput)
    if (!parseResult.success) {
      return
    }
    const win = getMainWindow()
    if (win) {
      win.setTitle(parseResult.data)
    }
  })

  ipcMain.handle('load-documentation', async () => {
    try {
      const docs: Record<string, string> = {}
      const projectRoot = process.env.VITE_DEV_SERVER_URL
        ? path.join(__dirname, '../../')
        : path.join(__dirname, '../')

      for (const docFile of DOC_FILES) {
        const filePath = path.join(projectRoot, docFile)
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            docs[docFile] = content
          } catch (error) {
            logger.error(`Failed to read ${docFile}`, error)
          }
        }
      }

      return { success: true, docs }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
