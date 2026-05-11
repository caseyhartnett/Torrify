import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ChatMarkdown from '../ChatMarkdown'

describe('ChatMarkdown', () => {
  it('renders headings, bold text, italic text, and inline code', () => {
    render(
      <ChatMarkdown text={'### Geometry\n#### Passo A: Criar o Motivo Base\nThis is **bold**, *italic*, and `cube()`.'} />
    )

    expect(screen.getByRole('heading', { name: 'Geometry', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Passo A: Criar o Motivo Base', level: 4 })).toBeInTheDocument()
    expect(screen.getByText('bold')).toHaveClass('font-semibold')
    expect(screen.getByText('italic')).toHaveClass('italic')
    expect(screen.getByText('cube()')).toHaveClass('font-mono')
  })

  it('renders unordered lists, ordered lists, and fenced code blocks', () => {
    render(
      <ChatMarkdown
        text={[
          '* First point',
          '  * Nested point',
          '',
          '1. Use curves',
          '2. Repeat pattern',
          '',
          '```openscad',
          'difference() {',
          '  cube(10);',
          '}',
          '```'
        ].join('\n')}
      />
    )

    expect(screen.getByText('First point')).toBeInTheDocument()
    expect(screen.getByText('Nested point')).toBeInTheDocument()
    expect(screen.getByText('Use curves')).toBeInTheDocument()
    expect(screen.getByText('Repeat pattern')).toBeInTheDocument()
    expect(screen.getByText(/difference\(\)/)).toBeInTheDocument()
  })

  it('renders pipe tables with headers and body cells', () => {
    render(
      <ChatMarkdown
        text={[
          '| Elemento Visual | Conceito CAD |',
          '| :--- | :--- |',
          '| **Contorno Externo** | `ellipse()` |',
          '| Borda Decorativa | Curvas Bezier |'
        ].join('\n')}
      />
    )

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Elemento Visual' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Conceito CAD' })).toBeInTheDocument()
    expect(within(table).getByText('Contorno Externo')).toBeInTheDocument()
    expect(within(table).getByText('ellipse()')).toBeInTheDocument()
    expect(within(table).getByText('Borda Decorativa')).toBeInTheDocument()
  })
})
