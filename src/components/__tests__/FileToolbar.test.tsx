import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileToolbar } from '../FileToolbar'

const defaultProps = {
  currentFilePath: null,
  canOpenRecentFiles: true,
  recentFiles: [] as { filePath: string; lastOpened: string }[],
  isRecentMenuOpen: false,
  setIsRecentMenuOpen: vi.fn(),
  recentMenuRef: { current: null },
  recentMenuButtonRef: { current: null },
  recentMenuItemsRef: { current: [] as (HTMLButtonElement | null)[] },
  onNewFile: vi.fn(),
  onOpenFile: vi.fn(),
  onSaveFile: vi.fn(),
  onSaveAs: vi.fn(),
  onOpenRecentFile: vi.fn(),
  onClearRecentFiles: vi.fn(),
  onRecentMenuKeyDown: vi.fn(),
  onRecentMenuButtonKeyDown: vi.fn()
}

describe('FileToolbar', () => {
  it('renders New, Open, Recent, Save, Save As buttons', () => {
    render(<FileToolbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /recent/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save as/i })).toBeInTheDocument()
  })

  it('calls onNewFile when New is clicked', async () => {
    const user = userEvent.setup()
    const onNewFile = vi.fn()
    render(<FileToolbar {...defaultProps} onNewFile={onNewFile} />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    expect(onNewFile).toHaveBeenCalledTimes(1)
  })

  it('calls onOpenFile when Open is clicked', async () => {
    const user = userEvent.setup()
    const onOpenFile = vi.fn()
    render(<FileToolbar {...defaultProps} onOpenFile={onOpenFile} />)
    await user.click(screen.getByRole('button', { name: /open/i }))
    expect(onOpenFile).toHaveBeenCalledTimes(1)
  })

  it('calls onSaveFile when Save is clicked', async () => {
    const user = userEvent.setup()
    const onSaveFile = vi.fn()
    render(<FileToolbar {...defaultProps} onSaveFile={onSaveFile} currentFilePath="C:\\foo.scad" />)
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSaveFile).toHaveBeenCalledTimes(1)
  })

  it('disables Save when currentFilePath is null', () => {
    render(<FileToolbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })

  it('calls onSaveAs when Save As is clicked', async () => {
    const user = userEvent.setup()
    const onSaveAs = vi.fn()
    render(<FileToolbar {...defaultProps} onSaveAs={onSaveAs} />)
    await user.click(screen.getByRole('button', { name: /save as/i }))
    expect(onSaveAs).toHaveBeenCalledTimes(1)
  })

  it('disables Recent button when recentFiles is empty', () => {
    render(<FileToolbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /recent/i })).toBeDisabled()
  })

  it('disables Recent button when runtime does not support reopening recent files', () => {
    render(
      <FileToolbar
        {...defaultProps}
        canOpenRecentFiles={false}
        recentFiles={[{ filePath: 'C:\\a.scad', lastOpened: new Date().toISOString() }]}
      />
    )

    expect(screen.getByRole('button', { name: /recent/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /recent/i })).toHaveAttribute(
      'title',
      'Recent file reopen is only available in the desktop app'
    )
  })

  it('toggles recent menu when Recent is clicked and recentFiles exist', async () => {
    const user = userEvent.setup()
    const setIsRecentMenuOpen = vi.fn()
    render(
      <FileToolbar
        {...defaultProps}
        recentFiles={[{ filePath: 'C:\\a.scad', lastOpened: new Date().toISOString() }]}
        setIsRecentMenuOpen={setIsRecentMenuOpen}
      />
    )
    await user.click(screen.getByRole('button', { name: /recent/i }))
    expect(setIsRecentMenuOpen).toHaveBeenCalled()
  })

  it('shows recent files menu when open and has recent files', () => {
    render(
      <FileToolbar
        {...defaultProps}
        recentFiles={[{ filePath: 'C:\\foo\\model.scad', lastOpened: new Date().toISOString() }]}
        isRecentMenuOpen={true}
      />
    )
    expect(screen.getByRole('menu', { name: /recent files/i })).toBeInTheDocument()
    expect(screen.getByText('Recent Files')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /model\.scad/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /clear recent files/i })).toBeInTheDocument()
  })

  it('calls onOpenRecentFile when a recent file is clicked', async () => {
    const user = userEvent.setup()
    const onOpenRecentFile = vi.fn()
    render(
      <FileToolbar
        {...defaultProps}
        recentFiles={[{ filePath: 'C:\\model.scad', lastOpened: new Date().toISOString() }]}
        isRecentMenuOpen={true}
        onOpenRecentFile={onOpenRecentFile}
      />
    )
    await user.click(screen.getByRole('menuitem', { name: /model\.scad/i }))
    expect(onOpenRecentFile).toHaveBeenCalledWith('C:\\model.scad')
  })

  it('calls onClearRecentFiles when Clear Recent Files is clicked', async () => {
    const user = userEvent.setup()
    const onClearRecentFiles = vi.fn()
    render(
      <FileToolbar
        {...defaultProps}
        recentFiles={[{ filePath: 'C:\\a.scad', lastOpened: new Date().toISOString() }]}
        isRecentMenuOpen={true}
        onClearRecentFiles={onClearRecentFiles}
      />
    )
    await user.click(screen.getByRole('menuitem', { name: /clear recent files/i }))
    expect(onClearRecentFiles).toHaveBeenCalledTimes(1)
  })
})
