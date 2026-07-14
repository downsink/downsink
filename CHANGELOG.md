# Changelog

## 0.1.0 — unreleased

Initial release.

- `@downsink/core`: `download()` streams a fetch response to disk via OPFS with flat memory usage — no blob buffering, no ~2 GB blob ceiling. Typed progress (throttled, default 150 ms), abort, configurable fetch init, filename resolution from Content-Disposition (RFC 5987) and URL. `mode: 'opfs' | 'picker' | 'auto'` (default `'opfs'`) with opt-in `showSaveFilePicker` direct-save on Chromium. Indeterminate progress on compressed transfers. OPFS temp files cleaned up on error, abort, and delivery; stale leftovers swept automatically. Zero dependencies.
- `@downsink/react`: `useDownload` hook with `start`, `abort`, `status`, `progress`, `error`; aborts on unmount.
- Verified on Chromium, Firefox, and WebKit via Playwright, including a flat-memory assertion on a 128 MB download.
