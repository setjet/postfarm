// Postfarm local server. Holds the user's API keys, runs AI generation,
// proxies post-bridge (so keys never touch the browser and CORS is a non-issue),
// and serves the built UI in production. In dev, Vite proxies /api here.
import express from 'express'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getConfig,
  saveGlobal,
  getActiveProject,
  createProject,
  updateProject,
  removeImagePackFromProjects,
  deleteProject,
  setActiveProject,
  getQueue,
  setQueue,
  addToQueue,
  removeFromQueue,
  getPlans,
  getPlan,
  savePlan,
  deletePlan,
  getDismissedPublishedPostIds,
  dismissPublishedPost,
  restorePublishedPost,
  reconcileDismissedPublishedPosts,
  invalidateLibraryAssetReferences,
  CONFIG_DIR,
} from './store.js'
import {
  listAccounts,
  listPosts,
  listPostSchedule,
  getPost,
  getPostMedia,
  updatePostSchedule,
  deletePost,
  markPostRemoved,
  listAnalytics,
  syncAnalytics,
  uploadMedia,
  createPost,
} from './postbridge.js'
import { cleanGenerationNotes, generateSlideshows, improveSlideshow } from './generate.js'
import { listModels } from './openrouter.js'
import { listDeepSeekModels, providerKey, providerModel, validateProviderKey } from './ai.js'
import {
  listLibrary,
  listPacks,
  resolveBackgroundSelection,
  assignBackgrounds,
  scrapePinterest,
  removeScraped,
  getScrapedFile,
  getLibraryAsset,
  assertPostAssetsAvailable,
  importImages,
  moveImageToFolder,
  moveImagesFromFolder,
} from './library.js'
import {
  listVideos,
  importVideoUrl,
  scrapeVideos,
  removeVideo,
  getVideoFile,
  getVideoAsset,
  moveVideoToFolder,
  moveVideosFromFolder,
} from './videoLibrary.js'
import { renderVideoPost } from './videoRender.js'
import { listTrends, scrapeTrends, removeTrend, clearTrends, trendsForPrompt } from './trends.js'
import { getLearningMemory, rebuildLearningMemory, clearLearningMemory } from './learning.js'
import { normalizeHashtags } from './hashtags.js'
import { UNCATEGORIZED_FOLDER_ID, createFolder, deleteFolder, listFolders, renameFolder } from './folders.js'
import { logger } from './log.js'
import { assertPublishable, isQualityStale, repairQuality, runQualityGate } from './quality.js'
import { createPlan, movePlanSlot, planProgress, plannerStatusForQualityReport, scheduleFingerprint } from './planner.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schedLog = logger('schedule')
const genLog = logger('generate')
const API_DEBUG = process.env.POSTFARM_API_DEBUG === '1'
const PORT = process.env.PORT || 8787
// Bind loopback only by default. This server returns the user's API keys in
// plaintext (GET /api/config feeds the Settings UI), so listening on all
// interfaces would hand them to anyone on the same network. Set HOST yourself
// only if you know what you're doing (e.g. a firewalled headless box).
const HOST = process.env.HOST || '127.0.0.1'
const app = express()
app.use(express.json({ limit: '100mb' })) // rendered slides and multi-image imports can be large

// DNS-rebinding guard: a malicious website can point its own domain at
// 127.0.0.1 and read API responses from the visitor's browser, bypassing
// same-origin policy. Rejecting unexpected Host headers closes that hole.
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', process.env.HOST].filter(Boolean))
app.use((req, res, next) => {
  if (process.env.VERCEL) return next()
  const host = String(req.headers.host || '').replace(/:\d+$/, '')
  if (!ALLOWED_HOSTS.has(host)) return res.status(403).json({ error: `Forbidden host: ${host}` })
  next()
})

// Wrap async handlers so thrown errors become clean 500 JSON instead of crashes.
const h = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e)
  res.status(Number(e.status) || 500).json({ error: e.message || String(e), ...(e.qualityReport ? { qualityReport: e.qualityReport } : {}) })
})

// ── Config ──────────────────────────────────────────────────────────────────
app.get('/api/config', h(async (_req, res) => res.json(getConfig())))
// Global settings only: keys + model. Project data goes through /api/projects.
app.put('/api/config', h(async (req, res) => res.json(saveGlobal(req.body || {}))))

// ── Projects (each = a Brain + default post-bridge accounts) ──────────────────
app.post('/api/projects', h(async (req, res) => res.json(createProject(req.body?.name))))
app.put('/api/projects/:id', h(async (req, res) => res.json(updateProject(req.params.id, req.body || {}))))
app.delete('/api/projects/:id', h(async (req, res) => res.json(deleteProject(req.params.id))))
app.post('/api/projects/:id/activate', h(async (req, res) => res.json(setActiveProject(req.params.id))))

// Validate that the saved keys actually work, so Settings can show a green check.
app.post('/api/config/test', h(async (_req, res) => {
  const config = getConfig()
  const { keys } = config
  const result = { postbridge: false, openrouter: false, deepseek: false, apify: false, errors: {} }
  if (keys.postbridge) {
    try { await listAccounts(keys.postbridge); result.postbridge = true }
    catch (e) { result.errors.postbridge = e.message }
  }
  if (keys.openrouter) {
    try { await validateProviderKey({ provider: 'openrouter', apiKey: keys.openrouter, model: config.models?.openrouter || config.model }); result.openrouter = true }
    catch (e) { result.errors.openrouter = e.message }
  }
  if (keys.deepseek) {
    try { await validateProviderKey({ provider: 'deepseek', apiKey: keys.deepseek, model: config.models?.deepseek }); result.deepseek = true }
    catch (e) { result.errors.deepseek = e.message }
  }
  if (keys.apify) {
    try {
      const r = await fetch(`https://api.apify.com/v2/users/me?token=${keys.apify}`)
      if (!r.ok) throw new Error(`invalid key (${r.status})`)
      result.apify = true
    } catch (e) { result.errors.apify = e.message }
  }
  res.json(result)
}))

// Public model catalog for the Settings dropdown.
app.get('/api/models', h(async (_req, res) => res.json(await listModels())))
app.get('/api/models/deepseek', h(async (_req, res) => res.json(await listDeepSeekModels(getConfig().keys.deepseek))))

// Trend mining
app.get('/api/trends', h(async (_req, res) => res.json(listTrends(getActiveProject().id))))

app.post('/api/trends/scrape', h(async (req, res) => {
  const { keys } = getConfig()
  const { queries, count, actor } = req.body || {}
  res.json(await scrapeTrends({ apiKey: keys.apify, projectId: getActiveProject().id, queries, count, actor }))
}))

app.delete('/api/trends/:id', h(async (req, res) =>
  res.json(removeTrend(getActiveProject().id, req.params.id))
))

app.delete('/api/trends', h(async (_req, res) => res.json(clearTrends(getActiveProject().id))))

