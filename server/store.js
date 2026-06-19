// Local, file-based persistence. Slidesmith is a single-user tool, so all state
// lives in a small JSON config file + a queue file under the user's home dir.
// No database — post-bridge holds the scheduled posts and results.
//
// A "project" is one brand/account you generate for. Only the Brain and the
// default post-bridge accounts differ per project; the API keys and model are
// global. The queue (generated-but-unscheduled drafts) is per project.
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { bundledPackNames } from './library.js'
import { DEFAULT_DEEPSEEK_MODEL } from './ai.js'

const DEFAULT_DIR = process.env.VERCEL ? join(tmpdir(), '.slidesmith') : join(homedir(), '.slidesmith')
const DIR = process.env.SLIDESMITH_DIR || DEFAULT_DIR
const CONFIG_PATH = join(DIR, 'config.json')
const QUEUE_PATH = join(DIR, 'queue.json')
const PLANS_PATH = join(DIR, 'plans.json')
const DISMISSED_POSTS_PATH = join(DIR, 'dismissed-schedule-posts.json')

const DEFAULT_BRAIN = {
  niche: '',
  appName: '',
  appDescription: '',
  audience: '',
  styleMemory: '',
}
const DEFAULT_DEFAULTS = { socialAccountIds: [], mode: 'draft' }

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
}
function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}
function writeJson(path, value) {
  ensureDir()
  writeFileSync(path, JSON.stringify(value, null, 2))
}
function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
}
function makeProject(name, brain, defaults, imagePacks) {
  return {
    id: newId('p'),
    name: name || 'Project 1',
    brain: { ...DEFAULT_BRAIN, ...brain },
    defaults: { ...DEFAULT_DEFAULTS, ...defaults },
    // Which background packs generation draws from. Defaults to all bundled
    // packs so a fresh project generates with images out of the box. Empty = gradients.
    imagePacks: imagePacks ?? bundledPackNames(),
  }
}

// Normalize on every read: fill defaults and migrate the old single-brain shape
// ({ brain, defaults } at top level) into projects[].
export function getConfig() {
  const s = readJson(CONFIG_PATH, {})
  let projects = Array.isArray(s.projects) && s.projects.length
    ? s.projects.map((p) => ({
        id: p.id || newId('p'),
        name: p.name || 'Project',
        brain: { ...DEFAULT_BRAIN, ...p.brain },
        defaults: { ...DEFAULT_DEFAULTS, ...p.defaults },
        imagePacks: p.imagePacks ?? bundledPackNames(),
      }))
    : null

  if (!projects) {
    // Migrate a pre-projects config, or create the first project.
    const p = makeProject(s.brain?.appName || 'Project 1', s.brain, s.defaults)
    projects = [p]
  }

  const activeProjectId = projects.some((p) => p.id === s.activeProjectId)
    ? s.activeProjectId
    : projects[0].id

  const openrouterModel = s.models?.openrouter || s.model || 'openai/gpt-4o-mini'
  const deepseekModel = s.models?.deepseek || s.deepseekModel || DEFAULT_DEEPSEEK_MODEL
  const cfg = {
    keys: { postbridge: '', openrouter: '', apify: '', deepseek: '', ...s.keys },
    aiProvider: s.aiProvider === 'deepseek' ? 'deepseek' : 'openrouter',
    model: openrouterModel,
    models: {
      openrouter: openrouterModel,
      deepseek: deepseekModel,
    },
    pinterestActor: s.pinterestActor || 'fatihtahta/pinterest-scraper-search',
    projects,
    activeProjectId,
  }

  // If we had to synthesize/migrate projects (no valid persisted projects array,
  // or the active id was stale), write it back once so project ids are stable
  // across subsequent reads. Otherwise every read would mint fresh ids.
  const needsPersist =
    !Array.isArray(s.projects) ||
    s.projects.length !== projects.length ||
    s.activeProjectId !== activeProjectId ||
    s.keys?.deepseek === undefined ||
    !s.aiProvider ||
    !s.models ||
    s.projects.some((p, i) => p.id !== projects[i].id)
  if (needsPersist) writeJson(CONFIG_PATH, cfg)

  return cfg
}

function writeConfig(cfg) {
  writeJson(CONFIG_PATH, cfg)
  return cfg
}

// Global settings only (keys + model). Project data is edited via the project ops.
export function saveGlobal(patch) {
  const c = getConfig()
  return writeConfig({
    ...c,
    aiProvider: patch.aiProvider ?? c.aiProvider,
    model: patch.models?.openrouter ?? patch.model ?? c.model,
    models: {
      ...c.models,
      ...(patch.models || {}),
      ...(patch.model ? { openrouter: patch.model } : {}),
    },
    pinterestActor: patch.pinterestActor ?? c.pinterestActor,
    keys: { ...c.keys, ...patch.keys },
  })
}

export function getActiveProject(c = getConfig()) {
  return c.projects.find((p) => p.id === c.activeProjectId) || c.projects[0]
}

