import type {OpfsDirectoryHandle, OpfsFileHandle} from './types.ts'

const TMP_DIR = '.downsink-tmp'
const STALE_AFTER_MS = 60 * 60 * 1000

async function tmpDir(): Promise<OpfsDirectoryHandle> {
  const root = (await navigator.storage.getDirectory()) as unknown as OpfsDirectoryHandle
  return root.getDirectoryHandle(TMP_DIR, {create: true})
}

export async function createTmpFile(): Promise<{handle: OpfsFileHandle; remove: () => Promise<void>}> {
  const dir = await tmpDir()
  const name = crypto.randomUUID()
  const handle = await dir.getFileHandle(name, {create: true})
  return {
    handle,
    remove: async () => {
      try {
        await dir.removeEntry(name)
      } catch {
        /* already gone */
      }
    },
  }
}

/**
 * Delete leftover temp files from crashed or navigated-away sessions. Only
 * files older than an hour are touched: a fresh one may still back a blob URL
 * the browser is copying out of.
 */
export async function sweepStaleTmpFiles(): Promise<void> {
  let dir: OpfsDirectoryHandle
  try {
    dir = await tmpDir()
  } catch {
    return
  }
  const cutoff = Date.now() - STALE_AFTER_MS
  for await (const name of dir.keys()) {
    try {
      const file = await (await dir.getFileHandle(name)).getFile()
      if (file.lastModified < cutoff) {
        await dir.removeEntry(name)
      }
    } catch {
      /* skip entries we cannot stat */
    }
  }
}
