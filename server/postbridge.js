// Thin client for the post-bridge API (https://www.post-bridge.com).
// post-bridge handles media hosting, scheduling, multi-platform publishing,
// and analytics — so Slidesmith needs no storage or posting integrations of
// its own. Auth is a Bearer token the user pastes into Settings.
const BASE = 'https://api.post-bridge.com'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function authHeaders(token) {
  if (!token) throw new Error('Missing post-bridge API key. Add it in Settings.')
  return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

// post-bridge enforces a global API rate limit (429 "API rate limit exceeded").
// Bulk scheduling fires lots of calls (create-upload-url per slide + a post per
// slideshow), so we funnel EVERY API call through a single serial queue with a
// small gap between calls. This trades a little speed for not getting throttled.
let pbChain = Promise.resolve()
const PB_MIN_GAP_MS = 350 // ~2.8 req/s

function enqueue(fn) {
  const result = pbChain.then(fn)
  // Keep the chain alive whether fn resolves or rejects, and always space the
  // NEXT call by PB_MIN_GAP_MS.
  pbChain = result.then(() => sleep(PB_MIN_GAP_MS), () => sleep(PB_MIN_GAP_MS))
  return result
}

async function pbFetch(token, path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(token), ...(init.headers || {}) },
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { res, body, text }
}

async function pb(token, path, init = {}) {
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { res, body, text } = await enqueue(() => pbFetch(token, path, init))
    // Rate limited — wait (honouring Retry-After if present) and try again.
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const wait = retryAfter > 0 ? retryAfter * 1000 : 600 * 2 ** (attempt - 1) // 0.6s,1.2s,2.4s…
      await sleep(wait)
      continue
    }
    if (!res.ok) {
      const msg = body?.message || body?.error || text || res.statusText
      throw new Error(`post-bridge ${res.status}: ${Array.isArray(msg) ? msg.join('; ') : msg}`)
    }
    return body
  }
}

export async function listAccounts(token) {
  const body = await pb(token, '/v1/social-accounts?limit=100')
  return body?.data || []
}

// Build a media-id map for active posts. Postbridge's media URLs live at
// media.object.url, while posts can contain only bare media IDs.
async function mediaInfoMapForPosts(token, posts, allMedia = false) {
  const wanted = new Set(posts
    .filter((post) => post?.is_draft || post?.status === 'scheduled')
    .flatMap((post) => {
      const ids = Array.isArray(post.media) ? post.media.filter((item) => typeof item === 'string') : []
      return allMedia ? ids : ids.slice(0, 1)
    }))
  if (!wanted.size) return {}
  try {
    const map = {}
    // Collection results intentionally omit signed URLs, so retrieve active
    // scheduled/draft assets by ID. Calls still pass through the shared queue.
    await Promise.all([...wanted].map(async (id) => {
      try {
        const m = await pb(token, `/v1/media/${encodeURIComponent(id)}`)
        const url = m?.object?.url
        if (url) map[id] = {
          url,
          mimeType: m.mime_type || null,
          duration: Number(m.duration ?? m.object?.duration) || null,
        }
      } catch {
        // A single expired/deleted asset should not hide the rest of the post.
      }
    }))
    return map
  } catch (error) {
    // Thumbnails are best-effort — never block the posts list on a media fetch.
    console.warn('[post-bridge] media previews unavailable:', error?.message || error)
    return {}
  }
}

export async function listPosts(token) {
  const body = await pb(token, '/v1/posts?limit=100')
  const posts = body?.data || []
  const infoById = await mediaInfoMapForPosts(token, posts)

  // Normalise each post's media (id-string | {url} | MediaDto) → plain URL list.
  const toInfo = (m) => {
    if (!m) return null
    if (typeof m === 'string') return infoById[m] || null
    const fallback = infoById[m.id] || {}
    const url = m.object?.url || m.url || fallback.url || ''
    return url ? {
      url,
      mimeType: m.mime_type || m.mimeType || fallback.mimeType || null,
      duration: Number(m.duration ?? m.object?.duration ?? fallback.duration) || null,
    } : null
  }
  for (const p of posts) {
    p.media_items = (Array.isArray(p.media) ? p.media : []).map(toInfo).filter(Boolean)
    p.media_urls = p.media_items.map((m) => m.url)
    p.media_count = Array.isArray(p.media) ? p.media.length : p.media_items.length
  }
  return posts
}

