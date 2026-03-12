import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { RecentFile } from '../hooks/useRecentFiles'

function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

function isProjectFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().split('.').pop()
  return ext === 'torrify' || ext === 'opencursor' || ext === 'json'
}

function getFileTypeLabel(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop()
  if (ext === 'torrify' || ext === 'opencursor' || ext === 'json') return 'Project'
  if (ext === 'scad') return 'OpenSCAD'
  if (ext === 'py') return 'Python'
  return ext?.toUpperCase() || ''
}

export interface FileToolbarProps {
  currentFilePath: string | null
  canOpenRecentFiles: boolean
  recentFiles: RecentFile[]
  isRecentMenuOpen: boolean
  setIsRecentMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  recentMenuRef: React.RefObject<HTMLDivElement>
  recentMenuButtonRef: React.RefObject<HTMLButtonElement>
  recentMenuItemsRef: React.MutableRefObject<Array<HTMLButtonElement | null>>
  onNewFile: () => void
  onOpenFile: () => void
  onSaveFile: () => void
  onSaveAs: () => void
  onOpenRecentFile: (filePath: string) => void
  onClearRecentFiles: () => void
  onRecentMenuKeyDown: (event: ReactKeyboardEvent) => void
  onRecentMenuButtonKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
}

export function FileToolbar({
  currentFilePath,
  canOpenRecentFiles,
  recentFiles,
  isRecentMenuOpen,
  setIsRecentMenuOpen,
  recentMenuRef,
  recentMenuButtonRef,
  recentMenuItemsRef,
  onNewFile,
  onOpenFile,
  onSaveFile,
  onSaveAs,
  onOpenRecentFile,
  onClearRecentFiles,
  onRecentMenuKeyDown,
  onRecentMenuButtonKeyDown
}: FileToolbarProps) {
  return (
    <div className="flex items-center gap-1 border-r border-[#3e3e42] pr-2 mr-2">
      <button
        onClick={onNewFile}
        className="px-3 py-2 bg-[#3e3e42] hover:bg-[#4e4e52] rounded text-sm"
        title="New File (Ctrl+N)"
      >
        New
      </button>
      <button
        onClick={onOpenFile}
        className="px-3 py-2 bg-[#3e3e42] hover:bg-[#4e4e52] rounded text-sm"
        title="Open File (Ctrl+O)"
      >
        Open
      </button>
      <div className="relative" ref={recentMenuRef}>
        <button
          onClick={() => setIsRecentMenuOpen((prev) => !prev)}
          onKeyDown={onRecentMenuButtonKeyDown}
          ref={recentMenuButtonRef}
          className="px-3 py-2 bg-[#3e3e42] hover:bg-[#4e4e52] rounded text-sm flex items-center gap-1"
          title={canOpenRecentFiles ? 'Recent Files' : 'Recent file reopen is only available in the desktop app'}
          disabled={recentFiles.length === 0 || !canOpenRecentFiles}
          aria-haspopup="menu"
          aria-expanded={isRecentMenuOpen}
          aria-controls="recent-files-menu"
          aria-label="Recent files"
        >
          Recent
          {recentFiles.length > 0 && (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
        {isRecentMenuOpen && recentFiles.length > 0 && canOpenRecentFiles && (
          <div
            id="recent-files-menu"
            role="menu"
            aria-label="Recent files"
            className="absolute left-0 mt-2 w-80 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-96 overflow-y-auto"
            onKeyDown={onRecentMenuKeyDown}
          >
            <div className="px-3 py-2 text-xs text-gray-400 border-b border-[#3e3e42]">Recent Files</div>
            <div className="py-1">
              {recentFiles.map((file, index) => (
                <button
                  key={file.filePath}
                  onClick={() => onOpenRecentFile(file.filePath)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#3e3e42] flex items-center gap-2 group"
                  title={file.filePath}
                  role="menuitem"
                  ref={(el) => {
                    recentMenuItemsRef.current[index] = el
                  }}
                >
                  {isProjectFile(file.filePath) ? (
                    <svg
                      className="w-4 h-4 text-purple-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 text-gray-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  )}
                  <span className="truncate flex-1">{getFileName(file.filePath)}</span>
                  <span
                    className={`text-xs ml-2 flex-shrink-0 ${isProjectFile(file.filePath) ? 'text-purple-400' : 'text-gray-500'}`}
                  >
                    {getFileTypeLabel(file.filePath)}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatTimeAgo(file.lastOpened)}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-[#3e3e42]">
              <button
                onClick={onClearRecentFiles}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[#3e3e42] text-gray-400"
                role="menuitem"
                ref={(el) => {
                  recentMenuItemsRef.current[recentFiles.length] = el
                }}
              >
                Clear Recent Files
              </button>
            </div>
          </div>
        )}
      </div>
      <button
        onClick={onSaveFile}
        className="px-3 py-2 bg-[#3e3e42] hover:bg-[#4e4e52] rounded text-sm disabled:bg-[#2d2d30] disabled:cursor-not-allowed"
        disabled={!currentFilePath}
        title="Save (Ctrl+S)"
      >
        Save
      </button>
      <button
        onClick={onSaveAs}
        className="px-3 py-2 bg-[#3e3e42] hover:bg-[#4e4e52] rounded text-sm"
        title="Save As (Ctrl+Shift+S)"
      >
        Save As
      </button>
    </div>
  )
}
