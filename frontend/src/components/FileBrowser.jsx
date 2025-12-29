import { useState, useEffect } from 'react'
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  File,
  ChevronRight,
  ChevronDown,
  ChevronUp,
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

function TreeNode({ node, level = 0, onSelect, selectedPath, expandedPaths, onToggleExpand }) {
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
  const [browsePath, setBrowsePath] = useState(null) // Path being browsed (may differ from workingDir)

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
      // Don't expand folders by default - start collapsed
      setExpandedPaths(new Set())
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

  const navigateToParent = () => {
    const currentPath = browsePath || workingDir
    if (currentPath && currentPath !== '/') {
      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/'
      setBrowsePath(parentPath)
    }
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
        <div className="w-72 border-r border-border flex flex-col">
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center justify-between mb-2">
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
            {/* Current browsing path with navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={navigateToParent}
                className="p-1 rounded hover:bg-surface text-text-muted hover:text-text flex-shrink-0"
                title="Go to parent directory"
              >
                <ChevronUp size={14} />
              </button>
              <div
                className="flex-1 text-xs text-text-muted bg-surface rounded px-2 py-1 truncate"
                title={browsePath || workingDir}
              >
                {browsePath || workingDir || '/'}
              </div>
              {browsePath && browsePath !== workingDir && (
                <button
                  onClick={() => setBrowsePath(null)}
                  className="p-1 rounded hover:bg-surface text-text-muted hover:text-text flex-shrink-0"
                  title="Go back to working directory"
                >
                  <Home size={12} />
                </button>
              )}
            </div>
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
            ) : selectedIsDirectory ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <FolderOpen size={48} className="mb-4 text-yellow-500 opacity-60" />
                <p className="text-sm font-medium text-text">{selectedPath?.split('/').pop()}</p>
                <p className="text-xs mt-2 opacity-60">Directory selected</p>
                <p className="text-xs mt-4 opacity-60">
                  Click "Set as Working Directory" to work from this folder
                </p>
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
            <div className="px-4 py-2 border-t border-border flex items-center justify-between">
              <div className="text-xs text-text-muted">
                {selectedIsDirectory ? 'Directory selected' : 'File selected'}
              </div>
              <div className="flex items-center gap-2">
                {selectedIsDirectory && (
                  <button
                    onClick={() => handleSetWorkingDir(selectedPath)}
                    className="px-3 py-1.5 text-sm rounded-lg bg-emerald-500/20 text-emerald-600
                             dark:text-emerald-400 hover:bg-emerald-500/30 transition-colors
                             flex items-center gap-1.5"
                  >
                    <FolderInput size={14} />
                    Set as Working Directory
                  </button>
                )}
                <button
                  onClick={handleCopyPath}
                  className="px-3 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover
                           text-white transition-colors"
                >
                  Copy Path
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
