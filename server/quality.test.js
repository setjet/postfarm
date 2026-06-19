import test from 'node:test'
import assert from 'node:assert/strict'
import { assertPublishable, detectTextOverflow, isQualityStale, QUALITY_REPORT_VERSION, repairQuality, runQualityGate } from './quality.js'

function post(patch = {}) {
  return {
    id: 'post-1',
    hook: 'A useful AI workflow',
    caption: 'Save this practical workflow.',
    hashtags: ['ai', 'workflow'],
    format: 'standard',
    slides: [{ id: 'slide-1', text: 'A useful AI workflow', bgFrom: '#111827', bgTo: '#020617' }],
    ...patch,
  }
}

test('quality severity blocks explicit exclusions and preserves warnings separately', () => {
  const report = runQualityGate(post({
    generationNotes: 'no emojis',
    caption: 'Save this 🚀',
    hashtags: ['ai', '#AI', 'bad tag'],
  }))
  assert.equal(report.status, 'blocked')
  assert.ok(report.findings.some((item) => item.id === 'excluded-emoji' && item.severity === 'blocking'))
  assert.ok(report.findings.some((item) => item.id === 'hashtags-format' && item.severity === 'warning'))
})

test('overflow detection covers standard slides and complete Notes content', () => {
  assert.ok(detectTextOverflow(post({ slides: [{ text: 'word '.repeat(1200) }] })).length)
  const notes = post({
    format: 'notes',
    notesData: {
      hookText: 'Hook',
      noteTitle: 'Long notes',
      points: Array.from({ length: 5 }, (_, index) => ({ heading: `Point ${index + 1}`, body: 'detail '.repeat(180) })),
    },
  })
  assert.ok(detectTextOverflow(notes).some((item) => item.field === 'notesData'))
})

test('exact duplicate slide content is blocking while a similar hook is only a warning', () => {
  const report = runQualityGate(post({
    slides: [{ id: 'one', text: 'Exact duplicate' }, { id: 'two', text: 'Exact duplicate' }],
  }), { recentHooks: ['A useful AI workflow'] })
  assert.ok(report.findings.some((item) => item.id === 'duplicate-slide-copy' && item.severity === 'blocking'))
  assert.ok(report.findings.some((item) => item.id === 'repeated-hook' && item.severity === 'warning'))
})

test('quality reports become stale after content edits', () => {
  const source = post()
  const report = runQualityGate(source)
  assert.equal(isQualityStale(source, report), false)
  assert.equal(isQualityStale({ ...source, caption: 'Edited after checking' }, report), true)
  assert.equal(isQualityStale(source, { ...report, version: QUALITY_REPORT_VERSION - 1 }), true)
})

test('product checks only enforce explicit requirements and accept clear variations', () => {
  const optional = runQualityGate(post(), {
    brain: { appName: 'Optional Product', appDescription: 'Context only', styleMemory: 'Promotional voice' },
  })
  assert.equal(optional.findings.some((item) => item.id === 'missing-product'), false)

  const missing = runQualityGate(post({
    productRequirement: { required: true, value: 'Alpha Suite' },
  }))
  assert.ok(missing.findings.some((item) => item.id === 'missing-product' && item.severity === 'blocking'))

  const present = runQualityGate(post({
    productRequirement: { required: true, value: 'Alpha Suite Pro' },
    caption: 'See what Alpha-Suite can do, then save this workflow.',
  }))
  assert.equal(present.findings.some((item) => item.id === 'missing-product'), false)
})

test('generic CTA guidance is checked as an instruction, not a literal product phrase', () => {
  const report = runQualityGate(post({ productEmphasis: 'add cta to captions' }))
  assert.equal(report.findings.some((item) => item.id === 'missing-product'), false)
  assert.equal(report.findings.some((item) => item.id === 'missing-required-cta'), false)

  const missing = runQualityGate(post({
    caption: 'A practical workflow overview.',
    productEmphasis: 'add cta to captions',
  }))
  assert.ok(missing.findings.some((item) => item.id === 'missing-required-cta'))
})

test('warning-only reports remain publishable after explicit acknowledgement', () => {
  const report = runQualityGate(post(), { recentHooks: ['A useful AI workflow'] })
  assert.equal(report.status, 'warnings')
  assert.throws(() => assertPublishable(report), /acknowledge/i)
  assert.doesNotThrow(() => assertPublishable(report, { warningsAcknowledged: true }))
})

test('safe repairs normalize hashtags, whitespace, and duplicate numbering', () => {
  const fixed = repairQuality(post({
    hashtags: ['#AI', 'ai', 'bad tag'],
    slides: [{ text: '1. 1.   Start   here' }],
  }))
  assert.deepEqual(fixed.hashtags, ['ai', 'bad', 'tag', 'fyp'])
  assert.equal(fixed.slides[0].text, '1. Start here')
})

test('scheduling detects invalid timezones and duplicate account slots', () => {
  const scheduledAt = new Date(Date.now() + 3_600_000).toISOString()
  const report = runQualityGate(post(), {
    scheduling: true,
    mode: 'schedule',
    scheduledAt,
    timezone: 'Not/A_Timezone',
    socialAccounts: [4],
    connectedAccountIds: [9],
    platforms: ['instagram'],
    postbridgeConfigured: true,
    postType: 'image',
    renderedMedia: ['not-a-png'],
    existingSlots: [{ scheduledAt, socialAccounts: [4], localPostId: 'other' }],
    localPostId: 'post-1',
  })
  assert.ok(report.findings.some((item) => item.id === 'invalid-timezone'))
  assert.ok(report.findings.some((item) => item.id === 'schedule-conflict'))
  assert.ok(report.findings.some((item) => item.id === 'disconnected-account'))
})
