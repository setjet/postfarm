import test from 'node:test'
import assert from 'node:assert/strict'
import {
  __resetPostbridgeCachesForTests,
  deletePost,
  listAccounts,
  listPosts,
  updatePostSchedule,
} from './postbridge.js'

test('scheduled post mutations use the documented remote methods and minimal PATCH body', async (t) => {
  __resetPostbridgeCachesForTests()
  const originalFetch = globalThis.fetch
  const calls = []
  t.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({ id: 'post/one' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  await updatePostSchedule('server-secret', 'post/one', '2030-01-02T10:30:00.000Z')
  await deletePost('server-secret', 'post/one')

  assert.equal(calls[0].url, 'https://api.post-bridge.com/v1/posts/post%2Fone')
  assert.equal(calls[0].init.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[0].init.body), { scheduled_at: '2030-01-02T10:30:00.000Z' })
  assert.equal(calls[0].init.headers.Authorization, 'Bearer server-secret')
  assert.equal(calls[1].url, 'https://api.post-bridge.com/v1/posts/post%2Fone')
  assert.equal(calls[1].init.method, 'DELETE')
  assert.equal(calls[1].init.body, undefined)
})

test('concurrent and repeated Schedule reads deduplicate and use the short-lived cache', async (t) => {
  __resetPostbridgeCachesForTests()
  const originalFetch = globalThis.fetch
  let calls = 0
  t.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async () => {
    calls++
    await new Promise((resolve) => setTimeout(resolve, 20))
    return Response.json({ data: [{ id: 'p1', status: 'scheduled', media: [{ id: 'm1', url: 'https://media.test/one.jpg' }] }] })
  }

  const [first, second] = await Promise.all([
    listPosts('dedupe-key', { scope: 'project-one' }),
    listPosts('dedupe-key', { scope: 'project-one' }),
  ])
  assert.equal(calls, 1)
  assert.deepEqual(first, second)

  await listPosts('dedupe-key', { scope: 'project-one' })
  assert.equal(calls, 1)

  await listPosts('dedupe-key', { scope: 'project-one', force: true })
  assert.equal(calls, 2)
})

test('bare media IDs resolve with bounded parallelism and are cached by media ID', async (t) => {
  __resetPostbridgeCachesForTests()
  const originalFetch = globalThis.fetch
  const posts = Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, status: 'scheduled', media: [`m${index}`] }))
  let calls = 0
  let activeMedia = 0
  let maxActiveMedia = 0
  t.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url) => {
    calls++
    if (String(url).includes('/v1/posts?')) return Response.json({ data: posts })
    activeMedia++
    maxActiveMedia = Math.max(maxActiveMedia, activeMedia)
    await new Promise((resolve) => setTimeout(resolve, 10))
    activeMedia--
    return Response.json({ object: { url: `https://media.test/${String(url).split('/').pop()}` }, mime_type: 'image/jpeg' })
  }

  const first = await listPosts('media-key', { scope: 'project-one' })
  assert.equal(first.length, 30)
  assert.equal(calls, 31)
  assert.ok(maxActiveMedia > 1)
  assert.ok(maxActiveMedia <= 4)

  await listPosts('media-key', { scope: 'project-one', force: true })
  assert.equal(calls, 32, 'refresh reuses all resolved media URLs')
})

test('read retries transient errors but destructive deletes are attempted once', async (t) => {
  __resetPostbridgeCachesForTests()
  const originalFetch = globalThis.fetch
  let accountCalls = 0
  let deleteCalls = 0
  t.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'DELETE') {
      deleteCalls++
      return Response.json({ error: 'temporary failure' }, { status: 503 })
    }
    if (String(url).includes('/social-accounts')) {
      accountCalls++
      if (accountCalls < 3) return Response.json({ error: 'try again' }, { status: 503, headers: { 'retry-after': '0' } })
      return Response.json({ data: [] })
    }
    throw new Error('Unexpected request')
  }

  assert.deepEqual(await listAccounts('retry-key'), [])
  assert.equal(accountCalls, 3)
  await assert.rejects(deletePost('retry-key', 'p1'), /Postbridge 503/)
  assert.equal(deleteCalls, 1)
})

test('successful reschedule and delete patch the cached Schedule without a list refetch', async (t) => {
  __resetPostbridgeCachesForTests()
  const originalFetch = globalThis.fetch
  let listCalls = 0
  t.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('/v1/posts?')) {
      listCalls++
      return Response.json({ data: [{
        id: 'p1',
        status: 'scheduled',
        scheduled_at: '2030-01-01T10:00:00.000Z',
        media: [{ url: 'https://media.test/one.jpg' }],
      }] })
    }
    if (init.method === 'PATCH') return Response.json({ id: 'p1', status: 'scheduled' })
    if (init.method === 'DELETE') return Response.json({ id: 'p1' })
    throw new Error('Unexpected request')
  }

  await listPosts('mutation-key', { scope: 'project-one' })
  await updatePostSchedule('mutation-key', 'p1', '2030-02-01T12:00:00.000Z')
  const updated = await listPosts('mutation-key', { scope: 'project-one' })
  assert.equal(updated[0].scheduled_at, '2030-02-01T12:00:00.000Z')
  assert.equal(listCalls, 1)

  await deletePost('mutation-key', 'p1')
  assert.deepEqual(await listPosts('mutation-key', { scope: 'project-one' }), [])
  assert.equal(listCalls, 1)
})

test('large and mixed-media Schedule responses preserve rows without unnecessary media lookups', async (t) => {
  __resetPostbridgeCachesForTests()
  const originalFetch = globalThis.fetch
  let calls = 0
  const posts = Array.from({ length: 120 }, (_, index) => ({
    id: `p${index}`,
    status: 'scheduled',
    media: index === 0
      ? [
          { id: 'image', object: { url: 'https://media.test/image.jpg' }, mime_type: 'image/jpeg' },
          { id: 'video', url: 'https://media.test/video.mp4', mime_type: 'video/mp4', duration: 9 },
        ]
      : [],
  }))
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => {
    calls++
    return Response.json({ data: posts })
  }

  const result = await listPosts('large-key', { scope: 'project-one' })
  assert.equal(result.length, 120)
  assert.equal(result[0].media_count, 2)
  assert.equal(result[0].media_items[0].url, 'https://media.test/image.jpg')
  assert.equal(result[0].media_items[1].mimeType, 'video/mp4')
  assert.equal(calls, 1)
})
