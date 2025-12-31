import { createContext, useState, useEffect, useContext } from 'react'

const CodeDisplayContext = createContext(null)

export function CodeDisplayProvider({ children }) {
  const [globalMode, setGlobalMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('codeDisplayMode')
      return saved || 'pretty'
    }
    return 'pretty'
  })

  useEffect(() => {
    localStorage.setItem('codeDisplayMode', globalMode)
  }, [globalMode])

  const toggleGlobalMode = () => {
    setGlobalMode(prev => prev === 'pretty' ? 'classic' : 'pretty')
  }

  return (
    <CodeDisplayContext.Provider value={{ globalMode, setGlobalMode, toggleGlobalMode }}>
      {children}
    </CodeDisplayContext.Provider>
  )
}

export function useCodeDisplayMode() {
  const context = useContext(CodeDisplayContext)
  if (!context) {
    return { globalMode: 'pretty', setGlobalMode: () => {}, toggleGlobalMode: () => {} }
  }
  return context
}
