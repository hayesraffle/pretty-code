import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronDown, ChevronRight } from 'lucide-react'
import CodeBlock from './CodeBlock'
import InlineCode from './InlineCode'
import SemanticBlock from './SemanticBlock'
import { parseMarkdownSections } from '../utils/markdownSections'

// Patterns to detect tool operations in text
const TOOL_PATTERNS = [
  { regex: /^(Reading|Read)\s+(?:file\s+)?[`']?([^`'\n]+)[`']?/i, type: 'read', getTitle: (m) => m[2] },
  { regex: /^(Editing|Edit|Updated|Updating)\s+(?:file\s+)?[`']?([^`'\n]+)[`']?/i, type: 'file_edit', getTitle: (m) => m[2] },
  { regex: /^(Running|Ran|Executing)\s+(?:command\s+)?[`']?(.+)[`']?/i, type: 'bash', getTitle: (m) => m[2] },
  { regex: /^(Searching|Search|Grep|Glob)\s+(?:for\s+)?[`']?(.+)[`']?/i, type: 'search', getTitle: (m) => m[2] },
  { regex: /^(Created|Creating)\s+(?:file\s+|directory\s+)?[`']?([^`'\n]+)[`']?/i, type: 'success', getTitle: (m) => m[2] },
  { regex: /^(Error|Failed|Not found)[:.]?\s*(.+)?/i, type: 'error', getTitle: (m) => m[2] || '' },
]

function detectToolPattern(text) {
  for (const pattern of TOOL_PATTERNS) {
    const match = text.match(pattern.regex)
    if (match) {
      return { type: pattern.type, title: pattern.getTitle(match), match }
    }
  }
  return null
}

// Base markdown component configuration (components that don't need mode)
const baseMarkdownComponents = {
  // Paragraphs - with semantic block detection
  p: ({ children }) => {
    // Get text content for pattern detection
    const textContent = typeof children === 'string'
      ? children
      : Array.isArray(children)
        ? children.map(c => typeof c === 'string' ? c : '').join('')
        : ''

    const toolMatch = detectToolPattern(textContent)

    if (toolMatch) {
      return (
        <SemanticBlock
          type={toolMatch.type}
          title={toolMatch.title}
          defaultCollapsed={toolMatch.type === 'read'}
        >
          <p className="leading-relaxed text-text">{children}</p>
        </SemanticBlock>
      )
    }

    return <p className="my-3 leading-relaxed">{children}</p>
  },

  // Headings (h1 is not collapsible, h2-h4 are handled by section wrapper)
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold mt-6 mb-4 text-text">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold mt-5 mb-3 text-text">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold mt-4 mb-2 text-text">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-medium mt-3 mb-2 text-text">{children}</h4>
  ),

  // Lists
  ul: ({ children }) => (
    <ul className="my-3 ml-4 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 ml-4 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-accent hover:text-accent-hover underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-accent pl-4 my-4 italic text-text-muted">
      {children}
    </blockquote>
  ),

  // Horizontal rule
  hr: () => <hr className="my-6 border-border" />,

  // Strong/Bold
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),

  // Tables
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full border border-border rounded-lg overflow-hidden">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-surface">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2 text-left font-semibold border-b border-border">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2 border-b border-border">{children}</td>
  ),
}

// Code component - uses CodeBlock for blocks, InlineCode for inline
function CodeRenderer({ node, inline, className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : 'javascript'
  const code = String(children).replace(/\n$/, '')

  // Code blocks
  if (!inline && (match || code.includes('\n'))) {
    return <CodeBlock code={code} language={language} />
  }

  // Inline code - uses shared InlineCode component with semantic styling
  return <InlineCode language={language}>{children}</InlineCode>
}

// Collapsible heading component
function CollapsibleHeading({ level, children, isCollapsed, onToggle }) {
  const sizeClasses = {
    2: 'text-xl font-semibold mt-5 mb-3',
    3: 'text-lg font-semibold mt-4 mb-2',
    4: 'text-base font-medium mt-3 mb-2',
  }

  return (
    <button
      onClick={onToggle}
      className={`collapsible-heading flex items-center gap-2 w-full text-left group
                  ${sizeClasses[level]} text-text hover:text-accent transition-colors`}
    >
      <span className="chevron opacity-0 group-hover:opacity-60 transition-opacity text-text-muted flex-shrink-0">
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </span>
      <span>{children}</span>
    </button>
  )
}

// Complete markdown components including code renderer
const markdownComponents = {
  ...baseMarkdownComponents,
  code: CodeRenderer,
}

export default function MarkdownRenderer({ content }) {
  // Track collapsed sections by ID
  const [collapsedSections, setCollapsedSections] = useState(new Set())

  // Parse markdown into sections
  const sections = useMemo(() => parseMarkdownSections(content), [content])

  // Check if content has any h2/h3/h4 headings worth collapsing
  const hasCollapsibleHeadings = sections.some(s => s.level >= 2 && s.level <= 4)

  // Toggle a section's collapsed state
  const toggleSection = (sectionId) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  // If no collapsible headings, render normally for performance
  if (!hasCollapsibleHeadings) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    )
  }

  // Render sections with collapsible headings
  return (
    <div className="markdown-sections">
      {sections.map((section) => {
        const isCollapsed = collapsedSections.has(section.id)
        const isCollapsible = section.level >= 2 && section.level <= 4

        return (
          <div key={section.id} className="markdown-section">
            {/* Collapsible heading */}
            {isCollapsible && section.heading && (
              <CollapsibleHeading
                level={section.level}
                isCollapsed={isCollapsed}
                onToggle={() => toggleSection(section.id)}
              >
                {section.heading}
              </CollapsibleHeading>
            )}

            {/* Section content (hidden when collapsed) */}
            {(!isCollapsible || !isCollapsed) && section.content && (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  ...markdownComponents,
                  // Override headings in section content to prevent duplicates
                  // (the section heading is already rendered above)
                  h2: ({ children }) => <h2 className="text-xl font-semibold mt-5 mb-3 text-text">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-text">{children}</h3>,
                  h4: ({ children }) => <h4 className="text-base font-medium mt-3 mb-2 text-text">{children}</h4>,
                }}
              >
                {section.content}
              </ReactMarkdown>
            )}
          </div>
        )
      })}
    </div>
  )
}
