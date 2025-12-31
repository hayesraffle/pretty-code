import { useState, useEffect, useCallback, useRef } from 'react'

const API_BASE = 'http://localhost:8000'
const CURRENT_KEY = 'pretty-code-current'

export function useConversationStorage() {
  const [conversations, setConversations] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const conversationCacheRef = useRef(new Map()) // Cache full conversation data

  // Get conversation ID from URL on mount
  const getIdFromUrl = () => {
    const match = window.location.pathname.match(/^\/c\/([^/]+)/)
    return match ? match[1] : null
  }

  // Load conversations list and check URL for conversation ID
  useEffect(() => {
    loadConversationsList()
    const urlId = getIdFromUrl()
    if (urlId) {
      setCurrentId(urlId)
    }
    localStorage.removeItem(CURRENT_KEY)
  }, [])

  // Sync URL with currentId
  useEffect(() => {
    const urlId = getIdFromUrl()
    if (currentId && currentId !== urlId) {
      window.history.pushState({}, '', `/c/${currentId}`)
    } else if (!currentId && urlId) {
      window.history.pushState({}, '', '/')
    }
  }, [currentId])

  // Save current ID to localStorage
  useEffect(() => {
    if (currentId) {
      localStorage.setItem(CURRENT_KEY, currentId)
    } else {
      localStorage.removeItem(CURRENT_KEY)
    }
  }, [currentId])

  const loadConversationsList = async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`${API_BASE}/api/conversations`)
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch (e) {
      console.error('Failed to load conversations:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const saveConversation = useCallback(async (messages, title = null, options = {}) => {
    const { explicitId, updateCurrentId = true } = options
    // Use explicitId (Claude's session_id) as the conversation ID
    // This ensures URLs and storage match Claude CLI sessions
    const id = explicitId || currentId || Date.now().toString()
    const autoTitle = title || generateTitle(messages)
    const updatedAt = new Date().toISOString()

    const conversation = {
      id,
      title: autoTitle,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp?.toISOString?.() || m.timestamp || null,
        images: m.images || null,
        events: m.events || null,
        parsedQuestions: m.parsedQuestions || null,
        questionsAnswered: m.questionsAnswered || null,
      })),
      updatedAt,
    }

    // Optimistically update local state
    setConversations((prev) => {
      const existing = prev.findIndex((c) => c.id === id)
      const summary = {
        id,
        title: autoTitle,
        updatedAt,
        messageCount: messages.length,
      }

      if (existing >= 0) {
        const newList = [...prev]
        newList[existing] = summary
        return newList
      }

      return [summary, ...prev]
    })

    // Update cache
    conversationCacheRef.current.set(id, conversation)

    // Save to backend
    try {
      await fetch(`${API_BASE}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversation),
      })
    } catch (e) {
      console.error('Failed to save conversation:', e)
    }

    if (updateCurrentId) {
      setCurrentId(id)
    }
    return id
  }, [currentId])

  const loadConversation = useCallback(async (id) => {
    // The conversation ID is the Claude session ID
    // Loading a conversation automatically sets up --resume via useWebSocket(currentId)

    // Check cache first
    if (conversationCacheRef.current.has(id)) {
      setCurrentId(id)
      const cached = conversationCacheRef.current.get(id)
      return { messages: cached.messages }
    }

    // Load from backend
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${id}`)
      if (res.ok) {
        const data = await res.json()
        conversationCacheRef.current.set(id, data)
        setCurrentId(id)
        return { messages: data.messages }
      }
    } catch (e) {
      console.error('Failed to load conversation:', e)
    }
    return null
  }, [])

  const newConversation = useCallback(() => {
    setCurrentId(null)
    return []
  }, [])

  const deleteConversation = useCallback(async (id) => {
    // Optimistically update local state
    setConversations((prev) => prev.filter((c) => c.id !== id))
    conversationCacheRef.current.delete(id)

    if (currentId === id) {
      setCurrentId(null)
    }

    // Delete from backend
    try {
      await fetch(`${API_BASE}/api/conversations/${id}`, {
        method: 'DELETE',
      })
    } catch (e) {
      console.error('Failed to delete conversation:', e)
      // Reload list on error
      loadConversationsList()
    }
  }, [currentId])

  const renameConversation = useCallback(async (id, title) => {
    // Update local state
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    )

    // If cached, update and save
    if (conversationCacheRef.current.has(id)) {
      const conv = conversationCacheRef.current.get(id)
      conv.title = title
      try {
        await fetch(`${API_BASE}/api/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(conv),
        })
      } catch (e) {
        console.error('Failed to rename conversation:', e)
      }
    }
  }, [])

  return {
    conversations,
    currentId,
    isLoading,
    saveConversation,
    loadConversation,
    newConversation,
    deleteConversation,
    renameConversation,
  }
}

function generateTitle(messages) {
  // Use first user message as title
  const firstUser = messages.find((m) => m.role === 'user')
  if (firstUser) {
    const title = firstUser.content.slice(0, 50)
    return title.length < firstUser.content.length ? title + '...' : title
  }
  return 'New conversation'
}
