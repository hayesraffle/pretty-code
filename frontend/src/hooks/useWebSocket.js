import { useState, useEffect, useRef, useCallback } from 'react'

const WS_BASE_URL = 'ws://localhost:8000/ws'

export function useWebSocket(permissionMode = 'default', workingDir = '', sessionId = null) {
  // sessionId is the conversation ID, which is also the Claude CLI session ID
  // This enables --resume for conversation context persistence
  const [status, setStatus] = useState('disconnected') // disconnected, connecting, connected
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionInfo, setSessionInfo] = useState(null)
  const [lastEventTime, setLastEventTime] = useState(null) // For debugging - when was last event received
  const wsRef = useRef(null)
  const onEventRef = useRef(null)
  const permissionModeRef = useRef(permissionMode)
  const workingDirRef = useRef(workingDir)
  const sessionIdRef = useRef(sessionId)

  // Track previous sessionId for change detection
  const prevSessionIdRef = useRef(sessionId)

  // Update refs when params change
  useEffect(() => {
    permissionModeRef.current = permissionMode
  }, [permissionMode])

  useEffect(() => {
    workingDirRef.current = workingDir
  }, [workingDir])

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    let url = `${WS_BASE_URL}?permissionMode=${permissionModeRef.current}`
    if (workingDirRef.current) {
      url += `&cwd=${encodeURIComponent(workingDirRef.current)}`
    }
    // Include sessionId for conversation context resumption
    if (sessionIdRef.current) {
      url += `&sessionId=${encodeURIComponent(sessionIdRef.current)}`
    }
    const ws = new WebSocket(url)

    ws.onopen = () => {
      setStatus('connected')
    }

    ws.onclose = () => {
      setStatus('disconnected')
      setIsStreaming(false)
      setSessionInfo(null)
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        if (wsRef.current === ws) {
          connect()
        }
      }, 3000)
    }

    ws.onerror = () => {
      setStatus('disconnected')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        // Debug logging - always log events to console for debugging
        console.log('%c[WS]', 'color: #8b5cf6; font-weight: bold', data.type, data.subtype || '', data)
        setLastEventTime(Date.now())

        // Handle streaming state based on event types
        if (data.type === 'system' && data.subtype === 'init') {
          setIsStreaming(true)
          setSessionInfo({
            sessionId: data.session_id,
            model: data.model,
            tools: data.tools,
            permissionMode: data.permissionMode,
            agents: data.agents,
          })
        } else if (data.type === 'assistant') {
          // Also set streaming on assistant events (init may not be sent for subsequent messages)
          setIsStreaming(true)
        } else if (data.type === 'user') {
          // Tool results - keep streaming true since conversation is still active
          setIsStreaming(true)
        } else if (data.type === 'result') {
          setIsStreaming(false)
          // session_id is forwarded to App.jsx via onEvent callback
          // App.jsx uses it as the conversation ID for persistence
        } else if (data.type === 'system' && data.subtype === 'stopped') {
          setIsStreaming(false)
        } else if (data.type === 'system' && data.subtype === 'error') {
          setIsStreaming(false)
        }

        // Forward all events to the callback
        if (onEventRef.current) {
          onEventRef.current(data)
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    wsRef.current = ws
  }, [])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  // Reconnect when sessionId changes (for conversation switching/loading)
  // This ensures --resume is passed with the correct session ID
  useEffect(() => {
    if (sessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = sessionId
      // Only reconnect if we have a new non-null sessionId and are already connected
      if (sessionId && wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('%c[WS]', 'color: #8b5cf6; font-weight: bold', 'Reconnecting with new sessionId:', sessionId)
        wsRef.current.close()
        wsRef.current = null
        // Use setTimeout to let the close complete before reconnecting
        setTimeout(() => connect(), 100)
      }
    }
  }, [sessionId, connect])

  const sendMessage = useCallback((content, images = []) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg = { type: 'message', content, images }
      console.log('%c[WS→]', 'color: #22c55e; font-weight: bold', 'message', msg)
      wsRef.current.send(JSON.stringify(msg))
      return true
    }
    return false
  }, [])

  const stopGeneration = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }))
    }
  }, [])

  const sendPermissionResponse = useCallback((toolUseId, allowed) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'permission_response',
        tool_use_id: toolUseId,
        allowed,
      }))
    }
  }, [])

  const sendQuestionResponse = useCallback((toolUseId, answers) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'question_response',
        tool_use_id: toolUseId,
        answers,
      }))
    }
  }, [])

  const sendContinue = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'continue' }))
    }
  }, [])

  const setPermissionMode = useCallback((mode) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'set_permission_mode',
        mode,
      }))
    }
    permissionModeRef.current = mode
  }, [])

  const onEvent = useCallback((callback) => {
    onEventRef.current = callback
  }, [])

  // Connect on mount
  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return {
    status,
    isStreaming,
    sessionInfo,
    lastEventTime,
    sendMessage,
    stopGeneration,
    sendPermissionResponse,
    sendQuestionResponse,
    sendContinue,
    setPermissionMode,
    onEvent,
    connect,
    disconnect,
  }
}
