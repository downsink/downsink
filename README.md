<p align="center">
  <img src="assets/logo.svg" width="96" height="96" alt="downsink logo: a download arrow falling into a sink basin">
</p>

<h1 align="center">downsink</h1>

<p align="center"><strong>The missing sink for fetch.</strong><br>
Downloads that fall to disk, not RAM.</p>

<p align="center">
  <a href="https://github.com/downsink/downsink/actions/workflows/ci.yml"><img src="https://github.com/downsink/downsink/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@downsink/core"><img src="https://img.shields.io/npm/v/%40downsink%2Fcore" alt="npm"></a>
  <img src="https://img.shields.io/badge/dependencies-0-1798a8" alt="zero dependencies">
</p>

---

`downsink` streams a `fetch` response straight to disk through the Origin Private File System, with typed progress, abort, and zero dependencies. Memory stays flat no matter the file size — no blob buffering, no ~2 GB browser blob ceiling.

## When you need it (and when you don't)

If a plain `<a download href>` works for your case, use that — you don't need a library.

You need `downsink` when the download **must** go through `fetch`: authentication headers, POST bodies, transformed streams, or live progress in your own UI — and the file may be too big to buffer in memory.

## Install

```sh
pnpm add @downsink/core
pnpm add @downsink/react   # optional React bindings
```

## Usage

```ts
import {download} from '@downsink/core'

const handle = download('/api/v1/exports/42', {
  init: {headers: {Authorization: `Bearer ${token}`}},
  onProgress: ({receivedBytes, totalBytes}) => render(receivedBytes, totalBytes),
})

// cancel any time
// handle.abort()

const {filename, receivedBytes} = await handle.done
```

By default (`mode: 'opfs'`) bytes stream into OPFS and the browser's download UI takes over when the file is complete (Mega-style UX) — same behavior in every browser, no extra dialogs. The native save dialog (`showSaveFilePicker`, Chromium only) is opt-in: `mode: 'picker'` requires it, `mode: 'auto'` uses it when available and falls back to OPFS elsewhere. With the picker, the destination is chosen before the transfer starts and bytes pipe directly to it.

### React

```tsx
import {useDownload} from '@downsink/react'

function ExportButton() {
  const {start, abort, status, progress} = useDownload()
  return (
    <button onClick={() => start('/api/v1/exports/42')} disabled={status === 'running'}>
      {status === 'running' ? `${progress.receivedBytes} bytes…` : 'Export'}
    </button>
  )
}
```

## API

### `download(url, options?) → DownloadHandle`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `filename` | `string` | derived | Name to save as. Falls back to `Content-Disposition` (RFC 5987 aware), then the URL path leaf, then `download`. |
| `init` | `RequestInit` | — | Passed to `fetch` (headers, method, body, credentials…). A provided `signal` is composed with the handle's own abort. |
| `mode` | `'opfs' \| 'picker' \| 'auto'` | `'opfs'` | `opfs` streams to OPFS and delivers at the end; `picker` asks for the destination first (Chromium, opt-in); `auto` picks `picker` when available. |
| `pickerOptions` | `SaveFilePickerOptions` | — | Forwarded to `showSaveFilePicker` (file types, `startIn`…). |
| `progressInterval` | `number` | `150` | Minimum ms between progress callbacks. `0` reports every chunk. |
| `onProgress` | `(p: DownloadProgress) => void` | — | Called with `{receivedBytes, totalBytes}`; `totalBytes` is `null` when unknown or unreliable. |

The returned handle:

| Member | Description |
| --- | --- |
| `done` | `Promise<DownloadResult>` — resolves with `{filename, receivedBytes}` on completed delivery; rejects with `DownsinkError` or the abort reason. |
| `abort(reason?)` | Cancels the transfer and cleans up any partial file. |
| `progress` | Current `DownloadProgress` snapshot. |

### `support() → {opfs, picker}` / `isSupported() → boolean`

Runtime capability checks. Note the Safari private-browsing caveat below.

### `DownsinkError`

Rejection type for library-level failures, with `code`: `'unsupported'`, `'http-error'` (includes `status`), or `'no-body'`. Network failures and aborts reject with their native errors (`TypeError`, `AbortError`).

### `useDownload()` (from `@downsink/react`)

Returns `{start, abort, status, progress, error}` where `status` is `'idle' | 'running' | 'complete' | 'aborted' | 'error'`. The in-flight download is aborted on unmount.

## Compatibility

The core requires OPFS streaming writes (`FileSystemFileHandle.createWritable`).

| Capability | Chrome / Edge | Firefox | Safari |
| --- | --- | --- | --- |
| Core — stream to OPFS | ✅ 86+ | ✅ 111+ | ✅ 18.2+ |
| Streaming progress + abort | ✅ | ✅ | ✅ 18.2+ |
| Opt-in — `showSaveFilePicker` save dialog | ✅ 86+ | ❌ never¹ | ❌ |

¹ Mozilla has an explicit negative position on the file picker APIs. On unsupported browsers `mode: 'auto'` silently uses the OPFS path; only `mode: 'picker'` throws.

Check at runtime with `support()` / `isSupported()`.

## Notes and sharp edges

- **Compressed transfers**: with `Content-Encoding: gzip` the `content-length` describes compressed bytes while chunks arrive decompressed, so `totalBytes` is reported as `null` (indeterminate) instead of a wrong percentage.
- **Progress cadence**: progress callbacks are throttled (default 150 ms, `progressInterval`) so large downloads don't flood the main thread.
- **Cleanup**: temp files live under `.downsink-tmp/` in OPFS; they are removed after delivery and stale leftovers from crashed sessions are swept automatically.
- **Errors**: HTTP failures reject `handle.done` with a `DownsinkError` (`code: 'http-error'`) before anything is written — no empty files left behind.
- **Quota**: Safari's OPFS quota is conservative; very large downloads may hit `QuotaExceededError`. Consider `navigator.storage.persist()`.
- **Safari private browsing**: WebKit denies OPFS in ephemeral contexts — `navigator.storage.getDirectory()` exists but rejects with `UnknownError` at call time, so `isSupported()` cannot detect it up front. Handle the rejection of `handle.done`.

## License

MIT © Gianmarco Fiorello