// ── Queue (generated drafts for the active project, before post-bridge) ───────
app.get('/api/queue', h(async (_req, res) => {
  const project = getActiveProject()
  const queue = getQueue(project.id)
  const checked = queue.map((post, index) => isQualityStale(post, post.qualityReport, { brain: project.brain, hashtagStrategy: project.hashtagStrategy })
    ? withQuality(post, project, { recentHooks: queue.slice(0, index).map((item) => item.hook) })
    : post)
  if (checked.some((post, index) => post !== queue[index])) setQueue(project.id, checked)
  res.json(checked)
}))

app.post('/api/generate', h(async (req, res) => {
  const config = getConfig()
  const provider = config.aiProvider || 'openrouter'
  const model = providerModel(config, provider)
  const apiKey = providerKey(config.keys, provider)
  const project = getActiveProject()
  const count = Math.min(Math.max(Math.round(Number(req.body?.count) || 4), 1), 100)
  if (req.body?.topicMode === 'custom' && !String(req.body?.topic || '').trim()) {
    throw new Error('Enter a topic, or switch Topic mode back to General.')
  }
  const trendIds = Array.isArray(req.body?.trendIds) ? req.body.trendIds : []
  const trends = req.body?.useTrends || trendIds.length ? trendsForPrompt(project.id, trendIds) : []
  const hashtagTrends = project.hashtagStrategy?.trendInfluence === 'off' ? [] : trendsForPrompt(project.id, [])
  const learning = req.body?.useLearning ? getLearningMemory(project.id) : null

  // Validate folder-backed packs before spending time or API credit on content
  // generation. Explicit Library selections never fall back to bundled images.
  const packs = Array.isArray(req.body?.packs) ? req.body.packs : project.imagePacks || []
  const folderIds = Array.isArray(req.body?.folderIds) ? req.body.folderIds : []
  const backgroundPool = resolveBackgroundSelection(packs, folderIds)
  const slideshows = await generateSlideshows({
    provider,
    apiKey,
    model,
    brain: project.brain,
    count,
    options: {
      trends,
      hashtagTrends,
      hashtagStrategy: project.hashtagStrategy,
      learning,
      qualityMode: req.body?.qualityMode || 'off',
      minScore: req.body?.minScore,
      maxRewriteAttempts: req.body?.maxRewriteAttempts,
      contentBucket: req.body?.contentBucket,
      ctaKeyword: req.body?.ctaKeyword,
      topicMode: req.body?.topicMode === 'custom' ? 'custom' : 'general',
      topic: req.body?.topicMode === 'custom' ? String(req.body?.topic || '').trim() : undefined,
      generationNotes: cleanGenerationNotes(req.body?.generationNotes) || undefined,
      hashtagNotes: String(req.body?.hashtagNotes || '').trim().slice(0, 1000) || undefined,
      postFormat: req.body?.postFormat === 'notes' ? 'notes' : 'standard',
    },
  })

  // Auto-assign background images. A per-batch `packs` override (from the
  // Generate modal) wins; otherwise fall back to the project's saved packs.
  // Empty selection → slides keep their gradients.
  if (backgroundPool.length) {
    const packCount = packs.length + folderIds.length
    genLog.step(`assigning backgrounds from ${packCount} pack${packCount === 1 ? '' : 's'} (${backgroundPool.length} images)`)
    assignBackgrounds(slideshows, backgroundPool)
  }

  const checked = slideshows.map((show, index) => withQuality(show, project, {
    recentHooks: slideshows.slice(0, index).map((item) => item.hook),
  }))
  addToQueue(project.id, checked)
  res.json(checked)
}))

app.delete('/api/queue/:id', h(async (req, res) =>
  res.json(removeFromQueue(getActiveProject().id, req.params.id))
))

// Edit a queued slideshow: caption, hashtags, hook, and/or per-slide text+image.
app.put('/api/queue/:id', h(async (req, res) => {
  const pid = getActiveProject().id
  const patch = req.body || {}
  const allowed = ['slides', 'caption', 'hashtags', 'hook', 'notesData', 'format']
  const next = getQueue(pid).map((s) => {
    if (s.id !== req.params.id) return s
    const merged = { ...s }
    for (const k of allowed) if (patch[k] !== undefined) merged[k] = patch[k]
    // Manual edits are cleaned, but do not silently replace the user's choices
    // with project strategy tags. Strategy is reapplied only by generation,
    // rewrite, or an explicit Quality Gate repair.
    if (patch.hashtags !== undefined) merged.hashtags = normalizeHashtags(patch.hashtags, {
      brain: getActiveProject().brain,
      max: 20,
      applyStrategy: false,
      includeBrand: false,
      includeFyp: false,
    })
    if (patch.slides !== undefined) {
      merged.mediaUnavailable = merged.slides.some((slide) => slide.imageUnavailable)
      merged.mediaError = merged.mediaUnavailable
        ? 'A Library background used by this draft is unavailable. Choose another background before publishing.'
        : undefined
    }
    merged.qualityReport = null
    merged.qualityInvalidatedAt = new Date().toISOString()
    return merged
  })
  res.json(setQueue(pid, next))
}))

app.post('/api/queue/:id/rewrite', h(async (req, res) => {
  const config = getConfig()
  const provider = config.aiProvider || 'openrouter'
  const model = providerModel(config, provider)
  const apiKey = providerKey(config.keys, provider)
  const project = getActiveProject()
  const queue = getQueue(project.id)
  const current = queue.find((s) => s.id === req.params.id)
  if (!current) throw new Error('This slideshow is no longer in the queue.')
  const improved = await improveSlideshow({
    provider,
    apiKey,
    model,
    brain: project.brain,
    hashtagStrategy: project.hashtagStrategy,
    slideshow: current,
    note: req.body?.note,
    trends: trendsForPrompt(project.id, current.trendSourcesUsed || []),
    hashtagTrends: project.hashtagStrategy?.trendInfluence === 'off' ? [] : trendsForPrompt(project.id, []),
    learning: getLearningMemory(project.id),
    threshold: req.body?.minScore || 7,
  })
  const checked = withQuality(improved, project, {
    recentHooks: queue.filter((item) => item.id !== current.id).map((item) => item.hook),
  })
  res.json(setQueue(project.id, queue.map((s) => (s.id === req.params.id ? checked : s))))
}))

app.post('/api/queue/:id/quality', h(async (req, res) => {
  const project = getActiveProject()
  const queue = getQueue(project.id)
  const current = queue.find((item) => item.id === req.params.id)
  if (!current) return res.status(404).json({ error: 'This slideshow is no longer in the queue.' })
  const checked = withQuality(current, project, {
    recentHooks: queue.filter((item) => item.id !== current.id).map((item) => item.hook),
  })
  res.json(setQueue(project.id, queue.map((item) => item.id === current.id ? checked : item)))
}))

app.post('/api/queue/:id/quality/fix', h(async (req, res) => {
  const project = getActiveProject()
  const queue = getQueue(project.id)
  const current = queue.find((item) => item.id === req.params.id)
  if (!current) return res.status(404).json({ error: 'This slideshow is no longer in the queue.' })
  const repaired = repairQuality(current, { brain: project.brain, hashtagStrategy: project.hashtagStrategy })
  const checked = withQuality(repaired, project, {
    recentHooks: queue.filter((item) => item.id !== current.id).map((item) => item.hook),
  })
  res.json(setQueue(project.id, queue.map((item) => item.id === current.id ? checked : item)))
}))

