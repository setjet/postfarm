import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHashtags, resolveHashtagStrategy, strategyWithHashtagNotes, trendHashtagSignals } from './hashtags.js'

const brain = { appName: 'Example Brand', niche: 'Creator education' }

test('hashtag normalization accepts arrays and mixed strings without blobs or duplicates', () => {
  const tags = normalizeHashtags(['#CreatorTips,#ContentStrategy', '#creatortips #yourbrand'], {
    brain,
    strategy: { count: 5, avoidGeneric: true },
  })
  assert.deepEqual(tags, ['creatortips', 'contentstrategy', 'yourbrand', 'examplebrand'])
  assert.ok(tags.every((tag) => !tag.includes('#') && !tag.includes(' ')))
})

test('strategy normalization enforces required and banned tags inside the configured count', () => {
  const strategy = {
    count: 5,
    required: ['yourbrand'],
    banned: ['viral'],
    avoidGeneric: true,
  }
  const tags = normalizeHashtags('#fyp #viral #creatortips #contentstrategy #workflow #youraudience', { brain, strategy })
  assert.deepEqual(tags, ['creatortips', 'contentstrategy', 'workflow', 'yourbrand', 'examplebrand'])
  assert.equal(tags.includes('fyp'), false)
  assert.equal(tags.includes('viral'), false)
})

test('batch hashtag notes can add an explicit temporary ban without changing the project strategy', () => {
  const project = resolveHashtagStrategy({ avoidGeneric: false, banned: [] }, brain)
  const batch = strategyWithHashtagNotes(project, 'use more AI image hashtags, avoid #fyp', brain)
  assert.equal(project.banned.includes('fyp'), false)
  assert.equal(batch.banned.includes('fyp'), true)
  assert.equal(normalizeHashtags(['fyp', 'aiimages'], { brain, strategy: batch }).includes('fyp'), false)
})

test('trend hashtag signals rank repeated, relevant, high-performing tags', () => {
  const trends = [
    { hashtags: ['aiimages', 'fyp'], hook: 'AI image workflow', caption: '', query: 'AI images', views: 10000, likes: 500, comments: 30, shares: 20, scrapedAt: new Date().toISOString() },
    { hashtags: ['aiimages', 'claudeai'], hook: 'AI image prompts', caption: '', query: 'AI images', views: 8000, likes: 300, comments: 20, shares: 10, scrapedAt: new Date().toISOString() },
  ]
  const signals = trendHashtagSignals(trends, { brain, topic: 'AI images' })
  assert.equal(signals[0].tag, 'aiimages')
  assert.equal(signals[0].frequency, 2)
})
