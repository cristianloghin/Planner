/**
 * Serve dist/ the way GitHub Pages does, so deep links can be tested honestly.
 *
 * `vite preview` quietly rewrites any unknown path to index.html, which hides
 * the one failure this is here to catch: Pages does NOT do that. It serves
 * 404.html, with a 404 status, and the app only survives a cold visit to a deep
 * link because that file is a copy of index.html.
 *
 *   npm run build && npm run serve:pages
 *
 * Then try a deep link straight in a fresh tab. If it renders, a real visitor
 * following a shared link will get the app too.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const ROOT = resolve('dist')
/** Must match `base` in vite.config.ts — Pages serves the repo under its name. */
const BASE = '/Planner/'
const PORT = Number(process.env.PORT ?? 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

async function fileAt(path) {
  try {
    const s = await stat(path)
    if (s.isDirectory()) return fileAt(join(path, 'index.html'))
    return s.isFile() ? path : null
  } catch {
    return null
  }
}

function send(res, status, path) {
  res.writeHead(status, {
    'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
    // Pages sets a short cache on HTML; hashed assets are immutable. Neither
    // matters locally, and no-store keeps a stale build out of the way.
    'Cache-Control': 'no-store',
  })
  createReadStream(path).pipe(res)
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)

  // A convenience, not a reproduction: on Pages the root is a different site
  // altogether. This just saves typing the base path.
  if (path === '/') {
    res.writeHead(302, { Location: BASE })
    return res.end()
  }

  if (!path.startsWith(BASE)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end(`Not found. This build is served under ${BASE}\n`)
  }

  // normalize() keeps `..` from climbing out of dist/.
  const withinBase = normalize(path.slice(BASE.length))
  const file = await fileAt(resolve(ROOT, withinBase))
  if (file?.startsWith(ROOT)) return send(res, 200, file)

  // What Pages actually does: 404.html, with a 404 status. The app boots from
  // it anyway, because the browser runs whatever HTML it is given.
  const notFound = await fileAt(join(ROOT, '404.html'))
  if (notFound) return send(res, 404, notFound)

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not found, and dist/404.html is missing — run npm run build first.\n')
})

server.listen(PORT, () => {
  console.log(`Serving dist/ as GitHub Pages would: http://localhost:${PORT}${BASE}`)
  console.log('Unknown paths get 404.html with a 404 status, not a silent rewrite.')
})
