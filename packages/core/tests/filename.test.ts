import assert from 'node:assert/strict'
import {it} from 'node:test'
import {resolveFilename} from '../src/filename.ts'

it('explicit name wins over everything', () => {
  assert.equal(resolveFilename('https://x.test/a.zip', 'attachment; filename="b.zip"', 'c.zip'), 'c.zip')
})

it('RFC 5987 filename* beats plain filename', () => {
  const header = `attachment; filename="fallback.bin"; filename*=UTF-8''nave%20%E2%82%AC.bin`
  assert.equal(resolveFilename('https://x.test/a', header), 'nave €.bin')
})

it('plain filename with and without quotes', () => {
  assert.equal(resolveFilename('https://x.test/a', 'attachment; filename="report.pdf"'), 'report.pdf')
  assert.equal(resolveFilename('https://x.test/a', 'attachment; filename=report.pdf'), 'report.pdf')
})

it('falls back to the URL path leaf, decoded', () => {
  assert.equal(resolveFilename('https://x.test/files/il%20mio%20file.iso?token=1', null), 'il mio file.iso')
})

it('relative URLs and empty paths still produce a name', () => {
  assert.equal(resolveFilename('/api/v1/export.csv', null), 'export.csv')
  assert.equal(resolveFilename('https://x.test/', null), 'download')
})