// ── Autopilot content plans ────────────────────────────────────────────────
app.get('/api/plans', h(async (_req, res) => {
  const project = getActiveProject()
  res.json(getPlans(project.id).map((stored) => {
    const plan = refreshStalePlanQuality(project, stored)
    return { ...plan, progress: planProgress(plan) }
  }))
}))

app.get('/api/plans/:id', h(async (req, res) => {
  const project = getActiveProject()
  const stored = getPlan(project.id, req.params.id)
  if (!stored) return res.status(404).json({ error: 'Content plan not found.' })
  const plan = refreshStalePlanQuality(project, stored)
  res.json({ ...plan, progress: planProgress(plan) })
}))

app.post('/api/plans/preview', h(async (req, res) => {
  const config = getConfig()
  const project = getActiveProject(config)
  let existingPosts = []
  if (config.keys.postbridge) {
    try { existingPosts = await listPostSchedule(config.keys.postbridge) } catch {}
  }
  const preview = createPlan(req.body || {}, { projectId: project.id, existingPosts })
  res.json({ config: preview.config, slots: preview.slots, progress: planProgress(preview) })
}))

app.post('/api/plans', h(async (req, res) => {
  const config = getConfig()
  const project = getActiveProject(config)
  let existingPosts = []
  if (config.keys.postbridge) {
    try { existingPosts = await listPostSchedule(config.keys.postbridge) } catch {}
  }
  const plan = createPlan(req.body || {}, { projectId: project.id, existingPosts })
  savePlan(project.id, plan)
  res.json({ ...plan, progress: planProgress(plan) })
}))

app.delete('/api/plans/:id', h(async (req, res) => {
  const project = getActiveProject()
  res.json(deletePlan(project.id, req.params.id))
}))

app.put('/api/plans/:planId/slots/:slotId', h(async (req, res) => {
  const config = getConfig()
  const project = getActiveProject(config)
  let plan = getPlan(project.id, req.params.planId)
  if (!plan) return res.status(404).json({ error: 'Content plan not found.' })
  const slot = plan.slots.find((item) => item.id === req.params.slotId)
  if (!slot) return res.status(404).json({ error: 'Planned slot not found.' })
  if (['scheduling', 'scheduled'].includes(slot.status)) return res.status(409).json({ error: 'This slot can no longer be edited.' })
  const patch = req.body || {}
  if (patch.localDate || patch.localTime) {
    let existingPosts = []
    if (config.keys.postbridge) {
      try { existingPosts = await listPostSchedule(config.keys.postbridge) } catch {}
    }
    plan = movePlanSlot(plan, slot.id, {
      localDate: String(patch.localDate || slot.localDate),
      localTime: String(patch.localTime || slot.localTime),
    }, existingPosts)
  }
  const metadataPatch = {}
  for (const key of ['topic', 'pillar', 'format', 'backgroundSelection']) {
    if (patch[key] !== undefined) metadataPatch[key] = patch[key]
  }
  if (patch.socialAccountIds !== undefined) metadataPatch.socialAccountIds = [...new Set((patch.socialAccountIds || []).map(Number).filter(Number.isFinite))]
  if (patch.removed === true) Object.assign(metadataPatch, { status: 'removed', approvedAt: null })
  const generationInputsChanged = Object.keys(metadataPatch).some((key) => ['topic', 'pillar', 'format', 'backgroundSelection'].includes(key))
  if (generationInputsChanged) Object.assign(metadataPatch, { post: null, qualityReport: null, approvedAt: null, status: 'planned', error: null })
  else if (metadataPatch.socialAccountIds && slot.post) Object.assign(metadataPatch, { qualityReport: null, approvedAt: null, status: 'needs_attention', error: null })
  if (patch.postPatch && slot.post) {
    Object.assign(metadataPatch, {
      post: { ...slot.post, ...patch.postPatch, qualityReport: null },
      qualityReport: null,
      approvedAt: null,
      status: 'needs_attention',
    })
  }
  if (Object.keys(metadataPatch).length) plan = updatePlanSlot(project.id, plan, slot.id, metadataPatch)
  else savePlan(project.id, plan)
  res.json({ ...plan, progress: planProgress(plan) })
}))

app.post('/api/plans/:planId/slots/:slotId/generate', h(async (req, res) => {
  const config = getConfig()
  const project = getActiveProject(config)
  let plan = getPlan(project.id, req.params.planId)
  if (!plan) return res.status(404).json({ error: 'Content plan not found.' })
  const slot = plan.slots.find((item) => item.id === req.params.slotId)
  if (!slot || slot.status === 'removed') return res.status(404).json({ error: 'Planned slot not found.' })
  if (['generating', 'quality_check', 'scheduling', 'scheduled'].includes(slot.status)) return res.status(409).json({ error: 'This slot is already busy or scheduled.' })

  plan = updatePlanSlot(project.id, plan, slot.id, { status: 'generating', error: null, approvedAt: null })
  try {
    const provider = config.aiProvider || 'openrouter'
    const model = providerModel(config, provider)
    const apiKey = providerKey(config.keys, provider)
    const accounts = config.keys.postbridge ? await listAccounts(config.keys.postbridge).catch(() => []) : []
    const selected = new Set(slot.socialAccountIds.map(Number))
    const platformNames = accounts.filter((account) => selected.has(Number(account.id))).map((account) => account.platform)
    const trends = plan.config.topicMode === 'general' && plan.config.useTrends ? trendsForPrompt(project.id, []) : []
    const plannerNotes = [
      plan.config.generationNotes,
      `Campaign goal: ${plan.config.goal}. Content pillar: ${slot.pillar}.`,
      plan.config.productEmphasis ? `Required product or offer emphasis: ${plan.config.productEmphasis}.` : '',
      platformNames.length ? `Target platforms: ${platformNames.join(', ')}. Respect their requirements.` : '',
    ].filter(Boolean).join('\n')
    const generated = await generateSlideshows({
      provider, apiKey, model, brain: project.brain, count: 1,
      options: {
        trends,
        hashtagTrends: project.hashtagStrategy?.trendInfluence === 'off' ? [] : trendsForPrompt(project.id, []),
        hashtagStrategy: project.hashtagStrategy,
        learning: getLearningMemory(project.id),
        qualityMode: 'off',
        topicMode: 'custom',
        topic: slot.topic,
        contentBucket: slot.pillar,
        generationNotes: plannerNotes,
        postFormat: slot.format === 'notes' ? 'notes' : 'standard',
        generationMode: 'planner',
      },
    })
    let post = generated[0]
    if (!post) throw new Error('The AI provider returned no post.')
    if (slot.format === 'image') post = { ...post, slides: post.slides.slice(0, 1) }
    post = {
      ...post,
      id: `planner-${slot.id}`,
      topic: slot.topic,
      topicMode: plan.config.topicMode,
      contentBucket: slot.pillar,
      generationNotes: plan.config.generationNotes,
      productEmphasis: plan.config.productEmphasis || undefined,
      productRequirement: plan.config.productEmphasis
        ? { required: true, value: plan.config.productEmphasis }
        : undefined,
      promotional: slot.promotional === true || plan.config.promotional === true,
      plannerFormat: slot.format,
      plannerSlotId: slot.id,
    }
    if (slot.format !== 'video') {
      const selections = slot.backgroundSelection ? [slot.backgroundSelection] : plan.config.backgroundSelections
      if (selections.length) assignBackgrounds([post], resolveBackgroundSelection(selections))
    }
    plan = updatePlanSlot(project.id, plan, slot.id, { status: 'quality_check', post })
    const currentPlan = plan
    const recentHooks = currentPlan.slots.filter((item) => item.id !== slot.id && item.post?.hook).map((item) => item.post.hook)
    const qualityReport = runQualityGate(post, { brain: project.brain, hashtagStrategy: project.hashtagStrategy, recentHooks })
    const status = plannerStatusForQualityReport(qualityReport)
    plan = updatePlanSlot(project.id, plan, slot.id, { post: { ...post, qualityReport }, qualityReport, status, error: null })
  } catch (error) {
    plan = updatePlanSlot(project.id, plan, slot.id, { status: 'failed', error: error.message || String(error) })
  }
  res.json({ ...plan, progress: planProgress(plan) })
}))

