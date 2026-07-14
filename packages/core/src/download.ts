import {resolveFilename} from './filename.ts'
import {createTmpFile, sweepStaleTmpFiles} from './opfs.ts'
import {createProgressGate} from './progress-gate.ts'
import {support} from './support.ts'
import {
  type DownloadHandle,
  type DownloadMode,
  type DownloadOptions,
  type DownloadProgress,
  type DownloadResult,
  DownsinkError,
  type OpfsFileHandle,
  type PickerWindow,
} from './types.ts'

const DEFAULT_PROGRESS_INTERVAL = 150
const CLEANUP_DELAY_MS = 60 * 1000

/**
 * Stream a download to disk. Never buffers the body in memory: bytes flow
 * fetch → progress counter → OPFS (or the picked destination) under pipeTo
 * backpressure, so memory stays flat regardless of file size.
 */
export function download(url: string | URL, options: DownloadOptions = {}): DownloadHandle {
  const progress: DownloadProgress = {receivedBytes: 0, totalBytes: null}
  const controller = new AbortController()

  const external = options.init?.signal
  if (external) {
    if (external.aborted) {
      controller.abort(external.reason)
    } else {
      external.addEventListener('abort', () => controller.abort(external.reason), {once: true})
    }
  }

  return {
    done: run(url, options, progress, controller.signal),
    abort: reason => controller.abort(reason),
    get progress() {
      return {...progress}
    },
  }
}

function resolveMode(mode: DownloadMode, caps: {opfs: boolean; picker: boolean}): boolean {
  const wantsPicker = mode === 'picker' || (mode === 'auto' && caps.picker)
  if (wantsPicker && !caps.picker) {
    throw new DownsinkError('unsupported', 'showSaveFilePicker is not available in this browser (Chromium only)')
  }
  if (!wantsPicker && !caps.opfs) {
    throw new DownsinkError(
      'unsupported',
      'OPFS streaming writes are not available in this browser; see the downsink compatibility table',
    )
  }
  return wantsPicker
}

// Picker first: the user gesture context expires after async work, and the
// destination must exist before bytes arrive to avoid a double write.
function acquirePickedHandle(options: DownloadOptions): Promise<OpfsFileHandle> {
  const picker = (globalThis as PickerWindow).showSaveFilePicker
  if (!picker) {
    throw new DownsinkError('unsupported', 'showSaveFilePicker vanished between support check and call')
  }
  return picker({
    ...(options.filename ? {suggestedName: options.filename} : {}),
    ...options.pickerOptions,
  })
}

/** A compressed transfer reports the compressed length while chunks arrive decompressed: unknown beats a lie. */
function resolveTotalBytes(response: Response): number | null {
  const encoding = response.headers.get('content-encoding')
  if (encoding && encoding !== 'identity') {
    return null
  }
  const contentLength = Number(response.headers.get('content-length'))
  return contentLength > 0 ? contentLength : null
}

async function run(
  url: string | URL,
  options: DownloadOptions,
  progress: DownloadProgress,
  signal: AbortSignal,
): Promise<DownloadResult> {
  const caps = support()
  const wantsPicker = resolveMode(options.mode ?? 'opfs', caps)

  const pickedHandle = wantsPicker ? await acquirePickedHandle(options) : null

  const response = await fetch(url, {...options.init, signal})

  // Check the response before opening any writable: opening first leaves an
  // empty file behind on HTTP errors.
  if (!response.ok) {
    throw new DownsinkError('http-error', `HTTP ${response.status} ${response.statusText}`, response.status)
  }
  if (!response.body) {
    throw new DownsinkError('no-body', 'response has no body to stream')
  }

  const filename = resolveFilename(url, response.headers.get('content-disposition'), options.filename)
  progress.totalBytes = resolveTotalBytes(response)

  const gate = createProgressGate(options.progressInterval ?? DEFAULT_PROGRESS_INTERVAL)
  const emit = () => options.onProgress?.({...progress})
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      progress.receivedBytes += chunk.byteLength
      if (gate.shouldEmit()) {
        emit()
      }
      ctrl.enqueue(chunk)
    },
  })

  if (pickedHandle) {
    const writable = await pickedHandle.createWritable()
    await response.body.pipeThrough(counter).pipeTo(writable, {signal})
    emit()
    return {filename: pickedHandle.name, receivedBytes: progress.receivedBytes}
  }

  sweepStaleTmpFiles()
  const {handle, remove} = await createTmpFile()
  const writable = await handle.createWritable()
  try {
    await response.body.pipeThrough(counter).pipeTo(writable, {signal})
  } catch (error) {
    // pipeTo aborts the writable itself; just drop the partial file.
    await remove()
    throw error
  }
  emit()

  deliver(await handle.getFile(), filename, remove)
  return {filename, receivedBytes: progress.receivedBytes}
}

/**
 * Hand the finished OPFS file to the browser's download UI. The blob URL is
 * disk-backed (no RAM copy); revocation and temp-file removal are delayed so
 * the browser can finish copying the bytes out.
 */
function deliver(file: File, filename: string, remove: () => Promise<void>): void {
  const blobUrl = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = blobUrl
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl)
    remove()
  }, CLEANUP_DELAY_MS)
}
