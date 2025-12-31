import { useState, useEffect } from 'react'
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  File,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  X,
  RefreshCw,
  Home,
  AlertCircle,
  FolderInput,
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

function formatDate(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function sortChildren(children, sortField, sortOrder) {
  if (!children) return children
  const sorted = [...children].sort((a, b) => {
    // Directories always first
    if (a.type === 'directory' && b.type !== 'directory') return -1
    if (a.type !== 'directory' && b.type === 'directory') return 1

    let cmp = 0
    if (sortField === 'name') {
      cmp = a.name.localeCompare(b.name)
    } else if (sortField === 'modified') {
      cmp = (a.modified || 0) - (b.modified || 0)
    }
    return sortOrder === 'asc' ? cmp : -cmp
  })
  return sorted
}

function TreeNode({ node, level = 0, onSelect, selectedPath, expandedPaths, onToggleExpand, sortField, sortOrder }) {
  const isSelected = selectedPath === node.path
  const isDirectory = node.type === 'directory'
  const isExpanded = expandedPaths.has(node.path)

  const handleClick = () => {
    onSelect(node.path, isDirectory)
    if (isDirectory) {
      onToggleExpand(node.path)
    }
  }

  const Icon = isDirectory
    ? (isExpanded ? FolderOpen : Folder)
    : getFileIcon(node.name)

  const sortedChildren = isDirectory && node.children
    ? sortChildren(node.children, sortField, sortOrder)
    : null

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
          className={isDirectory ? 'text-indigo-500 dark:text-indigo-400' : 'text-text-muted'}
        />
        <span className="flex-1 truncate">{node.name}</span>
        <span className="text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
          {formatDate(node.modified)}
        </span>
      </button>

      {isDirectory && isExpanded && sortedChildren && (
        <div>
          {sortedChildren.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              sortField={sortField}
              sortOrder={sortOrder}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FileBrowser({ isOpen, onClose, onFileSelect, workingDir, onSetWorkingDir }) {
  const [fileTree, setFileTree] = useState(null)
  const [selectedPath, setSelectedPath] = useState(null)
  const [selectedIsDirectory, setSelectedIsDirectory] = useState(false)
  const [fileContent, setFileContent] = useState(null)
  const [fileLanguage, setFileLanguage] = useState('text')
  const [isLoadingTree, setIsLoadingTree] = useState(false)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [error, setError] = useState(null)
  const [expandedPaths, setExpandedPaths] = useState(new Set())
  const [browsePath, setBrowsePath] = useState(null)
  const [sortField, setSortField] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // Fetch file tree on mount or when browsePath changes
  useEffect(() => {
    if (isOpen) {
      fetchFileTree(browsePath || workingDir)
    }
  }, [isOpen, browsePath, workingDir])

  // Reset browsePath when modal opens
  useEffect(() => {
    if (isOpen) {
      setBrowsePath(null)
      setSelectedPath(null)
      setSelectedIsDirectory(false)
      setFileContent(null)
    }
  }, [isOpen])

  const fetchFileTree = async (path) => {
    setIsLoadingTree(true)
    setError(null)
    try {
      const url = path
        ? `${API_BASE}/api/files/tree?path=${encodeURIComponent(path)}&depth=4`
        : `${API_BASE}/api/files/tree?depth=4`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load file tree')
      const tree = await res.json()
      setFileTree(tree)
      // Only expand the root folder to show its immediate children
      setExpandedPaths(tree.path ? new Set([tree.path]) : new Set())
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

  const handleSelect = (path, isDirectory = false) => {
    setSelectedPath(path)
    setSelectedIsDirectory(isDirectory)
    if (!isDirectory) {
      fetchFileContent(path)
      onFileSelect?.(path)
    } else {
      setFileContent(null)
    }
  }

  const handleSetWorkingDir = (path) => {
    onSetWorkingDir?.(path)
    onClose()
  }

  const handleToggleExpand = (path) => {
    const isCurrentlyExpanded = expandedPaths.has(path)

    // If collapsing the top-level folder, navigate up to parent
    if (isCurrentlyExpanded && fileTree && path === fileTree.path) {
      const parentPath = path.split('/').slice(0, -1).join('/') || '/'
      // Select the current folder before navigating up
      setSelectedPath(path)
      setSelectedIsDirectory(true)
      setFileContent(null)
      setBrowsePath(parentPath)
      return
    }

    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (isCurrentlyExpanded) {
        // Collapse this folder and all its children
        for (const expandedPath of prev) {
          if (expandedPath === path || expandedPath.startsWith(path + '/')) {
            next.delete(expandedPath)
          }
        }
      } else {
        next.add(path)
      }
      return next
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative bg-background rounded-xl shadow-2xl border border-border w-[900px] h-[600px] flex flex-col overflow-hidden">
        {/* Full-width header */}
        <div className="px-3 py-2.5 border-b border-border flex items-center gap-3">
          {/* Breadcrumb navigation */}
          <div className="flex-1 flex items-center gap-0.5 bg-surface rounded px-1.5 py-1 overflow-x-auto">
            {(() => {
              // Show selected folder path in breadcrumb, or fall back to browse/working dir
              const currentPath = (selectedIsDirectory && selectedPath) || browsePath || workingDir || '/'
              const segments = currentPath.split('/').filter(Boolean)
              const breadcrumbs = [{ name: '/', path: '/' }]
              let accumulatedPath = ''
              segments.forEach(segment => {
                accumulatedPath += '/' + segment
                breadcrumbs.push({ name: segment, path: accumulatedPath })
              })
              return breadcrumbs.map((crumb, idx) => (
                <div key={crumb.path} className="flex items-center flex-shrink-0">
                  {idx > 0 && (
                    <ChevronRight size={10} className="text-text-muted mx-0.5" />
                  )}
                  <button
                    onClick={() => setBrowsePath(crumb.path)}
                    className={`text-xs px-1.5 py-0.5 rounded hover:bg-background transition-colors
                              ${idx === breadcrumbs.length - 1
                                ? 'text-text font-medium'
                                : 'text-text-muted hover:text-text'}`}
                    title={crumb.path}
                  >
                    {crumb.name === '/' ? <Home size={12} /> : crumb.name}
                  </button>
                </div>
              ))
            })()}
          </div>
          <button
            onClick={() => fetchFileTree(browsePath || workingDir)}
            className="p-1.5 rounded hover:bg-surface text-text-muted hover:text-text"
            title="Refresh"
            disabled={isLoadingTree}
          >
            <RefreshCw size={14} className={isLoadingTree ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-text"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Two-column content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel - Tree */}
          <div className="w-72 border-r border-border flex flex-col">
            {/* Sort header */}
            <div className="flex items-center px-2 py-1.5 border-b border-border text-xs">
              <button
                onClick={() => handleSort('name')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded hover:bg-surface transition-colors
                          ${sortField === 'name' ? 'text-text font-medium' : 'text-text-muted'}`}
              >
                Name
                {sortField === 'name' && (
                  sortOrder === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                )}
              </button>
              <div className="flex-1" />
              <button
                onClick={() => handleSort('modified')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded hover:bg-surface transition-colors
                          ${sortField === 'modified' ? 'text-text font-medium' : 'text-text-muted'}`}
              >
                Modified
                {sortField === 'modified' && (
                  sortOrder === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                )}
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
                sortField={sortField}
                sortOrder={sortOrder}
              />
            ) : null}
            </div>
          </div>

          {/* Right panel - Content */}
          <div className="flex-1 flex flex-col">
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
            ) : selectedIsDirectory ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <FolderOpen size={48} className="mb-4 text-indigo-500 dark:text-indigo-400 opacity-60" />
                <p className="text-sm font-medium text-text">{selectedPath?.split('/').pop()}</p>
                <p className="text-xs mt-2 opacity-60">Directory selected</p>
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
          </div>
        </div>

        {/* FAB for setting working directory */}
        {selectedPath && selectedIsDirectory && (
          <button
            onClick={() => handleSetWorkingDir(selectedPath)}
            className="absolute bottom-4 right-4 inline-flex items-center gap-2 text-sm py-2 px-4
                     rounded-full shadow-lg transition-all
                     bg-indigo-500/60 hover:bg-indigo-500/80 text-white
                     dark:bg-indigo-400/60 dark:hover:bg-indigo-400/80"
          >
            <FolderInput size={14} />
            Work in {selectedPath?.split('/').pop()}
          </button>
        )}
      </div>
    </div>
  )
}
