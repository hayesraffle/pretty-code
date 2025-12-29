import { useState, useEffect, useRef, useCallback } from 'react'

const WS_BASE_URL = 'ws://localhost:8000/ws'

export function useWebSocket(permissionMode = 'default', workingDir = '') {
  const [status, setStatus] = useState('disconnected') // disconnected, connecting, connected
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionInfo, setSessionInfo] = useState(null)
  const wsRef = useRef(null)
  const onEventRef = useRef(null)
  const permissionModeRef = useRef(permissionMode)
  const workingDirRef = useRef(workingDir)

  // Update refs when params change
  useEffect(() => {
    permissionModeRef.current = permissionMode
  }, [permissionMode])

  useEffect(() => {
    workingDirRef.current = workingDir
  }, [workingDir])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    let url = `${WS_BASE_URL}?permissionMode=${permissionModeRef.current}`
    if (workingDirRef.current) {
      url += `&cwd=${encodeURIComponent(workingDirRef.current)}`
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
        } else if (data.type === 'result') {
          setIsStreaming(false)
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

  const sendMessage = useCallback((content) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'message', content }))
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

  const sendQuestionResponse = useCallback((answers) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'question_response',
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
