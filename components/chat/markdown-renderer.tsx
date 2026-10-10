import React from "react"
import { CodeBlock } from "./code-block"

interface MarkdownRendererProps {
  content: string
}

// ─── Inline parser ───────────────────────────────────────────────────────────
// Handles: **bold**, *italic*, `inline code`
// Returns an array of React nodes (strings or elements)
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Pattern: bold (**...**), italic (*...*), inline code (`...`)
  const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+)`)|\[([^\]\n]+)\]\(([^\s)]+)\)/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let nodeIndex = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (match[1] !== undefined) {
      // **bold**
      nodes.push(
        <strong key={`${keyPrefix}-b-${nodeIndex++}`} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      )
    } else if (match[3] !== undefined) {
      // *italic*
      nodes.push(
        <em key={`${keyPrefix}-i-${nodeIndex++}`} className="italic text-foreground/80">
          {match[4]}
        </em>
      )
    } else if (match[5] !== undefined) {
      // `inline code`
      nodes.push(
        <code
          key={`${keyPrefix}-c-${nodeIndex++}`}
          dir="ltr"
          className="[unicode-bidi:isolate] [overflow-wrap:anywhere] px-1.5 py-0.5 rounded text-[12px] font-mono bg-surface-2 border border-border/50 text-lime/90"
        >
          {match[6]}
        </code>
      )
    }

    if (match[7] !== undefined) {
      const href = match[8]
      // Model text is untrusted: links navigate only; evidence handles are not actions.
      if (/^https?:\/\//i.test(href)) nodes.push(<a key={`${keyPrefix}-a-${nodeIndex++}`} href={href} target="_blank" rel="noopener noreferrer" className="underline text-lime">{match[7]}</a>)
      else nodes.push(<span key={`${keyPrefix}-ref-${nodeIndex++}`} className="font-mono text-xs text-muted-foreground">{match[7]}</span>)
    }
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

// ─── Block parser ─────────────────────────────────────────────────────────────
// Splits content into blocks: fenced code, headings, lists, paragraphs
interface Block {
  type: "code" | "heading" | "ul" | "ol" | "paragraph" | "blank" | "table"
  rows?: string[][]
  level?: number      // for headings
  language?: string   // for code
  content?: string    // single line content
  items?: string[]    // for lists
  start?: number     // preserve an explicitly numbered list after a paragraph break
  code?: string       // for code blocks
}

function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = []
  const lines = raw.split("\n")
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim())
      const rows = [cells(line)]
      i += 2
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]))
      blocks.push({ type: "table", rows })
      continue
    }

    // Fenced code block
    if (/^```/.test(line)) {
      const langMatch = line.match(/^```(\w*)/)
      const language = langMatch?.[1] ?? ""
      const codeLines: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      blocks.push({ type: "code", language, code: codeLines.join("\n") })
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2],
      })
      i++
      continue
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ""))
        i++
      }
      blocks.push({ type: "ul", items })
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const start = Number.parseInt(line, 10)
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""))
        i++
      }
      blocks.push({ type: "ol", items, start })
      continue
    }

    // Blank line
    if (line.trim() === "") {
      blocks.push({ type: "blank" })
      i++
      continue
    }

    // Paragraph: accumulate consecutive non-special lines
    const paragraphLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i])
    ) {
      paragraphLines.push(lines[i])
      i++
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", content: paragraphLines.join(" ") })
    }
  }

  return blocks
}

// ─── Main renderer ────────────────────────────────────────────────────────────
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null

  const blocks = parseBlocks(content)

  // Filter consecutive blanks to single gap
  const rendered: React.ReactNode[] = []
  let lastWasBlank = false
  let blockIndex = 0

  for (const block of blocks) {
    if (block.type === "blank") {
      lastWasBlank = true
      continue
    }

    const key = `block-${blockIndex++}`

    switch (block.type) {
      case "table":
        rendered.push(<div key={key} className="overflow-x-auto my-3"><table className="w-full text-sm border-collapse"><thead><tr>{block.rows?.[0].map((cell, column) => <th key={column} scope="col" className="border border-border/50 p-2 text-start">{parseInline(cell, `${key}-h-${column}`)}</th>)}</tr></thead><tbody>{block.rows?.slice(1).map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className="border border-border/50 p-2">{parseInline(cell, `${key}-${index}-${column}`)}</td>)}</tr>)}</tbody></table></div>)
        break
      case "code":
        rendered.push(
          <CodeBlock
            key={key}
            language={block.language}
            code={block.code ?? ""}
          />
        )
        break

      case "heading": {
        const inline = parseInline(block.content ?? "", key)
        if (block.level === 1) {
          rendered.push(
            <h1
              key={key}
              className="text-lg font-semibold text-foreground mt-4 mb-2 first:mt-0"
            >
              {inline}
            </h1>
          )
        } else if (block.level === 2) {
          rendered.push(
            <h2
              key={key}
              className="text-base font-semibold text-foreground mt-3.5 mb-1.5 first:mt-0"
            >
              {inline}
            </h2>
          )
        } else {
          rendered.push(
            <h3
              key={key}
              className="text-sm font-semibold text-foreground/90 mt-3 mb-1 first:mt-0"
            >
              {inline}
            </h3>
          )
        }
        break
      }

      case "ul":
        rendered.push(
          <ul key={key} className="my-2 space-y-1 pl-0">
            {(block.items ?? []).map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-foreground/85 leading-relaxed"
              >
                <span className="mt-1.5 w-1 h-1 rounded-full bg-lime/60 shrink-0" aria-hidden="true" />
                <span>{parseInline(item, `${key}-li-${idx}`)}</span>
              </li>
            ))}
          </ul>
        )
        break

      case "ol":
        rendered.push(
          <ol key={key} start={block.start} className="my-2 space-y-1 pl-0">
            {(block.items ?? []).map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-sm text-foreground/85 leading-relaxed"
              >
                <span className="font-mono text-[11px] text-lime/70 shrink-0 w-4 text-right mt-0.5 select-none">
                  {(block.start ?? 1) + idx}.
                </span>
                <span>{parseInline(item, `${key}-oli-${idx}`)}</span>
              </li>
            ))}
          </ol>
        )
        break

      case "paragraph": {
        const inline = parseInline(block.content ?? "", key)
        rendered.push(
          <p
            key={key}
            className={`text-sm text-foreground/85 leading-relaxed ${lastWasBlank ? "mt-3" : "mt-1.5"} first:mt-0`}
          >
            {inline}
          </p>
        )
        break
      }

      default:
        break
    }

    lastWasBlank = false
  }

  return (
    <div className="markdown-content space-y-0.5">
      {rendered}
    </div>
  )
}
