// Image library: optional bundled packs plus any images the user imports or
// scrapes with their own Apify key. User-managed images are downloaded to the
// local Postfarm data directory so the browser can composite
// them onto the export canvas same-origin (remote URLs would taint it).
import { join, dirname, extname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { logger } from './log.js'
import { BUNDLED_FOLDER_ID, UNCATEGORIZED_FOLDER_ID, listFolders, safeFolderId } from './folders.js'
import { getDataDir } from './paths.js'

const log = logger('scrape')
const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR = getDataDir()
const MEDIA_DIR = join(DIR, 'library')
const INDEX_PATH = join(DIR, 'library.json')
const BUNDLED_MANIFEST = join(__dirname, '..', 'public', 'library', 'manifest.json')
const MAX_IMPORT_BYTES = 16 * 1024 * 1024
const IMPORT_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])

function ensure() {
  if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true })
}
function readJson(p, fb) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fb }
}

// Flatten the bundled manifest into image records the UI can render.
function bundled() {
  const m = readJson(BUNDLED_MANIFEST, { packs: [] })
  return (m.packs || []).flatMap((pack) =>
    (pack.images || []).map((path) => ({
      id: `bundled:${path}`,
      url: `/library/${path}`,
      pack: pack.name,
      source: 'bundled',
      folderId: BUNDLED_FOLDER_ID,
    }))
  )
}

// Names of optional bundled packs. The public manifest is empty by default.
export function bundledPackNames() {
  const m = readJson(BUNDLED_MANIFEST, { packs: [] })
  return (m.packs || []).map((p) => p.name)
}

function scrapedIndex() {
  return readJson(INDEX_PATH, [])
}

function managedMediaPath(file) {
  const name = typeof file === 'string' ? file : ''
  if (!name || basename(name) !== name || !/\.(jpe?g|png|webp)$/i.test(name)) return null
  const root = resolve(MEDIA_DIR)
  const path = resolve(root, name)
  return dirname(path) === root ? path : null
}

function assetUrl(id) {
  return `/api/library/img/${encodeURIComponent(id)}`
}

function publicRecord(rec) {
  return {
    id: rec.id,
    url: assetUrl(rec.id),
    pack: rec.pack || 'Scraped',
    source: rec.source || 'scraped',
    folderId: rec.folderId || UNCATEGORIZED_FOLDER_ID,
    addedAt: rec.addedAt || null,
    originalName: rec.originalName || null,
  }
}

function validateManagedAssetId(id) {
  if (typeof id !== 'string' || !id || id.length > 240 || /[\\/\0]/.test(id)) {
    const error = new Error('Invalid Library asset ID.')
    error.status = 400
    throw error
  }
}

// Recover image files on disk that aren't in the index (e.g. if the index was
// emptied or drifted). Re-indexes them with stable ids matching the original
// scheme so nothing is silently orphaned.
function reconcileOrphans() {
  const index = scrapedIndex()
  if (!existsSync(MEDIA_DIR)) return index
  const known = new Set(index.map((s) => basename(String(s.file || ''))).filter(Boolean))
  let changed = false
  for (const file of readdirSync(MEDIA_DIR)) {
    if (!/\.(jpe?g|png|webp)$/i.test(file) || known.has(file)) continue
    index.push({
      id: `scraped:${file.replace(/\.[^.]+$/, '')}`,
      file,
      pack: 'Scraped',
      source: 'scraped',
      folderId: UNCATEGORIZED_FOLDER_ID,
      addedAt: new Date().toISOString(),
    })
    changed = true
  }
  if (changed) writeJson(INDEX_PATH, index)
  return index
}

export function listLibrary() {
  // Only list scraped images whose files actually exist on disk — avoids broken
  // thumbnails / 404s if the index and files ever drift apart. Reconcile first
  // so any orphaned files on disk are picked back up.
  const scraped = reconcileOrphans()
    .filter((s) => {
      const path = managedMediaPath(s.file)
      return path && existsSync(path)
    })
    .map(publicRecord)
  // User-managed media first (newest), then any optional bundled packs.
  return [...scraped, ...bundled()]
}

