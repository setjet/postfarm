// Local trend research store. Trend items are scoped per project and used as
// market research only; generation prompts tell the model to study patterns
// without copying creators.
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { logger } from './log.js'
import { getDataDir } from './paths.js'

const log = logger('trends')
const DIR = getDataDir()
const INDEX_PATH = join(DIR, 'trends.json')
const APIFY = 'https://api.apify.com/v2/acts'
const DEFAULT_TREND_ACTOR = 'clockworks/tiktok-scraper'

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback }
}

function writeJson(path, value) {
  ensureDir()
  writeFileSync(path, JSON.stringify(value, null, 2))
}

function readMap() {
  const data = readJson(INDEX_PATH, {})
  return data && !Array.isArray(data) ? data : {}
}

function writeMap(map) {
  writeJson(INDEX_PATH, map)
  return map
}

export function listTrends(projectId) {
  return readMap()[projectId] || []
}

export function setTrends(projectId, items) {
  const map = readMap()
  map[projectId] = items
  writeMap(map)
  return items
}

export function removeTrend(projectId, id) {
  return setTrends(projectId, listTrends(projectId).filter((item) => item.id !== id))
}

export function clearTrends(projectId) {
  return setTrends(projectId, [])
}

export function trendsForPrompt(projectId, ids) {
  const all = listTrends(projectId)
  const selected = Array.isArray(ids) && ids.length ? all.filter((item) => ids.includes(item.id)) : all
  return selected
    .slice()
    .sort((a, b) => scoreTrend(b) - scoreTrend(a))
    .slice(0, 40)
}

function scoreTrend(item) {
  return Number(item.views || 0) + Number(item.likes || 0) * 8 + Number(item.comments || 0) * 16 + Number(item.shares || 0) * 20
}

