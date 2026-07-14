import {
  type DownloadHandle,
  type DownloadOptions,
  type DownloadProgress,
  type DownloadResult,
  download,
} from '@downsink/core'
import {useCallback, useEffect, useRef, useState} from 'react'

export type DownloadStatus = 'idle' | 'running' | 'complete' | 'aborted' | 'error'

export interface UseDownload {
  start: (url: string | URL, options?: DownloadOptions) => Promise<DownloadResult | null>
  abort: (reason?: unknown) => void
  status: DownloadStatus
  progress: DownloadProgress
  error: unknown
}

const IDLE_PROGRESS: DownloadProgress = {receivedBytes: 0, totalBytes: null}

function applyFailure(err: unknown, setStatus: (s: DownloadStatus) => void, setError: (e: unknown) => void): void {
  const aborted = err instanceof DOMException && err.name === 'AbortError'
  setStatus(aborted ? 'aborted' : 'error')
  if (!aborted) {
    setError(err)
  }
}

export function useDownload(): UseDownload {
  const [status, setStatus] = useState<DownloadStatus>('idle')
  const [progress, setProgress] = useState<DownloadProgress>(IDLE_PROGRESS)
  const [error, setError] = useState<unknown>(null)
  const handleRef = useRef<DownloadHandle | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      handleRef.current?.abort()
    }
  }, [])

  const start = useCallback(async (url: string | URL, options?: DownloadOptions): Promise<DownloadResult | null> => {
    handleRef.current?.abort()
    setStatus('running')
    setProgress(IDLE_PROGRESS)
    setError(null)

    const handle = download(url, {
      ...options,
      onProgress: p => {
        if (mountedRef.current) {
          setProgress(p)
        }
        options?.onProgress?.(p)
      },
    })
    handleRef.current = handle

    const isCurrent = () => mountedRef.current && handleRef.current === handle

    try {
      const result = await handle.done
      if (isCurrent()) {
        setStatus('complete')
      }
      return result
    } catch (err) {
      if (isCurrent()) {
        applyFailure(err, setStatus, setError)
      }
      return null
    }
  }, [])

  const abort = useCallback((reason?: unknown) => {
    handleRef.current?.abort(reason)
  }, [])

  return {start, abort, status, progress, error}
}
