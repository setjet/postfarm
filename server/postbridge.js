// Shared client for the Postbridge API (https://www.post-bridge.com).
// Node's global fetch keeps a shared connection pool, so every request through
// this module reuses the same HTTP client/connections rather than constructing
// an agent per operation.
import { createHash } from 'node:crypto'

const BASE = 'https://api.post-bridge.com'
const READ_TIMEOUT_MS = 15_000
const WRITE_TIMEOUT_MS = 30_000
const SCHEDULE_TTL_MS = 60_000
const ACCOUNT_TTL_MS = 60_000
const ANALYTICS_TTL_MS = 30_000
const MEDIA_TTL_MS = 5 * 60_000
const READ_ATTEMPTS = 3
const MEDIA_CONCURRENCY = 4
const DEBUG = process.env.POSTFARM_API_DEBUG === '1'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (value) => value == null ? value : structuredClone(value)
const tokenKey = (token) => createHash('sha256').update(String(token || '')).digest('hex').slice(0, 24)

const inFlightReads = new Map()
const rawPostCache = new Map()
const scheduleCache = new Map()
const accountCache = new Map()
const analyticsCache = new Map()
const mediaCache = new Map()
const mutationVersions = new Map()

function debug(event, fields) {
  if (DEBUG) console.info(`[postbridge:${event}]`, fields)
}

function authHeaders(token) {
  if (!token) throw new Error('Missing Postbridge API key. Add it in Settings.')
  return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

export class PostbridgeError extends Error {
  constructor(message, { status, cause, retryAfterMs } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'PostbridgeError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

function retryAfterMs(res) {
  const value = res.headers.get('retry-after')
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

function retryDelay(attempt, requested) {
  if (requested != null) return requested
  const base = 250 * 2 ** (attempt - 1)
  return base + Math.floor(Math.random() * Math.max(1, base * 0.35))
}

async function requestOnce(token, path, init, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Postbridge request timed out.')), timeoutMs)
  const started = performance.now()
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...authHeaders(token), ...(init.headers || {}) },
      signal: controller.signal,
    })
    const text = await res.text()
    let body
    try { body = text ? JSON.parse(text) : null } catch { body = text }
    debug('request', { method: init.method || 'GET', path, status: res.status, ms: Math.round(performance.now() - started) })
    if (!res.ok) {
      const detail = body?.message || body?.error || text || res.statusText
      const message = Array.isArray(detail) ? detail.join('; ') : detail
      throw new PostbridgeError(`Postbridge ${res.status}: ${message}`, {
        status: res.status,
        retryAfterMs: retryAfterMs(res),
      })
    }
    return body
  } catch (error) {
    if (error instanceof PostbridgeError) throw error
    const timedOut = controller.signal.aborted
    throw new PostbridgeError(
      timedOut ? `Postbridge timed out after ${timeoutMs}ms.` : `Postbridge network error: ${error?.message || error}`,
      { status: timedOut ? 408 : undefined, cause: error },
    )
  } finally {
    clearTimeout(timeout)
  }
}

async function performRequest(token, path, init = {}) {
  const method = String(init.method || 'GET').toUpperCase()
  const isRead = method === 'GET' || method === 'HEAD'
  // PATCHing scheduled_at is idempotent, so transient retries are safe. POST
  // and DELETE remain single-attempt because their outcome may be uncertain.
  const retryableMethod = isRead || method === 'PATCH'
  const attempts = retryableMethod ? READ_ATTEMPTS : 1
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await requestOnce(token, path, init, isRead ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS)
    } catch (error) {
      const transient = error?.status === 408 || error?.status === 429 || error?.status >= 500 || error?.status == null
      if (!retryableMethod || !transient || attempt === attempts) throw error
      const wait = retryDelay(attempt, error.retryAfterMs)
      debug('retry', { method, path, attempt, waitMs: wait, status: error.status || 'network' })
      await sleep(wait)
    }
  }
}

// Concurrent identical reads share one remote request. Mutations deliberately
// bypass this map: they require their own action lock/idempotency semantics.
async function pb(token, path, init = {}) {
  const method = String(init.method || 'GET').toUpperCase()
  if (method !== 'GET' || init.body) return performRequest(token, path, init)
  const key = `${tokenKey(token)}:${path}`
  const existing = inFlightReads.get(key)
  if (existing) {
    debug('dedupe', { path })
    return clone(await existing)
  }
  const request = performRequest(token, path, init).finally(() => inFlightReads.delete(key))
  inFlightReads.set(key, request)
  return clone(await request)
}

async function cached(cache, key, ttl, loader, { force = false, canStore = () => true } = {}) {
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.storedAt < ttl) return clone(hit.value)
  const value = await loader()
  if (canStore()) cache.set(key, { value: clone(value), storedAt: Date.now() })
  return clone(value)
}

function versionFor(key) {
  return mutationVersions.get(key) || 0
}

