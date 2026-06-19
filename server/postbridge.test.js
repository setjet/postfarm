import test from 'node:test'
import assert from 'node:assert/strict'
import { deletePost, updatePostSchedule } from './postbridge.js'

test('scheduled post mutations use the documented remote methods and minimal PATCH body', async (t) => {
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