export function createProject(name) {
  const c = getConfig()
  const project = makeProject(name || `Project ${c.projects.length + 1}`)
  return writeConfig({ ...c, projects: [...c.projects, project], activeProjectId: project.id })
}

export function updateProject(id, patch) {
  const c = getConfig()
  const projects = c.projects.map((p) =>
    p.id === id
      ? {
          ...p,
          name: patch.name ?? p.name,
          brain: patch.brain ? { ...p.brain, ...patch.brain } : p.brain,
          defaults: patch.defaults ? { ...p.defaults, ...patch.defaults } : p.defaults,
          imagePacks: patch.imagePacks ?? p.imagePacks,
        }
      : p
  )
  return writeConfig({ ...c, projects })
}

export function removeImagePackFromProjects(packId) {
  const c = getConfig()
  const projects = c.projects.map((project) => ({
    ...project,
    imagePacks: project.imagePacks.filter((selection) => selection !== packId),
  }))
  return writeConfig({ ...c, projects })
}

export function deleteProject(id) {
  const c = getConfig()
  let projects = c.projects.filter((p) => p.id !== id)
  if (!projects.length) projects = [makeProject('Project 1')]
  const activeProjectId = c.activeProjectId === id ? projects[0].id : c.activeProjectId
  removeQueueFor(id)
  removePlansFor(id)
  removeDismissedPostsFor(id)
  return writeConfig({ ...c, projects, activeProjectId })
}

export function setActiveProject(id) {
  const c = getConfig()
  if (!c.projects.some((p) => p.id === id)) throw new Error('Unknown project')
  return writeConfig({ ...c, activeProjectId: id })
}

// ── Queue (per project) ───────────────────────────────────────────────────────
function readQueueMap() {
  const m = readJson(QUEUE_PATH, {})
  return m && !Array.isArray(m) ? m : {}
}
function writeQueueMap(m) {
  writeJson(QUEUE_PATH, m)
  return m
}
export function getQueue(projectId) {
  return readQueueMap()[projectId] || []
}
export function setQueue(projectId, items) {
  const m = readQueueMap()
  m[projectId] = items
  writeQueueMap(m)
  return items
}
export function addToQueue(projectId, items) {
  return setQueue(projectId, [...items, ...getQueue(projectId)])
}
export function removeFromQueue(projectId, id) {
  return setQueue(projectId, getQueue(projectId).filter((s) => s.id !== id))
}

function replaceDeletedImage(post, asset, replacement) {
  if (!post?.slides?.length) return { post, changed: false }
  let changed = false
  const slides = post.slides.map((slide) => {
    if (slide.imageAssetId !== asset.id && slide.imageUrl !== asset.url) return slide
    changed = true
    return replacement
      ? {
          ...slide,
          imageUrl: replacement.url,
          imageAssetId: replacement.id,
          imageFolderId: replacement.folderId,
          imageUnavailable: false,
        }
      : {
          ...slide,
          imageUrl: undefined,
          imageAssetId: undefined,
          imageFolderId: asset.folderId || slide.imageFolderId,
          imageUnavailable: true,
        }
  })
  if (!changed) return { post, changed: false }
  const unavailable = slides.some((slide) => slide.imageUnavailable)
  return {
    changed: true,
    post: {
      ...post,
      slides,
      mediaUnavailable: unavailable,
      mediaError: unavailable
        ? 'A Library background used by this draft was deleted. Choose another background from the same folder or regenerate it.'
        : undefined,
      qualityReport: null,
      qualityInvalidatedAt: new Date().toISOString(),
    },
  }
}

// Remove persistent references after the managed file and Library record have
// been deleted. Unfinished drafts are either moved to a live asset from the
// same folder or marked unavailable; already scheduled posts are untouched.
export function invalidateLibraryAssetReferences(asset, replacement = null) {
  const queueMap = readQueueMap()
  let queueChanged = false
  if (asset.type === 'image') {
    for (const [projectId, items] of Object.entries(queueMap)) {
      queueMap[projectId] = (items || []).map((post) => {
        const result = replaceDeletedImage(post, asset, replacement)
        if (result.changed) queueChanged = true
        return result.post
      })
    }
  }
  if (queueChanged) writeQueueMap(queueMap)

  const planMap = readPlanMap()
  let plansChanged = false
  const now = new Date().toISOString()
  for (const [projectId, plans] of Object.entries(planMap)) {
    planMap[projectId] = (plans || []).map((plan) => {
      let planChanged = false
      let config = plan.config
      if (asset.type === 'video' && config?.videoId === asset.id) {
        config = { ...config, videoId: replacement?.id || null }
        planChanged = true
      }
      const slots = (plan.slots || []).map((slot) => {
        if (slot.status === 'scheduled') return slot
        if (asset.type === 'image') {
          const result = replaceDeletedImage(slot.post, asset, replacement)
          if (!result.changed) return slot
          planChanged = true
          return {
            ...slot,
            post: result.post,
            qualityReport: null,
            approvedAt: null,
            status: replacement ? 'needs_attention' : 'failed',
            error: replacement
              ? 'A deleted Library background was replaced from the same folder. Review this post again.'
              : 'A Library background used by this post was deleted. Add an image to the selected folder or regenerate this post.',
            updatedAt: now,
          }
        }
        if (asset.type === 'video' && plan.config?.videoId === asset.id && slot.format === 'video') {
          planChanged = true
          return {
            ...slot,
            approvedAt: null,
            status: replacement ? 'needs_attention' : 'failed',
            error: replacement
              ? 'The deleted video was replaced from the same folder. Review this post again.'
              : 'The selected background video was deleted. Choose another video before scheduling.',
            updatedAt: now,
          }
        }
        return slot
      })
      if (!planChanged) return plan
      plansChanged = true
      return { ...plan, config, slots, updatedAt: now }
    })
  }
  if (plansChanged) writePlanMap(planMap)
  return { queueChanged, plansChanged }
}
function removeQueueFor(projectId) {
  const m = readQueueMap()
  delete m[projectId]
  writeQueueMap(m)
}

