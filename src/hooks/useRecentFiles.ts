import { useState, useEffect, useCallback, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { logger } from '../utils/logger'

export interface RecentFile {
  filePath: string
  lastOpened: string
}

export function useRecentFiles() {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [isRecentMenuOpen, setIsRecentMenuOpen] = useState(false)
  const [recentMenuFocusIndex, setRecentMenuFocusIndex] = useState(-1)
  const recentMenuRef = useRef<HTMLDivElement>(null)
  const recentMenuButtonRef = useRef<HTMLButtonElement>(null)
  const recentMenuItemsRef = useRef<Array<HTMLButtonElement | null>>([])

  const loadRecentFiles = useCallback(async () => {
    try {
      const files = await window.electronAPI.getRecentFiles()
      setRecentFiles(files)
    } catch (error) {
      logger.error('Failed to load recent files', error)
    }
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadRecentFiles()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadRecentFiles])

  useEffect(() => {
    recentMenuItemsRef.current = Array(recentFiles.length + 1).fill(null)
  }, [recentFiles.length])

  const focusRecentMenuItem = useCallback((index: number) => {
    const itemCount = recentFiles.length + 1
    if (itemCount === 0) return
    const nextIndex = ((index % itemCount) + itemCount) % itemCount
    setRecentMenuFocusIndex(nextIndex)
    recentMenuItemsRef.current[nextIndex]?.focus()
  }, [recentFiles.length])

  const closeRecentMenu = useCallback(() => {
    setIsRecentMenuOpen(false)
    setRecentMenuFocusIndex(-1)
    recentMenuButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (isRecentMenuOpen && recentFiles.length > 0) {
      const timerId = window.setTimeout(() => focusRecentMenuItem(0), 0)
      return () => window.clearTimeout(timerId)
    } else {
      setRecentMenuFocusIndex(-1)
    }
  }, [isRecentMenuOpen, recentFiles.length, focusRecentMenuItem])

  const handleRecentMenuKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (!isRecentMenuOpen) return
      const itemCount = recentFiles.length + 1
      if (itemCount === 0) return
      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault()
          focusRecentMenuItem(recentMenuFocusIndex < 0 ? 0 : recentMenuFocusIndex + 1)
          break
        }
        case 'ArrowUp': {
          event.preventDefault()
          focusRecentMenuItem(recentMenuFocusIndex < 0 ? itemCount - 1 : recentMenuFocusIndex - 1)
          break
        }
        case 'Home':
          event.preventDefault()
          focusRecentMenuItem(0)
          break
        case 'End':
          event.preventDefault()
          focusRecentMenuItem(itemCount - 1)
          break
        case 'Escape':
          event.preventDefault()
          closeRecentMenu()
          break
        default:
          break
      }
    },
    [closeRecentMenu, focusRecentMenuItem, isRecentMenuOpen, recentFiles.length, recentMenuFocusIndex]
  )

  const handleRecentMenuButtonKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (!isRecentMenuOpen) setIsRecentMenuOpen(true)
        focusRecentMenuItem(0)
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (!isRecentMenuOpen) setIsRecentMenuOpen(true)
        focusRecentMenuItem(recentFiles.length)
      }
    },
    [focusRecentMenuItem, isRecentMenuOpen, recentFiles.length]
  )

  return {
    recentFiles,
    isRecentMenuOpen,
    setIsRecentMenuOpen,
    recentMenuRef,
    recentMenuButtonRef,
    recentMenuItemsRef,
    recentMenuFocusIndex,
    loadRecentFiles,
    closeRecentMenu,
    handleRecentMenuKeyDown,
    handleRecentMenuButtonKeyDown
  }
}
