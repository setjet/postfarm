import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { getDataDir } from './paths.js'

const DIR = getDataDir()
const INDEX_PATH = join(DIR, 'folders.json')

export const ALL_FOLDER_ID = 'all'
export const UNCATEGORIZED_FOLDER_ID = 'folder:uncategorized'
export const BUNDLED_FOLDER_ID = 'folder:bundled'
export const VIDEOS_FOLDER_ID = 'folder:videos'

const DEFAULT_FOLDERS = [
  { id: UNCATEGORIZED_FOLDER_ID, name: 'Uncategorized', type: 'mixed' },
  { id: 'folder:brand-assets', name: 'Brand assets', type: 'mixed' },
  { id: 'folder:campaign-creative', name: 'Campaign creative', type: 'image' },
  { id: 'folder:product-offers', name: 'Product or offer assets', type: 'image' },
  { id: 'folder:text-note-backgrounds', name: 'Text-note backgrounds', type: 'image' },
  { id: VIDEOS_FOLDER_ID, name: 'Videos', type: 'video' },
  { id: BUNDLED_FOLDER_ID, name: 'Bundled packs', type: 'image', readonly: true },
]

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

function readState() {
  const state = readJson(INDEX_PATH, { folders: [], hiddenDefaultIds: [] })
  return {
    folders: Array.isArray(state.folders) ? state.folders : Array.isArray(state) ? state : [],
    hiddenDefaultIds: Array.isArray(state.hiddenDefaultIds) ? state.hiddenDefaultIds : [],
  }
}

function writeState(state) {
  writeJson(INDEX_PATH, state)
}

function now() {
  return new Date().toISOString()
}

export function listFolders() {
  const state = readState()
  const overrides = new Map(state.folders.map((f) => [f.id, f]))
  const defaults = DEFAULT_FOLDERS
    .filter((folder) => !state.hiddenDefaultIds.includes(folder.id))
    .map((folder) => ({
      ...folder,
      createdAt: overrides.get(folder.id)?.createdAt || null,
      updatedAt: overrides.get(folder.id)?.updatedAt || null,
      name: overrides.get(folder.id)?.name || folder.name,
      type: overrides.get(folder.id)?.type || folder.type,
      readonly: folder.readonly || false,
      system: true,
    }))
  const custom = state.folders
    .filter((folder) => !DEFAULT_FOLDERS.some((d) => d.id === folder.id))
    .map((folder) => ({ type: 'mixed', ...folder, system: false, readonly: false }))
  return [...defaults, ...custom]
}

export function folderExists(id) {
  return id === ALL_FOLDER_ID || listFolders().some((folder) => folder.id === id)
}

export function safeFolderId(id, fallback = UNCATEGORIZED_FOLDER_ID) {
  if (folderExists(id) && id !== ALL_FOLDER_ID) return id
  if (folderExists(fallback) && fallback !== ALL_FOLDER_ID) return fallback
  return UNCATEGORIZED_FOLDER_ID
}

export function createFolder({ name, type = 'mixed' }) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim()
  if (!cleanName) throw new Error('Folder name is required.')
  const state = readState()
  const folder = {
    id: `folder:${randomUUID()}`,
    name: cleanName.slice(0, 80),
    type: ['image', 'video', 'mixed'].includes(type) ? type : 'mixed',
    createdAt: now(),
    updatedAt: now(),
  }
  state.folders.push(folder)
  writeState(state)
  return folder
}

export function renameFolder(id, patch = {}) {
  if (id === ALL_FOLDER_ID) throw new Error('The All view cannot be renamed.')
  const cleanName = String(patch.name || '').replace(/\s+/g, ' ').trim()
  if (!cleanName) throw new Error('Folder name is required.')
  const state = readState()
  const existing = state.folders.find((folder) => folder.id === id)
  if (existing) {
    existing.name = cleanName.slice(0, 80)
    existing.type = ['image', 'video', 'mixed'].includes(patch.type) ? patch.type : existing.type
    existing.updatedAt = now()
  } else if (DEFAULT_FOLDERS.some((folder) => folder.id === id)) {
    state.folders.push({
      id,
      name: cleanName.slice(0, 80),
      type: ['image', 'video', 'mixed'].includes(patch.type) ? patch.type : DEFAULT_FOLDERS.find((folder) => folder.id === id)?.type || 'mixed',
      createdAt: now(),
      updatedAt: now(),
    })
    state.hiddenDefaultIds = state.hiddenDefaultIds.filter((hiddenId) => hiddenId !== id)
  } else {
    throw new Error('Folder not found.')
  }
  writeState(state)
  return listFolders().find((folder) => folder.id === id)
}

export function deleteFolder(id) {
  if ([ALL_FOLDER_ID, UNCATEGORIZED_FOLDER_ID, BUNDLED_FOLDER_ID].includes(id)) {
    throw new Error('This folder cannot be deleted.')
  }
  const state = readState()
  const before = state.folders.length
  state.folders = state.folders.filter((folder) => folder.id !== id)
  if (DEFAULT_FOLDERS.some((folder) => folder.id === id) && !state.hiddenDefaultIds.includes(id)) {
    state.hiddenDefaultIds.push(id)
  } else if (before === state.folders.length) {
    throw new Error('Folder not found.')
  }
  writeState(state)
  return listFolders()
}
