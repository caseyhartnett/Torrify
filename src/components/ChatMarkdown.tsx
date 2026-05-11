import type { ReactNode } from 'react'

type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'list'; ordered: boolean; items: Array<{ text: string; indent: number }> }
  | { type: 'table'; headers: string[]; rows: string[][] }

interface ChatMarkdownProps {
  readonly text: string
}

const headingPattern = /^(#{1,4})\s+(.+)$/
const listItemPattern = /^(\s*)([-*]|\d+\.)\s+(.+)$/
const tableSeparatorPattern = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/

function isTableLine(line: string): boolean {
  return line.includes('|') && line.trim().replace(/\|/g, '').trim().length > 0
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length) {
        i += 1
      }
      blocks.push({ type: 'code', language, code: codeLines.join('\n') })
      continue
    }

    const headingMatch = headingPattern.exec(trimmed)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3 | 4,
        text: headingMatch[2].trim()
      })
      i += 1
      continue
    }

    if (
      isTableLine(line) &&
      i + 1 < lines.length &&
      tableSeparatorPattern.test(lines[i + 1])
    ) {
      const headers = splitTableRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && isTableLine(lines[i])) {
        rows.push(splitTableRow(lines[i]))
        i += 1
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    const listMatch = listItemPattern.exec(line)
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2])
      const items: Array<{ text: string; indent: number }> = []
      while (i < lines.length) {
        const match = listItemPattern.exec(lines[i])
        if (!match || /\d+\./.test(match[2]) !== ordered) {
          break
        }
        items.push({
          indent: Math.floor(match[1].replace(/\t/g, '  ').length / 2),
          text: match[3].trim()
        })
        i += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraphLines: string[] = []
    while (i < lines.length) {
      const current = lines[i]
      const currentTrimmed = current.trim()
      if (
        !currentTrimmed ||
        currentTrimmed.startsWith('```') ||
        headingPattern.test(currentTrimmed) ||
        listItemPattern.test(current) ||
        (
          isTableLine(current) &&
          i + 1 < lines.length &&
          tableSeparatorPattern.test(lines[i + 1])
        )
      ) {
        break
      }
      paragraphLines.push(currentTrimmed)
      i += 1
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') })
  }

  return blocks
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    const key = `${match.index}-${token}`
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="px-1 py-0.5 rounded bg-black/30 text-blue-100 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key} className="font-semibold text-white">{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(<em key={key} className="italic">{token.slice(1, -1)}</em>)
    }
    lastIndex = tokenPattern.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

function renderMultilineInline(text: string): ReactNode[] {
  return text.split('\n').flatMap((line, index) => {
    const rendered = renderInline(line)
    return index === 0 ? rendered : [<br key={`br-${index}`} />, ...rendered]
  })
}

export function ChatMarkdown({ text }: ChatMarkdownProps) {
  const blocks = parseMarkdown(text)

  return (
    <div className="chat-markdown space-y-2 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const HeadingTag = (`h${block.level}`) as 'h1' | 'h2' | 'h3' | 'h4'
          const sizeClass = block.level === 1
            ? 'text-base'
            : block.level === 2
              ? 'text-[0.95rem]'
              : block.level === 3
                ? 'text-sm'
                : 'text-[0.82rem]'
          return (
            <HeadingTag key={index} className={`${sizeClass} font-semibold text-white mt-2 first:mt-0`}>
              {renderInline(block.text)}
            </HeadingTag>
          )
        }

        if (block.type === 'paragraph') {
          return (
            <p key={index} className="text-gray-200">
              {renderMultilineInline(block.text)}
            </p>
          )
        }

        if (block.type === 'code') {
          return (
            <pre key={index} className="overflow-x-auto rounded bg-black/30 border border-[#3e3e42] p-3 text-xs">
              <code className="font-mono text-blue-100">
                {block.language ? `// ${block.language}\n` : ''}
                {block.code}
              </code>
            </pre>
          )
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul'
          return (
            <ListTag
              key={index}
              className={`${block.ordered ? 'list-decimal' : 'list-disc'} list-outside pl-5 space-y-1 text-gray-200`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ marginLeft: `${item.indent * 1}rem` }}>
                  {renderInline(item.text)}
                </li>
              ))}
            </ListTag>
          )
        }

        return (
          <div key={index} className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  {block.headers.map((header, headerIndex) => (
                    <th key={headerIndex} className="border border-[#4e4e52] bg-[#252526] px-2 py-1 text-left font-semibold text-white">
                      {renderInline(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="border border-[#4e4e52] px-2 py-1 align-top text-gray-200">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

export default ChatMarkdown
