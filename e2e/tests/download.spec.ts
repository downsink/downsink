import {readFile, stat} from 'node:fs/promises'
import {expect, it} from '../fixtures.ts'

const MB = 1024 * 1024

it.beforeEach(async ({page}) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).ready === true)
})

it('streams to OPFS and delivers the finished file with accurate progress', async ({page}) => {
  const size = 8 * MB
  const downloadPromise = page.waitForEvent('download')

  const outcome = await page.evaluate(async size => {
    const w = window as any
    const events: {receivedBytes: number; totalBytes: number | null}[] = []
    const handle = w.downsink.download(`/file?size=${size}`, {
      mode: 'opfs',
      filename: 'pattern.bin',
      progressInterval: 0,
      onProgress: (p: any) => events.push(p),
    })
    const result = await handle.done
    return {result, events}
  }, size)

  expect(outcome.result.filename).toBe('pattern.bin')
  expect(outcome.result.receivedBytes).toBe(size)

  // progress: monotonic, correct total, final event reaches the full size
  expect(outcome.events.length).toBeGreaterThan(1)
  expect(outcome.events.every(e => e.totalBytes === size)).toBe(true)
  for (let i = 1; i < outcome.events.length; i++)
    expect(outcome.events[i].receivedBytes).toBeGreaterThanOrEqual(outcome.events[i - 1].receivedBytes)
  expect(outcome.events.at(-1)?.receivedBytes).toBe(size)

  // the delivered file has the right name, size, and byte pattern
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('pattern.bin')
  const path = await download.path()
  expect((await stat(path)).size).toBe(size)
  const bytes = await readFile(path)
  expect(bytes[0]).toBe(0)
  expect(bytes[size - 1]).toBe((size - 1) % 251)
  expect(bytes[5 * MB]).toBe((5 * MB) % 251)
})

it('defaults to OPFS without a mode option, never touching the picker', async ({page, browserName}) => {
  it.skip(
    browserName !== 'chromium',
    'the picker is Chromium-only; other browsers have no picker to accidentally trigger',
  )
  const downloadPromise = page.waitForEvent('download')
  // No mode passed: on Chromium, wanting the picker by default would hang here waiting for a user gesture / dialog.
  const result = await page.evaluate(async () => {
    const w = window as any
    return w.downsink.download('/file?size=4096', {filename: 'no-picker.bin', progressInterval: 0}).done
  })
  expect(result.filename).toBe('no-picker.bin')
  await downloadPromise
})

it('filename falls back to Content-Disposition', async ({page}) => {
  const downloadPromise = page.waitForEvent('download')
  const result = await page.evaluate(async () => {
    const w = window as any
    return w.downsink.download('/file?size=1024', {mode: 'opfs', progressInterval: 0}).done
  })
  expect(result.filename).toBe('pattern.bin')
  await downloadPromise
})

it('compressed transfer reports an indeterminate total', async ({page}) => {
  const downloadPromise = page.waitForEvent('download')
  const outcome = await page.evaluate(async () => {
    const w = window as any
    const totals: (number | null)[] = []
    const handle = w.downsink.download('/gzip', {
      mode: 'opfs',
      filename: 'letters.txt',
      progressInterval: 0,
      onProgress: (p: any) => totals.push(p.totalBytes),
    })
    const result = await handle.done
    return {result, totals}
  })
  // chunks arrive decompressed: bytes counted must be the decompressed size
  expect(outcome.result.receivedBytes).toBe(256 * 1024)
  expect(outcome.totals.every(t => t === null)).toBe(true)
  const download = await downloadPromise
  expect((await stat(await download.path())).size).toBe(256 * 1024)
})

it('HTTP error rejects before writing anything', async ({page}) => {
  const outcome = await page.evaluate(async () => {
    const w = window as any
    // delivered files are cleaned up on a delay, so compare against a snapshot
    const before: string[] = await w.tmpEntries()
    try {
      await w.downsink.download('/error', {mode: 'opfs'}).done
      return {rejected: false}
    } catch (err: any) {
      const after: string[] = await w.tmpEntries()
      return {
        rejected: true,
        name: err.name,
        code: err.code,
        status: err.status,
        leftovers: after.filter(n => !before.includes(n)),
      }
    }
  })
  expect(outcome.rejected).toBe(true)
  expect(outcome.name).toBe('DownsinkError')
  expect(outcome.code).toBe('http-error')
  expect(outcome.status).toBe(500)
  expect(outcome.leftovers).toEqual([])
})

it('abort mid-stream rejects and removes the partial temp file', async ({page}) => {
  const outcome = await page.evaluate(async () => {
    const w = window as any
    const before: string[] = await w.tmpEntries()
    let seen = 0
    const handle = w.downsink.download('/file?size=10485760&delay=30', {
      mode: 'opfs',
      progressInterval: 0,
      onProgress: () => {
        seen += 1
        if (seen === 3) handle.abort()
      },
    })
    try {
      await handle.done
      return {rejected: false}
    } catch (err: any) {
      // give the catch-path cleanup a beat, then inspect the tmp dir
      await new Promise(r => setTimeout(r, 250))
      const after: string[] = await w.tmpEntries()
      return {
        rejected: true,
        name: err.name,
        partial: handle.progress.receivedBytes,
        leftovers: after.filter(n => !before.includes(n)),
      }
    }
  })
  expect(outcome.rejected).toBe(true)
  expect(outcome.name).toBe('AbortError')
  expect(outcome.partial).toBeGreaterThan(0)
  expect(outcome.partial).toBeLessThan(10_485_760)
  expect(outcome.leftovers).toEqual([])
})

it('memory stays flat on a large download', async ({page, browserName}) => {
  it.skip(browserName !== 'chromium', 'precise heap measurement is Chromium-only')
  const size = 128 * MB
  const downloadPromise = page.waitForEvent('download')
  const heap = await page.evaluate(async size => {
    const w = window as any
    // Transient chunk garbage is not a leak, but one gc() pass does not
    // reliably reclaim external ArrayBuffer backing stores: settle the heap
    // with repeated collections before each measurement.
    const settledHeapSize = async () => {
      for (let i = 0; i < 5; i++) {
        w.gc()
        await new Promise(r => setTimeout(r, 100))
      }
      return (performance as any).memory.usedJSHeapSize
    }
    const before = await settledHeapSize()
    await w.downsink.download(`/file?size=${size}`, {mode: 'opfs', filename: 'big.bin'}).done
    const after = await settledHeapSize()
    return {before, after}
  }, size)
  const download = await downloadPromise
  expect((await stat(await download.path())).size).toBe(size)
  // buffering would grow the heap by ~size; streaming keeps it well under
  expect(heap.after - heap.before).toBeLessThan(48 * MB)
})