// Build selectable background packs. Bundled packs retain their existing names
// as ids for backwards-compatible project settings; user Library packs use
// stable folder ids so folder renames never break a saved selection.
export function listPacks() {
  const images = listLibrary()
  const bundledPacks = new Map()
  for (const img of images.filter((item) => item.source === 'bundled')) {
    if (!bundledPacks.has(img.pack)) {
      bundledPacks.set(img.pack, { id: img.pack, name: img.pack, source: 'bundled', count: 0, covers: [] })
    }
    const pack = bundledPacks.get(img.pack)
    pack.count++
    if (pack.covers.length < 4) pack.covers.push(img.url)
  }

  const libraryImages = images.filter((item) => item.source !== 'bundled')
  const libraryPacks = listFolders()
    .filter((folder) => folder.id !== BUNDLED_FOLDER_ID)
    .map((folder) => {
      const folderImages = libraryImages.filter((image) => image.folderId === folder.id)
      return {
        id: folder.id,
        name: folder.name,
        source: 'library',
        count: folderImages.length,
        covers: folderImages.slice(0, 4).map((image) => image.url),
      }
    })

  return [...libraryPacks, ...bundledPacks.values()]
}

// Resolve selections against the live Library at generation time. Only usable
// asset URLs reach the renderer, never ids or stale thumbnail references.
export function resolveBackgroundSelection(selections, legacyFolderIds = []) {
  const requested = [...new Set([
    ...(Array.isArray(selections) ? selections : []),
    ...(Array.isArray(legacyFolderIds) ? legacyFolderIds : []),
  ].filter((value) => typeof value === 'string' && value))]
  if (!requested.length) return []

  const images = listLibrary()
  const folderMap = new Map(listFolders().map((folder) => [folder.id, folder]))
  const pool = []

  for (const selection of requested) {
    if (selection.startsWith('folder:')) {
      const folder = folderMap.get(selection)
      if (!folder || selection === BUNDLED_FOLDER_ID) {
        throw new Error('A selected Library folder no longer exists. Choose another background pack.')
      }
      const matches = images.filter((image) => image.source !== 'bundled' && image.folderId === selection)
      if (!matches.length) {
        throw new Error(`“${folder.name}” has no usable images. Add a JPG, JPEG, PNG, or WebP image, or choose another pack.`)
      }
      pool.push(...matches)
      continue
    }

    // Non-folder selections are bundled pack ids only. Imported media must be
    // selected through its stable folder id; accepting display/legacy pack
    // names here would let an unselected folder leak into the pool.
    const isBundledPack = bundledPackNames().includes(selection)
    const matches = isBundledPack
      ? images.filter((image) => image.source === 'bundled' && image.pack === selection)
      : []
    if (!matches.length) {
      throw new Error(`The background pack “${selection}” is no longer available. Choose another pack.`)
    }
    pool.push(...matches)
  }

  return [...new Map(pool.map((image) => [image.id, image])).values()]
}

function shuffle(items, random) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Exhaust every image before starting a fresh shuffled cycle. Avoid an
// immediate repeat at cycle boundaries whenever more than one image exists.
export function createBackgroundPicker(images, random = Math.random) {
  let cycle = []
  let lastUrl = null
  return () => {
    if (!cycle.length) {
      cycle = shuffle(images, random)
      if (cycle.length > 1 && cycle[0].url === lastUrl) {
        ;[cycle[0], cycle[1]] = [cycle[1], cycle[0]]
      }
    }
    const next = cycle.shift()
    lastUrl = next?.url || null
    return next
  }
}

export function assignBackgrounds(slideshows, images, random = Math.random) {
  if (!images.length) return slideshows
  const nextBackground = createBackgroundPicker(images, random)
  for (const show of slideshows) {
    const slidesToAssign = show.format === 'notes' ? show.slides.slice(0, 1) : show.slides
    for (const slide of slidesToAssign) {
      const asset = nextBackground()
      slide.imageUrl = asset.url
      slide.imageAssetId = asset.id
      slide.imageFolderId = asset.folderId
      slide.imageUnavailable = false
    }
  }
  return slideshows
}

export function getScrapedFile(id) {
  validateManagedAssetId(id)
  const rec = scrapedIndex().find((s) => s.id === id)
  if (!rec) return null
  const p = managedMediaPath(rec.file)
  if (!p) return null
  return existsSync(p) ? p : null
}

export function getLibraryAsset(id) {
  validateManagedAssetId(id)
  const rec = scrapedIndex().find((item) => item.id === id)
  if (!rec) {
    const error = new Error('Library asset not found.')
    error.status = 404
    throw error
  }
  return publicRecord(rec)
}

