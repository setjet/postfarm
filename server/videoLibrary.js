// Local video asset library. Mirrors the image library's local-first storage,
// but keeps video records and files completely separate so carousel/image
// workflows remain untouched.
import { homedir, tmpdir } from 'node:os'
import { join, extname, basename, dirname, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { logger } from './log.js'
import { UNCATEGORIZED_FOLDER_ID, VIDEOS_FOLDER_ID, safeFolderId } from './folders.js'

const execFileAsync = promisify(execFile)
const log = logger('videos')
const DEFAULT_DIR = process.env.VERCEL ? join(tmpdir(), '.slidesmith') : join(homedir(), '.slidesmith')
const DIR = process.env.SLIDESMITH_DIR || DEFAULT_DIR
const MEDIA_DIR = join(DIR, 'videos')
const INDEX_PATH = join(DIR, 'videos.json')
const APIFY = 'https://api.apify.com/v2/acts'
const DEFAULT_TIKTOK_ACTOR = 'clockworks/tiktok-scraper'
const MAX_VIDEO_BYTES = 300 * 1024 * 1024

const VIDEO_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'video/*,*/*;q=0.8',
}

function ensure() {
  if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true })
}

function readJson(p, fb) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fb }
}

function writeJson(p, v) {
  ensure()
  writeFileSync(p, JSON.stringify(v, null, 2))
}

function videoIndex() {
  return readJson(INDEX_PATH, [])
}

function managedMediaPath(file) {
  const name = typeof file === 'string' ? file : ''
  if (!name || basename(name) !== name || !isVideoFile(name)) return null
  const root = resolve(MEDIA_DIR)
  const path = resolve(root, name)
  return dirname(path) === root ? path : null
}

function validateVideoId(id) {
  if (typeof id !== 'string' || !id || id.length > 240 || /[\\/\0]/.test(id)) {
    const error = new Error('Invalid video asset ID.')
    error.status = 400
    throw error
  }
}

function publicRecord(rec) {
  return {
    id: rec.id,
    url: `/api/videos/${encodeURIComponent(rec.id)}`,
    pack: rec.pack || 'Videos',
    source: rec.source || 'imported',
    addedAt: rec.addedAt,
    duration: rec.duration ?? null,
    originalUrl: rec.originalUrl || null,
    folderId: rec.folderId || VIDEOS_FOLDER_ID,
  }
}

function isVideoFile(file) {
  return /\.(mp4|mov|m4v|webm)$/i.test(file)
}

function reconcileOrphans() {
  const index = videoIndex()
  if (!existsSync(MEDIA_DIR)) return index
  const known = new Set(index.map((s) => basename(String(s.file || ''))).filter(Boolean))
  let changed = false
  for (const file of readdirSync(MEDIA_DIR)) {
    if (!isVideoFile(file) || known.has(file)) continue
    index.push({
      id: `video:${file.replace(/\.[^.]+$/, '')}`,
      file,
      pack: 'Imported',
      source: 'imported',
      folderId: VIDEOS_FOLDER_ID,
      addedAt: new Date().toISOString(),
      duration: null,
    })
    changed = true
  }
  if (changed) writeJson(INDEX_PATH, index)
  return index
}

export function listVideos() {
  return reconcileOrphans()
    .filter((rec) => {
      const path = managedMediaPath(rec.file)
      return path && existsSync(path)
    })
    .map(publicRecord)
}

export function getVideoFile(id) {
  validateVideoId(id)
  const rec = videoIndex().find((s) => s.id === id)
  if (!rec) return null
  const p = managedMediaPath(rec.file)
  if (!p) return null
  return existsSync(p) ? p : null
}

export function getVideoAsset(id) {
  validateVideoId(id)
  const rec = videoIndex().find((item) => item.id === id)
  if (!rec) {
    const error = new Error('Video asset not found.')
    error.status = 404
    throw error
  }
  return publicRecord(rec)
}

export function removeVideo(id) {
  validateVideoId(id)
  const index = videoIndex()
  const rec = index.find((s) => s.id === id)
  if (!rec) {
    const error = new Error('Video asset not found.')
    error.status = 404
    throw error
  }
  const p = managedMediaPath(rec.file)
  if (p && existsSync(p)) rmSync(p)
  writeJson(INDEX_PATH, index.filter((s) => s.id !== id))
  return listVideos()
}

export function moveVideoToFolder(id, folderId) {
  const index = videoIndex()
  const rec = index.find((s) => s.id === id)
  if (!rec) throw new Error('Video not found.')
  rec.folderId = safeFolderId(folderId, VIDEOS_FOLDER_ID)
  writeJson(INDEX_PATH, index)
  return listVideos()
}

export function moveVideosFromFolder(folderId, nextFolderId = UNCATEGORIZED_FOLDER_ID) {
  const index = videoIndex()
  let changed = false
  for (const rec of index) {
    if ((rec.folderId || VIDEOS_FOLDER_ID) === folderId) {
      rec.folderId = safeFolderId(nextFolderId, UNCATEGORIZED_FOLDER_ID)
      changed = true
    }
  }
  if (changed) writeJson(INDEX_PATH, index)
}

function extensionFrom(contentType, url) {
  const type = String(contentType || '').toLowerCase()
  if (type.includes('webm')) return '.webm'
  if (type.includes('quicktime')) return '.mov'
  if (type.includes('mp4') || type.startsWith('video/')) return '.mp4'
  try {
    const ext = extname(new URL(url).pathname).toLowerCase()
    if (['.mp4', '.mov', '.m4v', '.webm'].includes(ext)) return ext
  } catch {}
  return '.mp4'
}