app.post('/api/plans/:planId/slots/:slotId/quality/fix', h(async (req, res) => {
  const project = getActiveProject()
  let plan = getPlan(project.id, req.params.planId)
  if (!plan) return res.status(404).json({ error: 'Content plan not found.' })
  const slot = plan.slots.find((item) => item.id === req.params.slotId)
  if (!slot?.post) return res.status(409).json({ error: 'Generate this slot before repairing it.' })
  const repaired = repairQuality(slot.post, { brain: project.brain, hashtagStrategy: project.hashtagStrategy })
  const qualityReport = runQualityGate(repaired, {
    brain: project.brain,
    hashtagStrategy: project.hashtagStrategy,
    recentHooks: plan.slots.filter((item) => item.id !== slot.id && item.post?.hook).map((item) => item.post.hook),
  })
  plan = updatePlanSlot(project.id, plan, slot.id, {
    post: { ...repaired, qualityReport }, qualityReport,
    status: plannerStatusForQualityReport(qualityReport),
    approvedAt: null,
  })
  res.json({ ...plan, progress: planProgress(plan) })
}))

app.post('/api/plans/:planId/slots/:slotId/quality', h(async (req, res) => {
  const project = getActiveProject()
  let plan = getPlan(project.id, req.params.planId)
  if (!plan) return res.status(404).json({ error: 'Content plan not found.' })
  const slot = plan.slots.find((item) => item.id === req.params.slotId)
  if (!slot?.post) return res.status(409).json({ error: 'Generate this slot before checking it.' })
  const qualityReport = runQualityGate(slot.post, {
    brain: project.brain,
    hashtagStrategy: project.hashtagStrategy,
    recentHooks: plan.slots.filter((item) => item.id !== slot.id && item.post?.hook).map((item) => item.post.hook),
  })
  plan = updatePlanSlot(project.id, plan, slot.id, {
    post: { ...slot.post, qualityReport }, qualityReport,
    status: plannerStatusForQualityReport(qualityReport),
    approvedAt: null,
    error: null,
  })
  res.json({ ...plan, progress: planProgress(plan) })
}))

app.post('/api/plans/:planId/slots/:slotId/approve', h(async (req, res) => {
  const project = getActiveProject()
  let plan = getPlan(project.id, req.params.planId)
  if (!plan) return res.status(404).json({ error: 'Content plan not found.' })
  const slot = plan.slots.find((item) => item.id === req.params.slotId)
  if (!slot?.post) return res.status(409).json({ error: 'Generate this slot before approving it.' })
  const qualityReport = isQualityStale(slot.post, slot.qualityReport, { brain: project.brain, hashtagStrategy: project.hashtagStrategy })
    ? runQualityGate(slot.post, { brain: project.brain, hashtagStrategy: project.hashtagStrategy, recentHooks: plan.slots.filter((item) => item.id !== slot.id && item.post?.hook).map((item) => item.post.hook) })
    : slot.qualityReport
  if (qualityReport.status === 'blocked') return res.status(409).json({ error: 'Blocking Quality Gate findings must be resolved before approval.', qualityReport })
  if (qualityReport.status === 'warnings' && !req.body?.warningsAcknowledged) return res.status(409).json({ error: 'Acknowledge the Quality Gate warnings before approval.', qualityReport })
  plan = updatePlanSlot(project.id, plan, slot.id, {
    qualityReport,
    post: { ...slot.post, qualityReport },
    status: 'approved',
    approvedAt: new Date().toISOString(),
    warningsAcknowledgedAt: qualityReport.status === 'warnings' ? new Date().toISOString() : null,
  })
  res.json({ ...plan, progress: planProgress(plan) })
}))

app.post('/api/plans/:planId/approve-ready', h(async (req, res) => {
  const project = getActiveProject()
  let plan = getPlan(project.id, req.params.planId)
  if (!plan) return res.status(404).json({ error: 'Content plan not found.' })
  const now = new Date().toISOString()
  const warningsAcknowledged = req.body?.warningsAcknowledged === true
  plan = {
    ...plan,
    slots: plan.slots.map((slot) => slot.status === 'ready_for_review'
      && (slot.qualityReport?.status === 'passed' || (warningsAcknowledged && slot.qualityReport?.status === 'warnings'))
      ? {
          ...slot,
          status: 'approved',
          approvedAt: now,
          warningsAcknowledgedAt: slot.qualityReport?.status === 'warnings' ? now : null,
          updatedAt: now,
        }
      : slot),
    updatedAt: now,
  }
  savePlan(project.id, plan)
  res.json({ ...plan, progress: planProgress(plan) })
}))

app.post('/api/plans/:planId/confirm-automatic', h(async (req, res) => {
  const project = getActiveProject()
  const plan = getPlan(project.id, req.params.planId)
  if (!plan) return res.status(404).json({ error: 'Content plan not found.' })
  if (plan.config.approvalMode !== 'automatic') return res.status(409).json({ error: 'This plan uses manual approval.' })
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'Explicit automatic scheduling confirmation is required.' })
  const next = { ...plan, automaticSchedulingConfirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  savePlan(project.id, next)
  res.json({ ...next, progress: planProgress(next) })
}))

