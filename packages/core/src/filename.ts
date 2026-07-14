const FILENAME_STAR = /filename\*\s*=\s*(?:utf-8|UTF-8)''([^;]+)/
const FILENAME_PLAIN = /filename\s*=\s*"?([^";]+)"?/

/**
 * Resolve the file name to save as: explicit option, then Content-Disposition
 * (RFC 5987 filename* first, plain filename second), then the URL path.
 */
export function resolveFilename(url: string | URL, contentDisposition: string | null, explicit?: string): string {
  if (explicit) {
    return explicit
  }

  if (contentDisposition) {
    const star = FILENAME_STAR.exec(contentDisposition)
    if (star?.[1]) {
      try {
        return decodeURIComponent(star[1].trim())
      } catch {
        /* malformed encoding: fall through */
      }
    }
    const plain = FILENAME_PLAIN.exec(contentDisposition)
    if (plain?.[1]) {
      return plain[1].trim()
    }
  }

  try {
    const path = new URL(url, 'http://localhost').pathname
    const leaf = path.split('/').filter(Boolean).at(-1)
    if (leaf) {
      return decodeURIComponent(leaf)
    }
  } catch {
    /* unparsable url: fall through */
  }

  return 'download'
}