function looksLikeVideo(buf, contentType, url) {
  const type = String(contentType || '').toLowerCase()
  if (type.startsWith('video/')) return true
  if (isVideoFile(url.split('?')[0])) return true
  if (buf.length > 12 && buf.subarray(4, 8).toString('utf8') === 'ftyp') return true
  if (buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true
  return false
}

async function probeDuration(file) {
  try {
    const { stdout } = await execFileAsync(process.env.FFPROBE_PATH || 'ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ], { timeout: 8000, windowsHide: true })
    const n = Number(String(stdout).trim())
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null
  } catch {
    return null
  }
}

async function downloadVideo(url, { pack, source, folderId }) {
  if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('Enter a valid http(s) video URL.')
  const res = await fetch(url, {
    headers: VIDEO_FETCH_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(240_000),
  })
  if (!res.ok) throw new Error(`Video download failed (${res.status}) for ${url}`)

  const length = Number(res.headers.get('content-length') || 0)
  if (length > MAX_VIDEO_BYTES) throw new Error('Video is too large. Keep background assets under 300 MB.')

  const contentType = res.headers.get('content-type') || ''
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_VIDEO_BYTES) throw new Error('Video is too large. Keep background assets under 300 MB.')
  if (buf.length < 2048 || !looksLikeVideo(buf, contentType, url)) {
    throw new Error('That URL did not return a downloadable video file. Try a direct MP4/WebM URL or scrape with Apify.')
  }

  ensure()
  const id = `video:${randomUUID()}`
  const file = `${id.replace('video:', '')}${extensionFrom(contentType, url)}`
  const filePath = join(MEDIA_DIR, file)
  writeFileSync(filePath, buf)
  const rec = {
    id,
    file,
    pack: pack || packFromUrl(url),
    source,
    originalUrl: url,
    folderId: safeFolderId(folderId, VIDEOS_FOLDER_ID),
    addedAt: new Date().toISOString(),
    duration: await probeDuration(filePath),
  }
  const index = videoIndex()
  index.unshift(rec)
  writeJson(INDEX_PATH, index)
  return publicRecord(rec)
}

function packFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'Imported'
  } catch {
    return 'Imported'
  }
}

export async function importVideoUrl({ url, pack, folderId }) {
  const rec = await downloadVideo(String(url || '').trim(), { pack, source: 'imported', folderId })
  return { added: 1, video: rec }
}

function tiktokInput(source, limit) {
  const s = String(source || '').trim()
  const input = { resultsPerPage: limit, shouldDownloadVideos: true }
  if (/^https?:\/\//i.test(s)) {
    let u
    try { u = new URL(s) } catch {}
    const path = u?.pathname || ''
    const hashtag = path.match(/\/tag\/([^/?#]+)/i)?.[1]
    const profile = path.match(/\/@([^/?#]+)/i)?.[1]
    if (/\/video\/|vm\.tiktok\.com|vt\.tiktok\.com/i.test(s)) input.postURLs = [s]
    else if (hashtag) input.hashtags = [decodeURIComponent(hashtag).replace(/^#/, '')]
    else if (profile) input.profiles = [decodeURIComponent(profile)]
    else input.postURLs = [s]
  } else if (s.startsWith('#')) {
    input.hashtags = [s.slice(1)]
  } else if (s.startsWith('@')) {
    input.profiles = [s.slice(1)]
  } else {
    input.searchQueries = [s]
  }
  return input
}

function scanVideoUrls(value, path = []) {
  const out = []
  const keyPath = path.join('.').toLowerCase()
  if (typeof value === 'string') {
    const v = value.replace(/\\\//g, '/')
    if (!/^https?:\/\//i.test(v)) return out
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(v)) return out
    if (
      /\.(mp4|mov|m4v|webm)(\?|$)/i.test(v) ||
      (/(video|download|play|media|mp4)/i.test(keyPath) && !/(thumbnail|cover|avatar|image|music|audio)/i.test(keyPath))
    ) {
      out.push(v)
    }
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => out.push(...scanVideoUrls(item, [...path, String(i)])))
    return out
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) out.push(...scanVideoUrls(v, [...path, k]))
  }
  return out
}

export async function scrapeVideos({ apiKey, actor, source, count, folderId }) {
  if (!apiKey) throw new Error('Missing Apify API key. Add it in Settings.')
  const query = String(source || '').trim()
  if (!query) throw new Error('Enter a TikTok URL, profile, hashtag, or search query.')
  const limit = Math.min(Math.max(Math.round(Number(count) || 5), 1), 20)
  const actorName = actor || DEFAULT_TIKTOK_ACTOR
  const actorPath = actorName.replace('/', '~')

  log.start(`Scraping videos -> "${query}" (up to ${limit})`)
  const res = await fetch(`${APIFY}/${actorPath}/run-sync-get-dataset-items?token=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tiktokInput(query, limit)),
    signal: AbortSignal.timeout(300_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    log.fail(`Apify ${res.status}`)
    throw new Error(`Apify ${res.status}: ${t.slice(0, 180)}`)
  }

  const items = await res.json()
  const urls = [...new Set(scanVideoUrls(items))].slice(0, limit)
  if (!urls.length) {
    const n = Array.isArray(items) ? items.length : 0
    log.fail(`no downloadable video URLs found (${n} item${n === 1 ? '' : 's'})`)
    throw new Error('Apify returned no downloadable video URLs. Try a direct MP4 URL or a TikTok video URL.')
  }

  let added = 0
  let skipped = 0
  for (const url of urls) {
    try {
      await downloadVideo(url, { pack: query, source: 'scraped', folderId })
      added++
      log.progress(added, urls.length, 'downloaded')
    } catch {
      skipped++
    }
  }
  if (!added) throw new Error('Found video URLs, but none could be downloaded as MP4/WebM assets.')
  log.ok(`Added ${added} video${added === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`)
  return { added, found: urls.length }
}
