import { createContext, useState, useEffect, useContext } from 'react'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [permissionMode, setPermissionMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('permissionMode') || 'bypassPermissions'
    }
    return 'bypassPermissions'
  })

  const [showToolDetails, setShowToolDetails] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('showToolDetails') !== 'false'
    }
    return true
  })

  // Persist settings
  useEffect(() => {
    localStorage.setItem('permissionMode', permissionMode)
  }, [permissionMode])

  useEffect(() => {
    localStorage.setItem('showToolDetails', showToolDetails)
  }, [showToolDetails])

  return (
    <SettingsContext.Provider
      value={{
        permissionMode,
        setPermissionMode,
        showToolDetails,
        setShowToolDetails,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    return {
      permissionMode: 'bypassPermissions',
      setPermissionMode: () => {},
      showToolDetails: true,
      setShowToolDetails: () => {},
    }
  }
  return context
}
