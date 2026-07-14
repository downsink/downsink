// Test server for the e2e suite: serves the harness page, the built core as
// browser ESM, and synthetic download routes with controllable size/latency.
import {createReadStream} from 'node:fs'
import {readFile} from 'node:fs/promises'
import http from 'node:http'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gzipSync} from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'packages', 'core', 'dist')
const CHUNK = 64 * 1024

// Deterministic byte pattern, position-dependent, so the saved file can be verified.
function patternChunk(offset, length) {
  const buf = Buffer.allocUnsafe(length)
  for (let i = 0; i < length; i++) buf[i] = (offset + i) % 251
  return buf
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname === '/') {
    res.writeHead(200, {'content-type': 'text/html'})
    res.end(await readFile(join(here, 'index.html')))
    return
  }

  if (url.pathname === '/demo') {
    res.writeHead(200, {'content-type': 'text/html'})
    res.end(await readFile(join(here, 'demo.html')))
    return
  }

  if (url.pathname.startsWith('/core/')) {
    const file = join(distDir, url.pathname.slice('/core/'.length))
    res.writeHead(200, {'content-type': 'text/javascript'})
    createReadStream(file).pipe(res)
    return
  }

  if (url.pathname === '/file') {
    const size = Number(url.searchParams.get('size') ?? 1024 * 1024)
    const delay = Number(url.searchParams.get('delay') ?? 0)
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': String(size),
      'content-disposition': 'attachment; filename="pattern.bin"',
    })
    let sent = 0
    const push = () => {
      while (sent < size) {
        const chunk = patternChunk(sent, Math.min(CHUNK, size - sent))
        sent += chunk.length
        const ok = res.write(chunk)
        if (delay > 0) return setTimeout(push, delay)
        if (!ok) return res.once('drain', push)
      }
      res.end()
    }
    push()
    return
  }

  if (url.pathname === '/gzip') {
    const body = gzipSync(Buffer.from('a'.repeat(256 * 1024)))
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-encoding': 'gzip',
      'content-length': String(body.length),
    })
    res.end(body)
    return
  }

  if (url.pathname === '/error') {
    res.writeHead(500, {'content-type': 'text/plain'})
    res.end('boom')
    return
  }

  res.writeHead(404)
  res.end()
})

server.listen(4173, '127.0.0.1', () => {
  console.log('e2e server on http://127.0.0.1:4173')
})