function bumpVersion(key) {
  mutationVersions.set(key, versionFor(key) + 1)
}

function clearByToken(cache, key) {
  for (const cacheKey of cache.keys()) {
    if (cacheKey === key || cacheKey.startsWith(`${key}:`)) cache.delete(cacheKey)
  }
}

export function invalidateScheduleCache(token) {
  const key = tokenKey(token)
  bumpVersion(key)
  inFlightReads.delete(`${key}:/v1/posts?limit=100`)
  rawPostCache.delete(key)
  clearByToken(scheduleCache, key)
}

function mutateCachedPosts(token, mutate) {
  const key = tokenKey(token)
  bumpVersion(key)
  inFlightReads.delete(`${key}:/v1/posts?limit=100`)
  const raw = rawPostCache.get(key)
  if (raw) rawPostCache.set(key, { ...raw, value: mutate(raw.value) })
  for (const [cacheKey, entry] of scheduleCache.entries()) {
    if (cacheKey.startsWith(`${key}:`)) scheduleCache.set(cacheKey, { ...entry, value: mutate(entry.value) })
  }
}

export function findCachedPost(token, scope, id) {
  const key = tokenKey(token)
  const scoped = scheduleCache.get(`${key}:${scope || 'default'}`)?.value
  const raw = rawPostCache.get(key)?.value
  return clone((scoped || raw || []).find((post) => String(post.id) === String(id)) || null)
}

export function markPostRemoved(token, id) {
  mutateCachedPosts(token, (posts) => posts.filter((post) => String(post.id) !== String(id)))
}

function updateCachedPost(token, id, patch) {
  mutateCachedPosts(token, (posts) => posts.map((post) => String(post.id) === String(id) ? { ...post, ...patch } : post))
}

async function rawPosts(token, force = false) {
  const key = tokenKey(token)
  const version = versionFor(key)
  return cached(rawPostCache, key, SCHEDULE_TTL_MS, async () => {
    const body = await pb(token, '/v1/posts?limit=100')
    if (!body || !Array.isArray(body.data)) throw new PostbridgeError('Postbridge returned a malformed posts response.')
    return body.data
  }, { force, canStore: () => version === versionFor(key) })
}

export async function listAccounts(token, { force = false } = {}) {
  const key = tokenKey(token)
  return cached(accountCache, key, ACCOUNT_TTL_MS, async () => {
    const body = await pb(token, '/v1/social-accounts?limit=100')
    if (!body || !Array.isArray(body.data)) throw new PostbridgeError('Postbridge returned a malformed accounts response.')
    return body.data
  }, { force })
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}

async function resolveMediaId(token, id) {
  const key = `${tokenKey(token)}:${id}`
  return cached(mediaCache, key, MEDIA_TTL_MS, async () => {
    const media = await pb(token, `/v1/media/${encodeURIComponent(id)}`)
    const url = media?.object?.url || media?.url
    return url ? {
      url,
      mimeType: media.mime_type || media.mimeType || null,
      duration: Number(media.duration ?? media.object?.duration) || null,
    } : null
  })
}

// Resolve only IDs whose post payload did not already include a usable URL.
// Card loads need just the first asset; carousel assets are fetched on preview.
async function mediaInfoMapForPosts(token, posts, allMedia = false) {
  const wanted = new Set(posts
    .filter((post) => allMedia || post?.is_draft || post?.status === 'scheduled')
    .flatMap((post) => {
      const media = Array.isArray(post.media) ? post.media : []
      const selected = allMedia ? media : media.slice(0, 1)
      return selected.flatMap((item) => {
        if (typeof item === 'string') return [item]
        if (item?.object?.url || item?.url) return []
        return item?.id ? [String(item.id)] : []
      })
    }))
  const ids = [...wanted]
  const values = await mapWithConcurrency(ids, MEDIA_CONCURRENCY, async (id) => {
    try { return await resolveMediaId(token, id) } catch { return null }
  })
  return {
    info: Object.fromEntries(ids.flatMap((id, index) => values[index] ? [[id, values[index]]] : [])),
    lookups: ids.length,
  }
}

function normalisePosts(posts, infoById) {
  return posts.map((post) => {
    const toInfo = (media) => {
      if (!media) return null
      if (typeof media === 'string') return infoById[media] || null
      const fallback = infoById[media.id] || {}
      const url = media.object?.url || media.url || fallback.url || ''
      return url ? {
        url,
        mimeType: media.mime_type || media.mimeType || fallback.mimeType || null,
        duration: Number(media.duration ?? media.object?.duration ?? fallback.duration) || null,
      } : null
    }
    const media = Array.isArray(post.media) ? post.media : []
    const mediaItems = media.map(toInfo).filter(Boolean)
    return {
      ...post,
      media_items: mediaItems,
      media_urls: mediaItems.map((item) => item.url),
      media_count: media.length || mediaItems.length,
    }
  })
}