function actorInput(term, limit) {
  const source = String(term || '').trim()
  const input = { resultsPerPage: limit, maxItems: limit, shouldDownloadVideos: false }
  if (/^https?:\/\//i.test(source)) {
    let url
    try { url = new URL(source) } catch {}
    const path = url?.pathname || ''
    const hashtag = path.match(/\/tag\/([^/?#]+)/i)?.[1]
    const profile = path.match(/\/@([^/?#]+)/i)?.[1]
    if (/\/video\/|vm\.tiktok\.com|vt\.tiktok\.com/i.test(source)) input.postURLs = [source]
    else if (hashtag) input.hashtags = [decodeURIComponent(hashtag).replace(/^#/, '')]
    else if (profile) input.profiles = [decodeURIComponent(profile)]
    else input.postURLs = [source]
  } else if (source.startsWith('#')) {
    input.hashtags = [source.slice(1)]
  } else if (source.startsWith('@')) {
    input.profiles = [source.slice(1)]
  } else {
    input.searchQueries = [source]
  }
  return input
}

function valueAt(obj, paths) {
  for (const path of paths) {
    let cursor = obj
    for (const part of path.split('.')) cursor = cursor?.[part]
    if (cursor !== undefined && cursor !== null && cursor !== '') return cursor
  }
  return null
}

function numberAt(obj, paths) {
  const value = valueAt(obj, paths)
  const n = Number(String(value ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}

function hashtagsFrom(item, caption) {
  const raw = valueAt(item, ['hashtags', 'hashtagNames', 'textExtra'])
  const out = new Set()
  if (Array.isArray(raw)) {
    raw.forEach((tag) => {
      if (typeof tag === 'string') out.add(tag.replace(/^#/, ''))
      else if (tag?.name) out.add(String(tag.name).replace(/^#/, ''))
      else if (tag?.hashtagName) out.add(String(tag.hashtagName).replace(/^#/, ''))
    })
  }
  String(caption || '').match(/#[\p{L}\p{N}_]+/gu)?.forEach((tag) => out.add(tag.slice(1)))
  return [...out].filter(Boolean).slice(0, 12)
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function hookFrom(caption) {
  const text = cleanText(caption).replace(/#[\p{L}\p{N}_]+/gu, '').trim()
  if (!text) return ''
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim()
  return (firstSentence || text).split(/\s+/).slice(0, 14).join(' ')
}

function platformFrom(item, source) {
  const url = String(valueAt(item, ['webVideoUrl', 'url', 'postUrl', 'postPageUrl']) || source || '')
  if (/tiktok/i.test(url)) return 'TikTok'
  if (/instagram|reel/i.test(url)) return 'Instagram'
  if (/youtube|shorts/i.test(url)) return 'YouTube'
  return String(valueAt(item, ['platform', 'source']) || 'Apify')
}

function normalizeTrend(item, query) {
  const caption = cleanText(valueAt(item, ['text', 'description', 'desc', 'caption', 'title']))
  const postUrl = String(valueAt(item, ['webVideoUrl', 'url', 'postUrl', 'postPageUrl', 'shareUrl']) || '')
  const author = String(valueAt(item, [
    'authorMeta.name',
    'authorMeta.nickName',
    'author.uniqueId',
    'author.nickname',
    'author.username',
    'username',
  ]) || '')
  const uploadDate = valueAt(item, ['createTimeISO', 'createTime', 'timestamp', 'takenAt', 'uploadDate', 'date'])
  const duration = numberAt(item, ['videoMeta.duration', 'duration', 'video.duration'])
  const type = String(valueAt(item, ['type', 'contentType']) || (duration ? 'video' : 'post'))
  return {
    id: `trend:${randomUUID()}`,
    hook: hookFrom(caption),
    caption,
    hashtags: hashtagsFrom(item, caption),
    postUrl,
    platform: platformFrom(item, query),
    author,
    views: numberAt(item, ['playCount', 'viewCount', 'views', 'stats.playCount', 'metrics.views']),
    likes: numberAt(item, ['diggCount', 'likeCount', 'likes', 'stats.diggCount', 'metrics.likes']),
    comments: numberAt(item, ['commentCount', 'comments', 'stats.commentCount', 'metrics.comments']),
    shares: numberAt(item, ['shareCount', 'shares', 'stats.shareCount', 'metrics.shares']),
    duration,
    uploadDate: uploadDate ? String(uploadDate) : null,
    scrapedAt: new Date().toISOString(),
    contentType: type,
    query,
  }
}

export async function scrapeTrends({ apiKey, projectId, queries, count, actor }) {
  if (!apiKey) throw new Error('Missing Apify API key. Add it in Settings.')
  const terms = (Array.isArray(queries) ? queries : String(queries || '').split(','))
    .map((q) => q.trim())
    .filter(Boolean)
  if (!terms.length) throw new Error('Enter at least one trend query, hashtag, profile, or URL.')
  const limit = Math.min(Math.max(Math.round(Number(count) || 20), 1), 100)
  const perTerm = Math.max(1, Math.ceil(limit / terms.length))
  const actorName = actor || DEFAULT_TREND_ACTOR
  const actorPath = actorName.replace('/', '~')
  const collected = []

  for (const term of terms) {
    log.start(`Mining trends -> "${term}"`)
    const res = await fetch(`${APIFY}/${actorPath}/run-sync-get-dataset-items?token=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(actorInput(term, perTerm)),
      signal: AbortSignal.timeout(300_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Apify ${res.status}: ${text.slice(0, 180)}`)
    }
    const items = await res.json()
    const normalized = (Array.isArray(items) ? items : [])
      .map((item) => normalizeTrend(item, term))
      .filter((item) => item.caption || item.hook || item.postUrl)
    collected.push(...normalized)
    log.info(`collected ${normalized.length} trend item${normalized.length === 1 ? '' : 's'} for "${term}"`)
  }

  if (!collected.length) throw new Error('Apify returned no trend items. Try a different query, hashtag, or actor.')

  const existing = listTrends(projectId)
  const seen = new Set(existing.map((item) => item.postUrl).filter(Boolean))
  const fresh = collected.filter((item) => !item.postUrl || !seen.has(item.postUrl)).slice(0, limit)
  const next = [...fresh, ...existing].slice(0, 1000)
  setTrends(projectId, next)
  log.ok(`Added ${fresh.length} trend item${fresh.length === 1 ? '' : 's'}`)
  return { added: fresh.length, found: collected.length, trends: next }
}