app.post('/api/plans/:planId/slots/:slotId/schedule', h(async (req, res) => {
  const config = getConfig()
  const project = getActiveProject(config)
  let plan = getPlan(project.id, req.params.planId)
  if (!plan) return res.status(404).json({ error: 'Content plan not found.' })
  const slot = plan.slots.find((item) => item.id === req.params.slotId)
  if (!slot?.post) return res.status(409).json({ error: 'Generate this slot before scheduling it.' })
  const retryableUploadFailure = slot.status === 'failed' && slot.approvedAt && !slot.scheduleAttemptedAt && !slot.scheduleUncertain
  if (slot.status !== 'approved' && !retryableUploadFailure) return res.status(409).json({ error: 'Approve this post before scheduling it.' })
  if (slot.postbridgeId) return res.status(409).json({ error: 'This planned post is already scheduled.' })
  if (slot.scheduleUncertain || slot.scheduleAttemptedAt) {
    return res.status(409).json({ error: 'A previous scheduling attempt may have reached Postbridge. Verify it there before retrying.' })
  }
  if (slot.conflicts?.length) return res.status(409).json({ error: 'Resolve this slot’s scheduling conflict first.' })
  if (plan.config.approvalMode === 'automatic' && !plan.automaticSchedulingConfirmedAt) {
    return res.status(409).json({ error: 'Confirm automatic scheduling before starting.' })
  }
  if (slot.format !== 'video') assertPostAssetsAvailable(slot.post)

  const postType = slot.format === 'video' ? 'video' : slot.format === 'image' ? 'image' : 'carousel'
  const warningsAcknowledged = slot.qualityReport?.status !== 'warnings' || !!slot.warningsAcknowledgedAt
  const caption = [
    String(slot.post.caption || '').trim(),
    (slot.post.hashtags || []).map((tag) => `#${String(tag).replace(/^#+/, '')}`).join(' '),
  ].filter(Boolean).join('\n\n')
  let renderedMedia = Array.isArray(req.body?.slides) ? req.body.slides : []
  if (postType === 'image') renderedMedia = renderedMedia.slice(0, 1)
  const videoId = String(req.body?.videoId || plan.config.videoId || '')
  const videoFile = postType === 'video' ? getVideoFile(videoId) : null
  const videoAsset = postType === 'video' ? listVideos().find((item) => item.id === videoId) : null
  plan = updatePlanSlot(project.id, plan, slot.id, { status: 'scheduling', error: null })
  let context
  let qualityReport
  try {
    context = await publishContext({
      keys: config.keys,
      project,
      post: slot.post,
      socialAccounts: slot.socialAccountIds,
      scheduledAt: slot.scheduledAt,
      mode: 'schedule',
      timezone: slot.timezone || plan.config.timezone,
      postType,
      renderedMedia,
      videoId,
      video: postType === 'video' ? { exists: !!videoFile, duration: videoAsset?.duration || Number(req.body?.duration) || null } : undefined,
      fullCaption: caption,
    })
    qualityReport = runQualityGate(slot.post, context)
    assertPublishable(qualityReport, { warningsAcknowledged })
    plan = updatePlanSlot(project.id, plan, slot.id, { qualityReport })
  } catch (error) {
    plan = updatePlanSlot(project.id, plan, slot.id, { status: 'approved', qualityReport: qualityReport || slot.qualityReport, error: error.message || String(error) })
    throw error
  }

  let upload
  try {
    if (postType === 'video') {
      const rendered = await renderVideoPost({
        slideshow: slot.post,
        videoFile,
        duration: Number(req.body?.duration) || 12,
        textPosition: req.body?.textPosition === 'top' ? 'top' : 'center',
      watermark: req.body?.watermark !== false,
      watermarkText: project.brain?.appName || project.name || 'Your Brand',
      })
      qualityReport = runQualityGate(slot.post, {
        ...context,
        video: { exists: true, duration: rendered.duration, sizeBytes: rendered.buffer.length },
      })
      assertPublishable(qualityReport, { warningsAcknowledged })
      const mediaId = await uploadMedia(config.keys.postbridge, {
        buffer: rendered.buffer,
        mimeType: 'video/mp4',
        name: `${slot.id}-video.mp4`,
      })
      upload = [mediaId]
    } else {
      upload = await Promise.all(renderedMedia.map(async (slide, index) => uploadMedia(config.keys.postbridge, {
        buffer: Buffer.from(String(slide).replace(/^data:image\/\w+;base64,/, ''), 'base64'),
        mimeType: 'image/png',
        name: `${slot.id}-${index + 1}.png`,
      })))
    }
  } catch (error) {
    plan = updatePlanSlot(project.id, plan, slot.id, { status: 'approved', error: error.message || String(error), scheduleAttemptedAt: null, scheduleUncertain: false })
    return res.status(502).json({ error: error.message || String(error), plan: { ...plan, progress: planProgress(plan) } })
  }

  const fingerprint = scheduleFingerprint(plan.id, { ...slot, qualityReport })
  plan = updatePlanSlot(project.id, plan, slot.id, {
    status: 'scheduling',
    qualityReport,
    scheduleFingerprint: fingerprint,
    scheduleAttemptedAt: new Date().toISOString(),
  })
  let remote
  try {
    remote = await createPost(config.keys.postbridge, {
      caption,
      mediaIds: upload,
      socialAccounts: slot.socialAccountIds,
      scheduledAt: slot.scheduledAt,
      isDraft: false,
    })
  } catch (error) {
    plan = updatePlanSlot(project.id, plan, slot.id, {
      status: 'failed',
      error: `${error.message || String(error)} Check Postbridge before retrying.`,
      scheduleUncertain: true,
    })
    return res.status(502).json({ error: 'The Postbridge create response was uncertain. Check Postbridge before retrying.', plan: { ...plan, progress: planProgress(plan) } })
  }
  const remoteId = remote?.id || remote?.data?.id
  if (!remoteId) {
    plan = updatePlanSlot(project.id, plan, slot.id, {
      status: 'failed',
      error: 'Postbridge accepted the request but did not return a post ID. Verify the schedule before retrying.',
      scheduleUncertain: true,
    })
    return res.status(502).json({ error: 'Postbridge returned no post ID. Check Postbridge before retrying.', plan: { ...plan, progress: planProgress(plan) } })
  }
  plan = updatePlanSlot(project.id, plan, slot.id, {
    status: 'scheduled',
    postbridgeId: String(remoteId),
    scheduledAt: slot.scheduledAt,
    scheduleUncertain: false,
    error: null,
  })
  res.json({ ...plan, progress: planProgress(plan) })
}))

// ── Image library (local imports + optional Apify scrapes) ───────────────────────
app.get('/api/library', h(async (_req, res) => res.json(listLibrary())))
app.get('/api/library/packs', h(async (_req, res) => res.json(listPacks())))
app.get('/api/library/folders', h(async (_req, res) => res.json(listFolders())))
app.post('/api/library/folders', h(async (req, res) => res.json(createFolder(req.body || {}))))
app.put('/api/library/folders/:id', h(async (req, res) => res.json(renameFolder(req.params.id, req.body || {}))))
app.delete('/api/library/folders/:id', h(async (req, res) => {
  moveImagesFromFolder(req.params.id, UNCATEGORIZED_FOLDER_ID)
  moveVideosFromFolder(req.params.id, UNCATEGORIZED_FOLDER_ID)
  const remainingFolders = deleteFolder(req.params.id)
  removeImagePackFromProjects(req.params.id)
  res.json(remainingFolders)
}))

app.post('/api/library/scrape', h(async (req, res) => {
  const { keys, pinterestActor } = getConfig()
  const { searches, count, folderId } = req.body || {}
  res.json(await scrapePinterest({ apiKey: keys.apify, actor: pinterestActor, searches, count, folderId }))
}))

