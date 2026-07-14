export interface DownloadProgress {
  receivedBytes: number
  /** null when the total is unknown or unreliable (missing content-length, compressed transfer) */
  totalBytes: number | null
}

export type DownloadMode = 'auto' | 'opfs' | 'picker'

export interface SaveFilePickerOptions {
  suggestedName?: string
  types?: Array<{description?: string; accept: Record<string, Array<string>>}>
  excludeAcceptAllOption?: boolean
  id?: string
  startIn?: string
}

export interface DownloadOptions {
  /** Name for the saved file. Falls back to Content-Disposition, then the URL path, then 'download'. */
  filename?: string
  /** Passed to fetch. A provided signal is composed with the handle's own abort. */
  init?: RequestInit
  /**
   * 'opfs' (default) streams to the origin-private file system and hands the file to the browser at the end.
   * 'picker' asks for the destination first via showSaveFilePicker (Chromium only) and pipes straight to it.
   * 'auto' uses 'picker' when available, otherwise 'opfs'.
   * The picker is opt-in: not every product wants the extra save dialog.
   */
  mode?: DownloadMode
  pickerOptions?: SaveFilePickerOptions
  /** Minimum milliseconds between progress callbacks. Default 150. */
  progressInterval?: number
  onProgress?: (progress: DownloadProgress) => void
}

export interface DownloadResult {
  filename: string
  receivedBytes: number
}

export interface DownloadHandle {
  /** Resolves on completed delivery, rejects with DownsinkError or the abort reason. */
  done: Promise<DownloadResult>
  abort: (reason?: unknown) => void
  readonly progress: DownloadProgress
}

export type DownsinkErrorCode = 'unsupported' | 'http-error' | 'no-body'

export class DownsinkError extends Error {
  readonly code: DownsinkErrorCode
  readonly status: number | undefined

  constructor(code: DownsinkErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'DownsinkError'
    this.code = code
    this.status = status
  }
}

/* Minimal ambient surface for APIs missing from lib.dom, kept local to stay dependency-free. */

/* Typed against Uint8Array — the only chunk type this library ever writes. */
export interface OpfsWritableStream extends WritableStream<Uint8Array> {
  close(): Promise<void>
}

export interface OpfsFileHandle {
  readonly name: string
  createWritable(options?: {keepExistingData?: boolean}): Promise<OpfsWritableStream>
  getFile(): Promise<File>
}

export interface OpfsDirectoryHandle {
  getDirectoryHandle(name: string, options?: {create?: boolean}): Promise<OpfsDirectoryHandle>
  getFileHandle(name: string, options?: {create?: boolean}): Promise<OpfsFileHandle>
  removeEntry(name: string, options?: {recursive?: boolean}): Promise<void>
  keys(): AsyncIterableIterator<string>
}

export interface PickerWindow {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<OpfsFileHandle>
}
