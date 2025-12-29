import { useState, useEffect } from 'react'
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  File,
  ChevronRight,
  ChevronDown,
  X,
  RefreshCw,
  Home,
  AlertCircle,
} from 'lucide-react'
import CodeBlock from './CodeBlock'

const API_BASE = 'http://localhost:8000'

// File type icons
const FILE_ICONS = {
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  py: FileCode,
  json: FileCode,
  md: FileText,
  txt: FileText,
  default: File,
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop()?.toLowerCase()
  return FILE_ICONS[ext] || FILE_ICONS.default
}

function TreeNode({ node, level = 0, onSelect, selectedPath, expandedPaths, onToggleExpand }) {
  const isSelected = selectedPath === node.path
  const isDirectory = node.type === 'directory'
  const isExpanded = expandedPaths.has(node.path)

  const handleClick = () => {
    if (isDirectory) {
      onToggleExpand(node.path)
    } else {
      onSelect(node.path)
    }
  }

  const Icon = isDirectory
    ? (isExpanded ? FolderOpen : Folder)
    : getFileIcon(node.name)

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm
                   transition-colors hover:bg-surface group
                   ${isSelected ? 'bg-accent/10 text-accent' : 'text-text'}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {isDirectory && (
          <span className="text-text-muted w-3">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
        {!isDirectory && <span className="w-3" />}
        <Icon
          size={14}
          className={isDirectory ? 'text-yellow-500' : 'text-text-muted'}
        />
        <span className="truncate">{node.name}</span>
      </button>

      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FileBrowser({ isOpen, onClose, onFileSelect }) {
  const [fileTree, setFileTree] = useState(null)
  const [selectedPath, setSelectedPath] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [fileLanguage, setFileLanguage] = useState('text')
  const [isLoadingTree, setIsLoadingTree] = useState(false)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [error, setError] = useState(null)
  const [expandedPaths, setExpandedPaths] = useState(new Set())

  // Fetch file tree on mount
  useEffect(() => {
    if (isOpen) {
      fetchFileTree()
    }
  }, [isOpen])

  const fetchFileTree = async () => {
    setIsLoadingTree(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/files/tree?depth=4`)
      if (!res.ok) throw new Error('Failed to load file tree')
      const tree = await res.json()
      setFileTree(tree)
      // Expand all directories by default
      const toExpand = new Set()
      const collectDirs = (node) => {
        if (node.type === 'directory') {
          toExpand.add(node.path)
          node.children?.forEach(collectDirs)
        }
      }
      collectDirs(tree)
      setExpandedPaths(toExpand)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoadingTree(false)
    }
  }

  const fetchFileContent = async (path) => {
    setIsLoadingFile(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/files/read?path=${encodeURIComponent(path)}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to read file')
      }
      const data = await res.json()
      setFileContent(data.content)
      setFileLanguage(data.language)
    } catch (err) {
      setError(err.message)
      setFileContent(null)
    } finally {
      setIsLoadingFile(false)
    }
  }

  const handleSelect = (path) => {
    setSelectedPath(path)
    fetchFileContent(path)
    onFileSelect?.(path)
  }

  const handleToggleExpand = (path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleCopyPath = () => {
    if (selectedPath) {
      navigator.clipboard.writeText(selectedPath)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl shadow-2xl border border-border w-[900px] h-[600px] flex overflow-hidden">
        {/* Left panel - Tree */}
        <div className="w-64 border-r border-border flex flex-col">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Home size={14} className="text-text-muted" />
              <span className="text-sm font-medium text-text">Files</span>
            </div>
            <button
              onClick={fetchFileTree}
              className="p-1 rounded hover:bg-surface text-text-muted hover:text-text"
              title="Refresh"
              disabled={isLoadingTree}
            >
              <RefreshCw size={14} className={isLoadingTree ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {isLoadingTree ? (
              <div className="flex items-center justify-center h-32 text-text-muted">
                <RefreshCw size={20} className="animate-spin" />
              </div>
            ) : error && !fileTree ? (
              <div className="flex flex-col items-center justify-center h-32 text-text-muted p-4">
                <AlertCircle size={24} className="mb-2 text-error" />
                <p className="text-xs text-center">{error}</p>
                <button
                  onClick={fetchFileTree}
                  className="mt-2 text-xs text-accent hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : fileTree ? (
              <TreeNode
                node={fileTree}
                onSelect={handleSelect}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onToggleExpand={handleToggleExpand}
              />
            ) : null}
          </div>
        </div>

        {/* Right panel - Content */}
        <div className="flex-1 flex flex-col">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {selectedPath ? (
                <>
                  <FileCode size={14} className="text-text-muted flex-shrink-0" />
                  <span className="text-sm text-text truncate">{selectedPath}</span>
                </>
              ) : (
                <span className="text-sm text-text-muted">Select a file to view</span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-text flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {isLoadingFile ? (
              <div className="flex items-center justify-center h-full text-text-muted">
                <RefreshCw size={20} className="animate-spin" />
              </div>
            ) : error && selectedPath ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <AlertCircle size={32} className="mb-3 text-error" />
                <p className="text-sm">{error}</p>
              </div>
            ) : fileContent !== null ? (
              <div className="p-2">
                <CodeBlock code={fileContent} language={fileLanguage} defaultExpanded />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <Folder size={48} className="mb-4 opacity-30" />
                <p className="text-sm">Select a file from the tree to view its contents</p>
                <p className="text-xs mt-2 opacity-60">
                  You can reference files in your prompts
                </p>
              </div>
            )}
          </div>

          {/* Footer with actions */}
          {selectedPath && (
            <div className="px-4 py-2 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={handleCopyPath}
                className="px-3 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover
                         text-white transition-colors"
              >
                Copy Path
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
