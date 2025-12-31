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

  // Track previous values for change detection
  const prevSessionIdRef = useRef(sessionId)
  const prevWorkingDirRef = useRef(workingDir)
  const prevPermissionModeRef = useRef(permissionMode)

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

    ws.onclose = (event) => {
      console.log('%c[WS]', 'color: #ef4444; font-weight: bold', 'Connection closed, code:', event.code, 'reason:', event.reason)
      console.trace('[WS] Close stack trace')
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

        // Debug logging - summarize events for readability
        const logEvent = () => {
          const style = 'color: #8b5cf6; font-weight: bold'
          if (data.type === 'stream_event') {
            // Skip noisy stream events, or log a summary
            return
          } else if (data.type === 'assistant') {
            const content = data.message?.content || []
            const summary = content.map(c => {
              if (c.type === 'text') return `text(${c.text?.length || 0} chars)`
              if (c.type === 'tool_use') return `tool:${c.name}`
              if (c.type === 'thinking') return 'thinking'
              return c.type
            }).join(', ')
            console.log('%c[WS]', style, 'assistant', summary || '(empty)')
          } else if (data.type === 'user') {
            const content = data.message?.content || []
            const summary = content.map(c => {
              if (c.type === 'tool_result') return `result:${c.tool_use_id?.slice(0,8)}`
              return c.type
            }).join(', ')
            console.log('%c[WS]', style, 'user', summary || '(empty)')
          } else if (data.type === 'result') {
            console.log('%c[WS]', style, 'result', data.subtype || 'success', data.session_id ? `session:${data.session_id.slice(0,8)}` : '')
          } else if (data.type === 'system') {
            console.log('%c[WS]', style, 'system', data.subtype, data.session_id ? `session:${data.session_id.slice(0,8)}` : '')
          } else {
            console.log('%c[WS]', style, data.type, data.subtype || '', data)
          }
        }
        logEvent()
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

  // Reconnect when workingDir changes
  // The CLI subprocess is started with a specific cwd, so we need a fresh session
  useEffect(() => {
    if (workingDir !== prevWorkingDirRef.current) {
      prevWorkingDirRef.current = workingDir
      // Reconnect if already connected
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('%c[WS]', 'color: #8b5cf6; font-weight: bold', 'Reconnecting with new workingDir:', workingDir)
        wsRef.current.close()
        wsRef.current = null
        setTimeout(() => connect(), 100)
      }
    }
  }, [workingDir, connect])

  // Reconnect when permissionMode changes
  // The CLI subprocess is started with a specific permission mode, so we need to restart
  // to apply the new mode. The conversation context is maintained via session resumption.
  useEffect(() => {
    if (permissionMode !== prevPermissionModeRef.current) {
      prevPermissionModeRef.current = permissionMode
      // Reconnect if already connected
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('%c[WS]', 'color: #8b5cf6; font-weight: bold', 'Reconnecting with new permissionMode:', permissionMode)
        wsRef.current.close()
        wsRef.current = null
        setTimeout(() => connect(), 100)
      }
    }
  }, [permissionMode, connect])

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
      const msg = { type: 'permission_response', tool_use_id: toolUseId, allowed }
      console.log('%c[WS→]', 'color: #22c55e; font-weight: bold', 'permission_response', msg)
      wsRef.current.send(JSON.stringify(msg))
    } else {
      console.log('%c[WS→]', 'color: #ef4444; font-weight: bold', 'permission_response FAILED - WebSocket not open')
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