// ── Content plans (per project) ─────────────────────────────────────────────
function readPlanMap() {
  const value = readJson(PLANS_PATH, {})
  return value && !Array.isArray(value) ? value : {}
}

function writePlanMap(value) {
  writeJson(PLANS_PATH, value)
  return value
}

function recoverInterruptedPlan(plan) {
  let changed = false
  const slots = (plan.slots || []).map((slot) => {
    if (['generating', 'quality_check'].includes(slot.status)) {
      changed = true
      return { ...slot, status: 'failed', error: 'Interrupted by an app restart. Retry this item.' }
    }
    if (slot.status === 'scheduling') {
      changed = true
      return {
        ...slot,
        status: 'failed',
        scheduleUncertain: true,
        error: 'Scheduling was interrupted. Check Postbridge before retrying to avoid a duplicate.',
      }
    }
    return slot
  })
  return { plan: changed ? { ...plan, slots, updatedAt: new Date().toISOString() } : plan, changed }
}

let interruptedPlansRecovered = false

export function getPlans(projectId) {
  const map = readPlanMap()
  if (!interruptedPlansRecovered) {
    let changed = false
    for (const [id, plans] of Object.entries(map)) {
      const recovered = (plans || []).map(recoverInterruptedPlan)
      if (recovered.some((item) => item.changed)) changed = true
      map[id] = recovered.map((item) => item.plan)
    }
    interruptedPlansRecovered = true
    if (changed) writePlanMap(map)
  }
  return map[projectId] || []
}

export function getPlan(projectId, planId) {
  return getPlans(projectId).find((plan) => plan.id === planId) || null
}

export function savePlan(projectId, plan) {
  const map = readPlanMap()
  const plans = map[projectId] || []
  const index = plans.findIndex((item) => item.id === plan.id)
  if (index >= 0) plans[index] = plan
  else plans.unshift(plan)
  map[projectId] = plans
  writePlanMap(map)
  return plan
}

export function deletePlan(projectId, planId) {
  const map = readPlanMap()
  map[projectId] = (map[projectId] || []).filter((plan) => plan.id !== planId)
  writePlanMap(map)
  return map[projectId]
}

function removePlansFor(projectId) {
  const map = readPlanMap()
  delete map[projectId]
  writePlanMap(map)
}

// Published posts hidden from the local Schedule view. These IDs are never sent
// to Postbridge as deletions and do not affect Results or Learning Memory.
function readDismissedPostMap() {
  const value = readJson(DISMISSED_POSTS_PATH, {})
  return value && !Array.isArray(value) ? value : {}
}

function writeDismissedPostMap(value) {
  writeJson(DISMISSED_POSTS_PATH, value)
  return value
}

export function getDismissedPublishedPostIds(projectId) {
  const ids = readDismissedPostMap()[projectId]
  return [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))]
}

export function dismissPublishedPost(projectId, postId) {
  const map = readDismissedPostMap()
  map[projectId] = [...new Set([...(map[projectId] || []).map(String), String(postId)])]
  writeDismissedPostMap(map)
  return map[projectId]
}

export function restorePublishedPost(projectId, postId) {
  const map = readDismissedPostMap()
  map[projectId] = (map[projectId] || []).map(String).filter((id) => id !== String(postId))
  writeDismissedPostMap(map)
  return map[projectId]
}

export function reconcileDismissedPublishedPosts(projectId, remotePostIds) {
  const existing = new Set((remotePostIds || []).map(String))
  const map = readDismissedPostMap()
  const current = (map[projectId] || []).map(String)
  const next = [...new Set(current.filter((id) => existing.has(id)))]
  if (next.length !== current.length) {
    map[projectId] = next
    writeDismissedPostMap(map)
  }
  return next
}

function removeDismissedPostsFor(projectId) {
  const map = readDismissedPostMap()
  delete map[projectId]
  writeDismissedPostMap(map)
}

export const CONFIG_DIR = DIR
