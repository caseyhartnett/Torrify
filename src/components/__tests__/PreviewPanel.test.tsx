import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PreviewPanel from '../PreviewPanel'

vi.mock('../StlViewer', () => ({
  default: () => <div>STL Viewer</div>
}))

describe('PreviewPanel', () => {
  const mockOnRender = vi.fn()
  const mockOnSendSnapshot = vi.fn()

  it('renders the preview panel', () => {
    render(
      <PreviewPanel 
        image={null}
        stlBase64={null}
        isRendering={false}
        error={null}
        onRender={mockOnRender}
        onSendSnapshot={mockOnSendSnapshot}
      />
    )
    
    expect(screen.getByText('Render Preview')).toBeInTheDocument()
    expect(screen.getByText('OpenSCAD Output')).toBeInTheDocument()
  })

  it('displays "No preview yet" message when no image', () => {
    render(
      <PreviewPanel 
        image={null}
        stlBase64={null}
        isRendering={false}
        error={null}
        onRender={mockOnRender}
        onSendSnapshot={mockOnSendSnapshot}
      />
    )
    
    expect(screen.getByText('No model preview generated')).toBeInTheDocument()
    expect(screen.getByText(/Click "Render" or press Ctrl\+S/i)).toBeInTheDocument()
  })

  it('displays loading state when rendering', () => {
    render(
      <PreviewPanel 
        image={null}
        stlBase64={null}
        isRendering={true}
        error={null}
        onRender={mockOnRender}
        onSendSnapshot={mockOnSendSnapshot}
      />
    )
    
    // Check for spinner and loading text (use getAllByText since "Rendering..." appears in both button and text)
    const renderingTexts = screen.getAllByText('Rendering...')
    expect(renderingTexts.length).toBeGreaterThan(0)
  })

  it('displays error message when render fails', () => {
    const errorMessage = 'OpenSCAD WASM render timed out after 45s'
    const mockOnDiagnoseError = vi.fn()
    render(
      <PreviewPanel 
        image={null}
        stlBase64={null}
        isRendering={false}
        error={errorMessage}
        onRender={mockOnRender}
        onSendSnapshot={mockOnSendSnapshot}
        onDiagnoseError={mockOnDiagnoseError}
      />
    )
    
    expect(screen.getByText('Render Error')).toBeInTheDocument()
    expect(screen.getByText(errorMessage)).toBeInTheDocument()
    expect(screen.getByText(/browser render budget was exceeded/i)).toBeInTheDocument()
    expect(screen.getByText('Ask AI to Diagnose')).toBeInTheDocument()
  })

  it('displays rendered image when available', () => {
    const mockImage = 'data:image/png;base64,mockImageData'
    render(
      <PreviewPanel 
        image={mockImage}
        stlBase64={null}
        isRendering={false}
        error={null}
        onRender={mockOnRender}
        onSendSnapshot={mockOnSendSnapshot}
      />
    )
    
    const image = screen.getByAltText('OpenSCAD Rendered Output')
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute('src', mockImage)
  })

  it('disables refresh button while rendering', () => {
    render(
      <PreviewPanel 
        image={null}
        stlBase64={null}
        isRendering={true}
        error={null}
        onRender={mockOnRender}
        onSendSnapshot={mockOnSendSnapshot}
      />
    )
    
    const refreshButton = screen.getByRole('button', { name: /rendering/i })
    expect(refreshButton).toBeDisabled()
  })

  it('calls onRender when refresh button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <PreviewPanel 
        image={null}
        stlBase64={null}
        isRendering={false}
        error={null}
        onRender={mockOnRender}
        onSendSnapshot={mockOnSendSnapshot}
      />
    )
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i })
    await user.click(refreshButton)
    
    expect(mockOnRender).toHaveBeenCalledTimes(1)
  })

  it('calls onDiagnoseError when Ask AI to Diagnose button is clicked', async () => {
    const user = userEvent.setup()
    const errorMessage = 'Syntax error in code'
    const mockOnDiagnoseError = vi.fn()
    render(
      <PreviewPanel 
        image={null}
        stlBase64={null}
        isRendering={false}
        error={errorMessage}
        onRender={mockOnRender}
        onSendSnapshot={mockOnSendSnapshot}
        onDiagnoseError={mockOnDiagnoseError}
      />
    )
    
    const diagnoseButton = screen.getByRole('button', { name: /Ask AI to Diagnose/i })
    await user.click(diagnoseButton)
    
    expect(mockOnDiagnoseError).toHaveBeenCalledTimes(1)
    expect(mockOnDiagnoseError).toHaveBeenCalledWith(errorMessage)
  })

  it('does not show diagnose button when onDiagnoseError is not provided', () => {
    const errorMessage = 'Some error'
    render(
      <PreviewPanel 
        image={null}
        stlBase64={null}
        isRendering={false}
        error={errorMessage}
        onRender={mockOnRender}
        onSendSnapshot={mockOnSendSnapshot}
      />
    )
    
    expect(screen.getByText('Render Error')).toBeInTheDocument()
    expect(screen.queryByText('Ask AI to Diagnose')).not.toBeInTheDocument()
  })
})