// Lightweight schedule data for conflict checks. This deliberately avoids the
// signed-media resolution used by the Schedule UI.
export async function listPostSchedule(token) {
  const body = await pb(token, '/v1/posts?limit=100')
  const posts = body?.data || []
  return posts.map((post) => ({
    id: post.id,
    status: post.is_draft ? 'draft' : post.status,
    scheduledAt: post.scheduled_at || null,
    socialAccounts: Array.isArray(post.social_accounts) ? post.social_accounts.map(Number).filter(Number.isFinite) : [],
  }))
}

export async function getPost(token, id) {
  return pb(token, `/v1/posts/${encodeURIComponent(id)}`)
}

export async function getPostMedia(token, id) {
  const post = await getPost(token, id)
  const infoById = await mediaInfoMapForPosts(token, [post], true)
  return (Array.isArray(post?.media) ? post.media : []).map((media) => {
    if (!media) return null
    if (typeof media === 'string') return infoById[media] || null
    const fallback = infoById[media.id] || {}
    const url = media.object?.url || media.url || fallback.url || ''
    return url ? {
      url,
      mimeType: media.mime_type || media.mimeType || fallback.mimeType || null,
      duration: Number(media.duration ?? media.object?.duration ?? fallback.duration) || null,
    } : null
  }).filter(Boolean)
}

// Update only the remote schedule. Omitting every other UpdatePostDto field
// prevents accidental content/account changes and never uploads duplicate media.
export async function updatePostSchedule(token, id, scheduledAt) {
  return pb(token, `/v1/posts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ scheduled_at: scheduledAt }),
  })
}

export async function deletePost(token, id) {
  return pb(token, `/v1/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listAnalytics(token) {
  const body = await pb(token, '/v1/analytics?limit=100')
  return body?.data || []
}

// Ask post-bridge to pull fresh metrics from the connected platforms. Returns
// 429 when called too often — the caller treats that as "try again shortly".
export async function syncAnalytics(token) {
  return pb(token, '/v1/analytics/sync', { method: 'POST' })
}

// Upload one image: ask post-bridge for a signed URL, PUT the bytes, return media_id.
// Retries transient failures — when many slides upload at once (bulk scheduling
// fans out 30+ concurrent PUTs) post-bridge / its storage occasionally drops one,
// and a single dropped slide must not fail the whole post.
export async function uploadMedia(token, { buffer, mimeType, name }, attempts = 3) {
  let lastErr
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const created = await pb(token, '/v1/media/create-upload-url', {
        method: 'POST',
        body: JSON.stringify({ mime_type: mimeType, size_bytes: buffer.length, name }),
      })
      const put = await fetch(created.upload_url, {
        method: 'PUT',
        headers: { 'content-type': mimeType },
        body: buffer,
      })
      if (!put.ok) throw new Error(`Media upload failed (${put.status}) for ${name}`)
      return created.media_id
    } catch (e) {
      lastErr = e
      if (attempt < attempts) await sleep(400 * attempt) // 400ms, 800ms backoff
    }
  }
  throw lastErr
}

export async function createPost(token, { caption, mediaIds, socialAccounts, scheduledAt, isDraft }) {
  return pb(token, '/v1/posts', {
    method: 'POST',
    body: JSON.stringify({
      caption,
      media: mediaIds,
      social_accounts: socialAccounts,
      scheduled_at: scheduledAt || null,
      is_draft: !!isDraft,
    }),
  })
}