app.post('/api/library/import', h(async (req, res) => res.json(importImages(req.body || {}))))

app.delete('/api/library/:id', h(async (req, res) => {
  const asset = getLibraryAsset(req.params.id)
  const images = removeScraped(req.params.id)
  const replacement = images.find((item) => item.source !== 'bundled' && item.folderId === asset.folderId) || null
  invalidateLibraryAssetReferences({ ...asset, type: 'image' }, replacement)
  res.json(images)
}))

app.put('/api/library/assets/:id/folder', h(async (req, res) => {
  const type = req.body?.type === 'video' ? 'video' : 'image'
  const folderId = req.body?.folderId
  res.json(type === 'video' ? moveVideoToFolder(req.params.id, folderId) : moveImageToFolder(req.params.id, folderId))
}))

app.get('/api/library/img/:id', h(async (req, res) => {
  const file = getScrapedFile(req.params.id)
  if (!file) return res.status(404).end()
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.set('Pragma', 'no-cache')
  // dotfiles:'allow' is required because the path may live under a dotfolder
  // when users opt into a custom data directory, and
  // sendFile blocks dot-segment paths by default (would 404 every scrape).
  res.sendFile(file, { dotfiles: 'allow' })
}))

// Video library (local background assets for single-MP4 posts)
app.get('/api/videos', h(async (_req, res) => res.json(listVideos())))

app.post('/api/videos/import', h(async (req, res) => {
  const { url, pack, folderId } = req.body || {}
  res.json(await importVideoUrl({ url, pack, folderId }))
}))

app.post('/api/videos/scrape', h(async (req, res) => {
  const { keys } = getConfig()
  const { source, count, actor, folderId } = req.body || {}
  res.json(await scrapeVideos({ apiKey: keys.apify, actor, source, count, folderId }))
}))

app.delete('/api/videos/:id', h(async (req, res) => {
  const asset = getVideoAsset(req.params.id)
  const videos = removeVideo(req.params.id)
  const replacement = videos.find((item) => item.folderId === asset.folderId) || null
  invalidateLibraryAssetReferences({ ...asset, type: 'video' }, replacement)
  res.json(videos)
}))

app.get('/api/videos/:id', h(async (req, res) => {
  const file = getVideoFile(req.params.id)
  if (!file) return res.status(404).end()
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.set('Pragma', 'no-cache')
  res.sendFile(file, { dotfiles: 'allow', acceptRanges: true })
}))

// ── post-bridge ───────────────────────────────────────────────────────────────
app.get('/api/accounts', h(async (_req, res) => {
  const { keys } = getConfig()
  res.json(await listAccounts(keys.postbridge))
}))

app.get('/api/posts', h(async (_req, res) => {
  const started = performance.now()
  const config = getConfig()
  const project = getActiveProject(config)
  const force = _req.query.refresh === '1'
  const posts = await listPosts(config.keys.postbridge, { scope: project.id, force })
  reconcileDismissedPublishedPosts(project.id, posts.map((post) => post.id))
  if (API_DEBUG) console.info('[api:schedule]', { posts: posts.length, force, routeMs: Math.round(performance.now() - started) })
  res.json(posts)
}))

app.get('/api/schedule-dismissals', h(async (_req, res) => {
  const project = getActiveProject()
  res.json(getDismissedPublishedPostIds(project.id))
}))

app.post('/api/schedule-dismissals/:id', h(async (req, res) => {
  const project = getActiveProject()
  const id = String(req.params.id || '').trim()
  if (!id || id.length > 200) return res.status(400).json({ error: 'Invalid post ID.' })
  res.json(dismissPublishedPost(project.id, id))
}))

app.delete('/api/schedule-dismissals/:id', h(async (req, res) => {
  const project = getActiveProject()
  const id = String(req.params.id || '').trim()
  if (!id || id.length > 200) return res.status(400).json({ error: 'Invalid post ID.' })
  res.json(restorePublishedPost(project.id, id))
}))

app.get('/api/posts/:id/media', h(async (req, res) => {
  const { keys } = getConfig()
  const id = String(req.params.id || '').trim()
  if (!id || id.length > 200) return res.status(400).json({ error: 'Invalid post ID.' })
  res.json(await getPostMedia(keys.postbridge, id))
}))

app.patch('/api/posts/:id/schedule', h(async (req, res) => {
  const started = performance.now()
  const { keys } = getConfig()
  const id = String(req.params.id || '').trim()
  const scheduledAt = String(req.body?.scheduledAt || '').trim()
  const when = new Date(scheduledAt)
  if (!id || id.length > 200) return res.status(400).json({ error: 'Invalid post ID.' })
  if (!scheduledAt || Number.isNaN(when.getTime())) {
    return res.status(400).json({ error: 'Choose a valid date and time.' })
  }
  if (when.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future.' })
  }

  // Postbridge remains the source of truth for editability. This is one narrow
  // post lookup, never a full Schedule refresh.
  const current = await getPost(keys.postbridge, id)
  if (String(current?.status || '').toLowerCase() !== 'scheduled' || current?.is_draft) {
    return res.status(409).json({ error: 'Only scheduled posts can be rescheduled.' })
  }
  await updatePostSchedule(keys.postbridge, id, when.toISOString())
  if (API_DEBUG) console.info('[api:reschedule]', { postId: id, postbridgeRequests: 2, routeMs: Math.round(performance.now() - started) })
  res.json({ postId: id, scheduledAt: when.toISOString(), status: 'scheduled' })
}))

app.delete('/api/posts/:id', h(async (req, res) => {
  const started = performance.now()
  const { keys } = getConfig()
  const id = String(req.params.id || '').trim()
  if (!id || id.length > 200) return res.status(400).json({ error: 'Invalid post ID.' })

  let current
  try {
    // The point lookup protects published posts from the destructive endpoint;
    // it does not load the full schedule or resolve any media.
    current = await getPost(keys.postbridge, id)
  } catch (error) {
    if (error?.status === 404) {
      markPostRemoved(keys.postbridge, id)
      if (API_DEBUG) console.info('[api:delete]', { postId: id, postbridgeRequests: 1, alreadyRemoved: true, routeMs: Math.round(performance.now() - started) })
      return res.json({ deleted: true, postId: id, status: 'already_removed' })
    }
    throw error
  }
  const status = String(current?.status || '').toLowerCase()
  if (status !== 'scheduled' && !current?.is_draft) {
    return res.status(409).json({ error: 'Only scheduled posts or drafts can be removed.' })
  }
  try {
    await deletePost(keys.postbridge, id)
  } catch (error) {
    if (error?.status !== 404) throw error
    markPostRemoved(keys.postbridge, id)
  }
  if (API_DEBUG) console.info('[api:delete]', { postId: id, postbridgeRequests: 2, routeMs: Math.round(performance.now() - started) })
  res.json({ deleted: true, postId: id, status: current?.is_draft ? 'draft' : status })
}))

app.get('/api/results', h(async (_req, res) => {
  const { keys } = getConfig()
  res.json(await listAnalytics(keys.postbridge))
}))