export function assertPostAssetsAvailable(post) {
  const liveIds = new Set(listLibrary().map((asset) => asset.id))
  for (const slide of post?.slides || []) {
    if (slide.imageUnavailable) throw new Error('A background used by this draft was deleted. Choose another background before publishing.')
    let id = slide.imageAssetId
    if (!id && typeof slide.imageUrl === 'string') {
      const match = slide.imageUrl.match(/^\/api\/library\/img\/([^/?#]+)/)
      if (match) {
        try { id = decodeURIComponent(match[1]) } catch { id = match[1] }
      }
    }
    if (id && !liveIds.has(id)) {
      throw new Error('A background used by this draft is no longer available. Choose another background before publishing.')
    }
  }
  return true
}

export function removeScraped(id) {
  validateManagedAssetId(id)
  const index = scrapedIndex()
  const rec = index.find((s) => s.id === id)
  if (!rec) {
    const error = new Error('Library asset not found.')
    error.status = 404
    throw error
  }
  // Delete the actual file too — otherwise reconcileOrphans() sees an
  // un-indexed file on disk and immediately re-adds it ("zombie" delete).
  // Invalid indexed paths are treated as stale metadata and are never touched.
  const p = managedMediaPath(rec.file)
  if (p && existsSync(p)) rmSync(p)
  writeJson(INDEX_PATH, index.filter((s) => s.id !== id))
  return listLibrary()
}

export function moveImageToFolder(id, folderId) {
  const index = scrapedIndex()
  const rec = index.find((s) => s.id === id)
  if (!rec) throw new Error('Only imported or scraped images can be moved.')
  rec.folderId = safeFolderId(folderId)
  writeJson(INDEX_PATH, index)
  return listLibrary()
}

export function moveImagesFromFolder(folderId, nextFolderId = UNCATEGORIZED_FOLDER_ID) {
  const index = scrapedIndex()
  let changed = false
  for (const rec of index) {
    if ((rec.folderId || UNCATEGORIZED_FOLDER_ID) === folderId) {
      rec.folderId = safeFolderId(nextFolderId)
      changed = true
    }
  }
  if (changed) writeJson(INDEX_PATH, index)
}

function writeJson(p, v) {
  ensure()
  writeFileSync(p, JSON.stringify(v, null, 2))
}

function extFromImport(file) {
  const type = String(file.type || '').toLowerCase()
  if (IMPORT_TYPES.has(type)) return IMPORT_TYPES.get(type)
  const ext = extname(String(file.name || '')).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext
  return null
}

function importBuffer(file) {
  const data = String(file.data || '')
  const base64 = data.includes(',') ? data.split(',').pop() : data
  if (!base64) throw new Error(`Missing file data for ${file.name || 'image'}.`)
  return Buffer.from(base64, 'base64')
}

export function importImages({ images, folderId }) {
  const files = Array.isArray(images) ? images : []
  if (!files.length) throw new Error('Select at least one image to import.')
  ensure()
  const index = scrapedIndex()
  const targetFolderId = safeFolderId(folderId)
  const imported = []

  for (const file of files) {
    const ext = extFromImport(file)
    if (!ext) throw new Error(`${file.name || 'Image'} is not a supported image type.`)
    const buf = importBuffer(file)
    if (buf.length < 32) throw new Error(`${file.name || 'Image'} is empty or invalid.`)
    if (buf.length > MAX_IMPORT_BYTES) throw new Error(`${file.name || 'Image'} is too large. Keep imports under 16 MB each.`)
    const id = `imported:${randomUUID()}`
    const diskFile = `${id.replace('imported:', '')}${ext}`
    writeFileSync(join(MEDIA_DIR, diskFile), buf)
    const rec = {
      id,
      file: diskFile,
      pack: 'Imported',
      source: 'imported',
      folderId: targetFolderId,
      originalName: String(file.name || diskFile).slice(0, 180),
      addedAt: new Date().toISOString(),
    }
    index.unshift(rec)
    imported.push(rec)
  }

  writeJson(INDEX_PATH, index)
  return { added: imported.length, images: listLibrary().filter((img) => imported.some((rec) => rec.id === img.id)) }
}

// Pull image URLs out of whatever the Pinterest actor returns. Pinterest actors
// vary in shape between versions, so we try the structured path first (best
// quality) and fall back to scanning the whole response for pinimg.com assets,
// preferring full-size originals over thumbnails.
function pinImageUrls(items) {
  const list = Array.isArray(items) ? items : []

  // 1) Structured: media.images.{original|large|...}
  const structured = new Set()
  for (const item of list) {
    if (item && typeof item === 'object') {
      if (item.type && item.type !== 'pin') continue
      const s = item?.media?.images
      const chosen = s?.original ?? s?.orig ?? s?.large ?? s?.medium ?? s?.small
      if (chosen?.url) structured.add(String(chosen.url).replace(/&amp;/g, '&'))
    }
  }
  if (structured.size) return [...structured]

  // 2) Fallback: scan the whole blob for pinimg URLs. Prefer /originals/.
  const blob = JSON.stringify(list)
  const matches = blob.match(/https?:\\?\/\\?\/[^"'\\\s]*pinimg\.com[^"'\\\s]*/gi) || []
  const cleaned = matches
    .map((u) => u.replace(/\\\//g, '/').replace(/&amp;/g, '&'))
    .filter((u) => /\.(jpe?g|png|webp)/i.test(u))
  const originals = cleaned.filter((u) => /\/originals\//i.test(u))
  // De-dupe by the trailing filename so we don't keep both a thumb and original.
  const byName = new Map()
  for (const u of [...originals, ...cleaned]) {
    const name = u.split('/').pop()
    if (name && !byName.has(name)) byName.set(name, u)
  }
  return [...byName.values()]
}

// Pinterest's CDN 403s requests without a browser-ish User-Agent.
const IMG_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Referer: 'https://www.pinterest.com/',
}

const APIFY = 'https://api.apify.com/v2/acts'

export async function scrapePinterest({ apiKey, actor, searches, count, folderId }) {
  if (!apiKey) throw new Error('Missing Apify API key. Add it in Settings.')
  const queries = (searches || []).map((s) => s.trim()).filter(Boolean)
  if (!queries.length) throw new Error('Enter at least one Pinterest search.')

  const actorPath = (actor || 'fatihtahta/pinterest-scraper-search').replace('/', '~')
  // This actor expects `{ queries, limit }` (NOT `searches`/`resultsLimit`), and
  // its minimum limit is 10 — anything lower returns 0 items.
  const limit = Math.min(Math.max(Number(count) || 40, 10), 200)
  const input = { queries, limit }
  const pack = queries.join(', ')

  log.start(`Scraping Pinterest → "${pack}" (up to ${limit})`)
  log.step(`running Apify actor ${actor || 'fatihtahta/pinterest-scraper-search'}…`)
  const res = await fetch(`${APIFY}/${actorPath}/run-sync-get-dataset-items?token=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(300_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    log.fail(`Apify ${res.status}`)
    throw new Error(`Apify ${res.status}: ${t.slice(0, 160)}`)
  }
  const items = await res.json()
  log.info(`actor returned ${Array.isArray(items) ? items.length : 0} item${(Array.isArray(items) ? items.length : 0) === 1 ? '' : 's'}`)
  const urls = pinImageUrls(items).slice(0, limit)
  if (!urls.length) {
    const n = Array.isArray(items) ? items.length : 0
    log.fail(`no images found (actor returned ${n} item${n === 1 ? '' : 's'})`)
    throw new Error(`No images found (actor returned ${n} item${n === 1 ? '' : 's'}). Try a different search or actor.`)
  }
  log.ok(`found ${urls.length} image${urls.length === 1 ? '' : 's'} — downloading…`)

  ensure()
  const index = scrapedIndex()
  const targetFolderId = safeFolderId(folderId)
  let added = 0
  let skipped = 0
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: IMG_FETCH_HEADERS })
      if (!r.ok) { skipped++; continue }
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 1024) { skipped++; continue } // skip tiny/placeholder
      const ext = (extname(new URL(url).pathname) || '.jpg').slice(0, 5)
      const id = `scraped:${Date.now()}-${Math.round(Math.random() * 1e6)}`
      const file = `${id.replace('scraped:', '')}${ext}`
      writeFileSync(join(MEDIA_DIR, file), buf)
      index.unshift({ id, file, pack, source: 'scraped', folderId: targetFolderId, addedAt: new Date().toISOString() })
      added++
      if (added % 5 === 0 || added === urls.length) log.progress(added, urls.length, 'downloaded')
    } catch {
      skipped++ // skip individual failures
    }
  }
  writeJson(INDEX_PATH, index)
  log.ok(`Added ${added} image${added === 1 ? '' : 's'} to "${pack}"${skipped ? ` (${skipped} skipped)` : ''}`)
  return { added, found: urls.length }
}