export async function listPosts(token, { scope = 'default', force = false } = {}) {
  const tokenHash = tokenKey(token)
  const cacheKey = `${tokenHash}:${scope}`
  const version = versionFor(tokenHash)
  const cachedEntry = scheduleCache.get(cacheKey)
  if (!force && cachedEntry && Date.now() - cachedEntry.storedAt < SCHEDULE_TTL_MS) {
    debug('schedule-cache', { scope, hit: true, posts: cachedEntry.value.length })
    return clone(cachedEntry.value)
  }
  const started = performance.now()
  const postsStarted = performance.now()
  const posts = await rawPosts(token, force)
  const postsMs = performance.now() - postsStarted
  const mediaStarted = performance.now()
  const { info, lookups } = await mediaInfoMapForPosts(token, posts)
  const mediaMs = performance.now() - mediaStarted
  const transformStarted = performance.now()
  const result = normalisePosts(posts, info)
  const transformMs = performance.now() - transformStarted
  if (version === versionFor(tokenHash)) scheduleCache.set(cacheKey, { value: clone(result), storedAt: Date.now() })
  debug('schedule', {
    scope,
    posts: result.length,
    mediaLookups: lookups,
    postsMs: Math.round(postsMs),
    mediaMs: Math.round(mediaMs),
    transformMs: Math.round(transformMs),
    totalMs: Math.round(performance.now() - started),
  })
  return result
}

// Lightweight schedule data for conflict checks. This deliberately avoids
// signed-media resolution used by the Schedule UI.
export async function listPostSchedule(token) {
  const posts = await rawPosts(token)
  return posts.map((post) => ({
    id: post.id,
    status: post.is_draft ? 'draft' : post.status,
    scheduledAt: post.scheduled_at || null,
    socialAccounts: Array.isArray(post.social_accounts) ? post.social_accounts.map(Number).filter(Number.isFinite) : [],
  }))
}

export async function getPost(token, id) {
  const post = await pb(token, `/v1/posts/${encodeURIComponent(id)}`)
  if (!post || typeof post !== 'object' || Array.isArray(post)) {
    throw new PostbridgeError('Postbridge returned a malformed post response.')
  }
  return post
}

export async function getPostMedia(token, id) {
  const post = await getPost(token, id)
  const { info } = await mediaInfoMapForPosts(token, [post], true)
  return normalisePosts([post], info)[0]?.media_items || []
}

// Update only the remote schedule. Omitting all other UpdatePostDto fields
// prevents content/account changes and never uploads duplicate media.
export async function updatePostSchedule(token, id, scheduledAt) {
  const post = await pb(token, `/v1/posts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ scheduled_at: scheduledAt }),
  })
  updateCachedPost(token, id, { ...post, scheduled_at: scheduledAt })
  return post
}

// DELETE is intentionally attempted once. A timeout is reported to the user as
// uncertain rather than risking a blind second destructive request.
export async function deletePost(token, id) {
  const result = await pb(token, `/v1/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
  markPostRemoved(token, id)
  return result
}

export async function listAnalytics(token, { force = false } = {}) {
  const key = tokenKey(token)
  return cached(analyticsCache, key, ANALYTICS_TTL_MS, async () => {
    const body = await pb(token, '/v1/analytics?limit=100')
    if (!body || !Array.isArray(body.data)) throw new PostbridgeError('Postbridge returned a malformed analytics response.')
    return body.data
  }, { force })
}

export async function syncAnalytics(token) {
  const result = await pb(token, '/v1/analytics/sync', { method: 'POST' })
  analyticsCache.delete(tokenKey(token))
  return result
}

export async function uploadMedia(token, { buffer, mimeType, name }, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const created = await pb(token, '/v1/media/create-upload-url', {
        method: 'POST',
        body: JSON.stringify({ mime_type: mimeType, size_bytes: buffer.length, name }),
      })
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60_000)
      try {
        const put = await fetch(created.upload_url, {
          method: 'PUT',
          headers: { 'content-type': mimeType },
          body: buffer,
          signal: controller.signal,
        })
        if (!put.ok) throw new Error(`Media upload failed (${put.status}) for ${name}`)
      } finally {
        clearTimeout(timeout)
      }
      return created.media_id
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(400 * attempt)
    }
  }
  throw lastError
}

export async function createPost(token, { caption, mediaIds, socialAccounts, scheduledAt, isDraft }) {
  const post = await pb(token, '/v1/posts', {
    method: 'POST',
    body: JSON.stringify({
      caption,
      media: mediaIds,
      social_accounts: socialAccounts,
      scheduled_at: scheduledAt || null,
      is_draft: !!isDraft,
    }),
  })
  invalidateScheduleCache(token)
  return post
}

export function __resetPostbridgeCachesForTests() {
  inFlightReads.clear()
  rawPostCache.clear()
  scheduleCache.clear()
  accountCache.clear()
  analyticsCache.clear()
  mediaCache.clear()
  mutationVersions.clear()
}