// Pull fresh metrics from the platforms, then hand back the updated analytics.
// post-bridge rate-limits sync (429) — swallow that so the refresh still returns
// whatever's already there.
app.post('/api/results/sync', h(async (_req, res) => {
  const { keys } = getConfig()
  try { await syncAnalytics(keys.postbridge) } catch (e) { console.warn('[results] sync skipped:', e.message) }
  res.json(await listAnalytics(keys.postbridge))
}))

app.get('/api/learning', h(async (_req, res) => res.json(getLearningMemory(getActiveProject().id))))

app.post('/api/learning/rebuild', h(async (_req, res) => {
  const config = getConfig()
  const provider = config.aiProvider || 'openrouter'
  const model = providerModel(config, provider)
  const apiKey = providerKey(config.keys, provider)
  const project = getActiveProject()
  const analytics = await listAnalytics(config.keys.postbridge)
  res.json(await rebuildLearningMemory({ provider, apiKey, model, project, analytics }))
}))

app.delete('/api/learning', h(async (_req, res) => res.json(clearLearningMemory(getActiveProject().id))))

// Schedule a slideshow: upload each rendered slide image to post-bridge, then
// create the post. `slides` are data URLs (PNG) rendered in the browser.
app.post('/api/schedule', h(async (req, res) => {
  const { keys } = getConfig()
  const { id, caption, slides, socialAccounts, scheduledAt, mode, timezone, warningsAcknowledged } = req.body || {}
  if (!socialAccounts?.length) throw new Error('Pick at least one social account.')
  if (!slides?.length) throw new Error('No slide images to upload.')

  const project = getActiveProject()
  const slideshow = getQueue(project.id).find((item) => item.id === id)
  if (!slideshow) throw new Error('This slideshow is no longer in the queue.')
  if (['preflight', 'uploading', 'creating', 'uncertain'].includes(slideshow.schedulingState)) {
    throw new Error(slideshow.schedulingState === 'uncertain'
      ? 'A previous scheduling response was uncertain. Check Postbridge before retrying to avoid a duplicate.'
      : 'This post is already being scheduled.')
  }
  assertPostAssetsAvailable(slideshow)
  updateQueueItem(project.id, id, { schedulingState: 'preflight', schedulingStartedAt: new Date().toISOString() })
  let qualityReport
  try {
    const context = await publishContext({
      keys, project, post: slideshow, socialAccounts, scheduledAt, mode, timezone,
      postType: slides.length > 1 ? 'carousel' : 'image', renderedMedia: slides, fullCaption: caption,
    })
    qualityReport = runQualityGate(slideshow, context)
    assertPublishable(qualityReport, { warningsAcknowledged: !!warningsAcknowledged })
  } catch (error) {
    updateQueueItem(project.id, id, { qualityReport: qualityReport || slideshow.qualityReport, schedulingState: null, schedulingStartedAt: null, scheduleError: error.message })
    throw error
  }
  updateQueueItem(project.id, id, { qualityReport, schedulingState: 'uploading', schedulingStartedAt: new Date().toISOString() })

  const when = mode === 'schedule' ? (scheduledAt ? `scheduled for ${scheduledAt}` : 'scheduled') : 'draft'
  schedLog.start(`Posting ${id || 'slideshow'} → ${when} · ${socialAccounts.length} account${socialAccounts.length === 1 ? '' : 's'}`)

  // Upload all slides concurrently — post-bridge handles them independently, so
  // there's no reason to wait for each. Results stay in slide order (the index
  // into the array) so the carousel keeps its sequence.
  let done = 0
  let mediaIds
  try {
    mediaIds = await Promise.all(
      slides.map(async (slide, i) => {
        const buffer = Buffer.from(String(slide).replace(/^data:image\/\w+;base64,/, ''), 'base64')
        const mediaId = await uploadMedia(keys.postbridge, {
          buffer,
          mimeType: 'image/png',
          name: `${id || 'slide'}-${i + 1}.png`,
        })
        schedLog.progress(++done, slides.length, 'slides uploaded')
        return mediaId
      })
    )
  } catch (error) {
    updateQueueItem(project.id, id, { schedulingState: null, schedulingStartedAt: null, scheduleError: error.message })
    throw error
  }

  schedLog.step(`creating post on post-bridge…`)
  updateQueueItem(project.id, id, { schedulingState: 'creating', scheduleAttemptedAt: new Date().toISOString() })
  let post
  try {
    post = await createPost(keys.postbridge, {
      caption,
      mediaIds,
      socialAccounts,
      scheduledAt: mode === 'schedule' ? scheduledAt : null,
      isDraft: mode !== 'schedule',
    })
  } catch (error) {
    updateQueueItem(project.id, id, { schedulingState: 'uncertain', scheduleError: error.message })
    throw new Error(`${error.message} The create response was uncertain; check Postbridge before retrying.`)
  }

  if (!(post?.id || post?.data?.id)) {
    updateQueueItem(project.id, id, { schedulingState: 'uncertain', scheduleError: 'Postbridge returned no post ID.' })
    throw new Error('Postbridge returned no post ID. Check Postbridge before retrying to avoid a duplicate.')
  }
  if (!(post?.id || post?.data?.id)) {
    updateQueueItem(project.id, id, { schedulingState: 'uncertain', scheduleError: 'Postbridge returned no post ID.' })
    throw new Error('Postbridge returned no post ID. Check Postbridge before retrying to avoid a duplicate.')
  }
  if (id) removeFromQueue(project.id, id)
  schedLog.ok(`Done — ${mode === 'schedule' ? 'scheduled' : 'saved as draft'}`)
  res.json(post)
}))

// Schedule a queued slideshow as a single rendered MP4: background video +
// timed text overlays, then upload through the same post-bridge flow.
app.post('/api/schedule/video', h(async (req, res) => {
  const { keys } = getConfig()
  const { id, caption, socialAccounts, scheduledAt, mode, videoId, duration, textPosition, watermark, timezone, warningsAcknowledged } = req.body || {}
  if (!keys.postbridge) throw new Error('Missing post-bridge API key. Add it in Settings.')
  if (!socialAccounts?.length) throw new Error('Pick at least one social account.')
  if (!videoId) throw new Error('Select a background video from the Video Library.')

  const project = getActiveProject()
  const slideshow = getQueue(project.id).find((s) => s.id === id)
  if (!slideshow) throw new Error('This slideshow is no longer in the queue.')
  if (['preflight', 'rendering', 'uploading', 'creating', 'uncertain'].includes(slideshow.schedulingState)) {
    throw new Error(slideshow.schedulingState === 'uncertain'
      ? 'A previous scheduling response was uncertain. Check Postbridge before retrying to avoid a duplicate.'
      : 'This post is already being scheduled.')
  }
  const videoFile = getVideoFile(videoId)
  if (!videoFile) throw new Error('Selected background video could not be found.')
  const videoAsset = listVideos().find((item) => item.id === videoId)
  updateQueueItem(project.id, id, { schedulingState: 'preflight', schedulingStartedAt: new Date().toISOString() })
  let context
  let qualityReport
  try {
    context = await publishContext({
      keys, project, post: slideshow, socialAccounts, scheduledAt, mode, timezone,
      postType: 'video', videoId, fullCaption: caption,
      video: { exists: true, duration: Number(duration) || videoAsset?.duration || null },
    })
    qualityReport = runQualityGate(slideshow, context)
    assertPublishable(qualityReport, { warningsAcknowledged: !!warningsAcknowledged })
  } catch (error) {
    updateQueueItem(project.id, id, { qualityReport: qualityReport || slideshow.qualityReport, schedulingState: null, schedulingStartedAt: null, scheduleError: error.message })
    throw error
  }
  updateQueueItem(project.id, id, { qualityReport, schedulingState: 'rendering', schedulingStartedAt: new Date().toISOString() })

  const when = mode === 'schedule' ? (scheduledAt ? `scheduled for ${scheduledAt}` : 'scheduled') : 'draft'
  schedLog.start(`Rendering video ${id || 'slideshow'} -> ${when} · ${socialAccounts.length} account${socialAccounts.length === 1 ? '' : 's'}`)

  let rendered
  try {
    rendered = await renderVideoPost({ slideshow, videoFile, duration, textPosition, watermark })
  } catch (error) {
    updateQueueItem(project.id, id, { schedulingState: null, schedulingStartedAt: null, scheduleError: error.message })
    throw error
  }
  qualityReport = runQualityGate(slideshow, {
    ...context,
    video: { exists: true, duration: rendered.duration, sizeBytes: rendered.buffer.length },
  })
  assertPublishable(qualityReport, { warningsAcknowledged: !!warningsAcknowledged })
  updateQueueItem(project.id, id, { qualityReport, schedulingState: 'uploading' })
  schedLog.step(`uploading rendered MP4 (${rendered.duration}s) to post-bridge...`)
  let mediaId
  try {
    mediaId = await uploadMedia(keys.postbridge, {
      buffer: rendered.buffer,
      mimeType: 'video/mp4',
      name: `${id || 'slideshow'}-video.mp4`,
    })
  } catch (error) {
    updateQueueItem(project.id, id, { schedulingState: null, schedulingStartedAt: null, scheduleError: error.message })
    throw error
  }

  schedLog.step('creating video post on post-bridge...')
  updateQueueItem(project.id, id, { schedulingState: 'creating', scheduleAttemptedAt: new Date().toISOString() })
  let post
  try {
    post = await createPost(keys.postbridge, {
      caption,
      mediaIds: [mediaId],
      socialAccounts,
      scheduledAt: mode === 'schedule' ? scheduledAt : null,
      isDraft: mode !== 'schedule',
    })
  } catch (error) {
    updateQueueItem(project.id, id, { schedulingState: 'uncertain', scheduleError: error.message })
    throw new Error(`${error.message} The create response was uncertain; check Postbridge before retrying.`)
  }

  if (id) removeFromQueue(project.id, id)
  schedLog.ok(`Done - video ${mode === 'schedule' ? 'scheduled' : 'saved as draft'}`)
  res.json(post)
}))

// ── Static (production / `npm start`) ─────────────────────────────────────────
const dist = join(__dirname, '..', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  // SPA fallback: any non-API GET serves index.html. (Express 5 dropped the
  // bare '*' route string, so use a middleware instead of app.get('*').)
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(join(dist, 'index.html'))
  })
}

if (!process.env.VERCEL) {
app.listen(PORT, HOST, () => {
  console.log(`\n  Postfarm server → http://localhost:${PORT} (bound to ${HOST})`)
  console.log(`  Config + queue stored in ${CONFIG_DIR}\n`)
})
}

function withQuality(post, project, context = {}) {
  return { ...post, qualityReport: runQualityGate(post, { brain: project.brain, hashtagStrategy: project.hashtagStrategy, ...context }) }
}

function updateQueueItem(projectId, id, patch) {
  const next = getQueue(projectId).map((item) => item.id === id ? { ...item, ...patch } : item)
  setQueue(projectId, next)
  return next.find((item) => item.id === id) || null
}

function refreshStalePlanQuality(project, plan) {
  let changed = false
  const slots = plan.slots.map((slot) => {
    if (!slot.post || slot.status === 'removed' || !isQualityStale(slot.post, slot.qualityReport, { brain: project.brain, hashtagStrategy: project.hashtagStrategy })) return slot
    const qualityReport = runQualityGate(slot.post, {
      brain: project.brain,
      hashtagStrategy: project.hashtagStrategy,
      recentHooks: plan.slots.filter((item) => item.id !== slot.id && item.post?.hook).map((item) => item.post.hook),
    })
    let status = slot.status
    let approvedAt = slot.approvedAt
    let warningsAcknowledgedAt = slot.warningsAcknowledgedAt
    if (['planned', 'quality_check', 'needs_attention', 'ready_for_review'].includes(status)) {
      status = plannerStatusForQualityReport(qualityReport)
      approvedAt = null
      warningsAcknowledgedAt = null
    } else if (status === 'approved' && qualityReport.status === 'blocked') {
      status = 'needs_attention'
      approvedAt = null
      warningsAcknowledgedAt = null
    } else if (status === 'approved' && qualityReport.status === 'warnings' && !warningsAcknowledgedAt) {
      status = 'ready_for_review'
      approvedAt = null
    }
    changed = true
    return {
      ...slot,
      status,
      approvedAt,
      warningsAcknowledgedAt,
      qualityReport,
      post: { ...slot.post, qualityReport },
      updatedAt: new Date().toISOString(),
    }
  })
  if (!changed) return plan
  const next = { ...plan, slots, updatedAt: new Date().toISOString() }
  savePlan(project.id, next)
  return next
}

function updatePlanSlot(projectId, plan, slotId, patch) {
  const now = new Date().toISOString()
  const next = {
    ...plan,
    slots: plan.slots.map((slot) => slot.id === slotId ? { ...slot, ...patch, updatedAt: now } : slot),
    updatedAt: now,
  }
  savePlan(projectId, next)
  return next
}

async function publishContext({ keys, project, post, socialAccounts, scheduledAt, mode, timezone, postType, renderedMedia, video, videoId, fullCaption }) {
  const [accounts, existingSlots] = keys.postbridge
    ? await Promise.all([listAccounts(keys.postbridge), listPostSchedule(keys.postbridge)])
    : [[], []]
  const selected = new Set((socialAccounts || []).map(Number))
  return {
    brain: project.brain,
    hashtagStrategy: project.hashtagStrategy,
    scheduling: true,
    mode,
    scheduledAt,
    timezone: timezone || 'UTC',
    socialAccounts,
    connectedAccountIds: accounts.map((account) => Number(account.id)).filter(Number.isFinite),
    platforms: accounts.filter((account) => selected.has(Number(account.id))).map((account) => account.platform),
    postbridgeConfigured: !!keys.postbridge,
    postType,
    renderedMedia,
    mediaCount: postType === 'video' ? 1 : renderedMedia?.length,
    video,
    videoId,
    fullCaption,
    existingSlots,
    localPostId: post.id,
    sourceStatus: post.schedulingState,
  }
}
export default app
