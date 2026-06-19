// Frontend API client. All calls go to the local Slidesmith server (proxied at
// /api in dev, same-origin in production). The server holds the keys and talks
// to Claude + post-bridge — the browser never sees the secrets in a request.
import type {
  AppConfig,
  Project,
  Slideshow,
  SocialAccount,
  ScheduledPost,
  PostResult,
  ModelOption,
  LibraryImage,
  LibraryPack,
  LibraryFolder,
  VideoAsset,
  TrendItem,
  LearningMemory,
  ContentPlan,
  ContentPlanConfig,
  QualityReport,
} from '../types';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    cache: 'no-store', // always hit the server — never a stale Schedule/Results list
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = body as { error?: string; qualityReport?: QualityReport };
    const error = new Error(payload.error || res.statusText) as Error & { qualityReport?: QualityReport };
    if (payload.qualityReport) error.qualityReport = payload.qualityReport;
    throw error;
  }
  return body as T;
}

export const getConfig = () => req<AppConfig>('/config');

// Global settings only (keys + model + scraper actor).
export const saveConfig = (patch: {
  keys?: AppConfig['keys'];
  aiProvider?: AppConfig['aiProvider'];
  model?: string;
  models?: AppConfig['models'];
  pinterestActor?: string;
}) =>
  req<AppConfig>('/config', { method: 'PUT', body: JSON.stringify(patch) });

// Projects — each has its own Brain + default post-bridge accounts.
export const createProject = (name?: string) =>
  req<AppConfig>('/projects', { method: 'POST', body: JSON.stringify({ name }) });

export const updateProject = (
  id: string,
  patch: Partial<Pick<Project, 'name' | 'brain' | 'defaults' | 'imagePacks'>>
) => req<AppConfig>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(patch) });

export const deleteProject = (id: string) =>
  req<AppConfig>(`/projects/${id}`, { method: 'DELETE' });

export const activateProject = (id: string) =>
  req<AppConfig>(`/projects/${id}/activate`, { method: 'POST' });

export const testKeys = () =>
  req<{ postbridge: boolean; openrouter: boolean; deepseek: boolean; apify: boolean; errors: Record<string, string> }>(
    '/config/test',
    { method: 'POST' }
  );

export const getModels = () => req<ModelOption[]>('/models');
export const getDeepSeekModels = () => req<ModelOption[]>('/models/deepseek');

export const getQueue = () => req<Slideshow[]>('/queue');

export interface GenerateOptions {
  postFormat?: 'standard' | 'notes';
  packs?: string[];
  useTrends?: boolean;
  trendIds?: string[];
  useLearning?: boolean;
  qualityMode?: 'off' | 'normal' | 'strict';
  minScore?: number;
  maxRewriteAttempts?: number;
  contentBucket?: string;
  ctaKeyword?: string;
  topicMode?: 'general' | 'custom';
  topic?: string;
  folderIds?: string[];
  generationNotes?: string;
}

export const generate = (count = 4, options: GenerateOptions = {}) =>
  req<Slideshow[]>('/generate', { method: 'POST', body: JSON.stringify({ count, ...options }) });

export const removeFromQueue = (id: string) =>
  req<Slideshow[]>(`/queue/${id}`, { method: 'DELETE' });

export const updateSlideshow = (
  id: string,
  patch: Partial<Pick<Slideshow, 'slides' | 'caption' | 'hashtags' | 'hook' | 'notesData' | 'format'>>
) => req<Slideshow[]>(`/queue/${id}`, { method: 'PUT', body: JSON.stringify(patch) });

export const rewriteSlideshow = (id: string, note?: string) =>
  req<Slideshow[]>(`/queue/${id}/rewrite`, { method: 'POST', body: JSON.stringify({ note }) });

export const checkQueueQuality = (id: string) =>
  req<Slideshow[]>(`/queue/${encodeURIComponent(id)}/quality`, { method: 'POST' });

export const fixQueueQuality = (id: string) =>
  req<Slideshow[]>(`/queue/${encodeURIComponent(id)}/quality/fix`, { method: 'POST' });

// Trend mining
export const getTrends = () => req<TrendItem[]>('/trends');

export const scrapeTrends = (queries: string[], count: number, actor?: string) =>
  req<{ added: number; found: number; trends: TrendItem[] }>('/trends/scrape', {
    method: 'POST',
    body: JSON.stringify({ queries, count, actor }),
  });

export const deleteTrend = (id: string) =>
  req<TrendItem[]>(`/trends/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const clearTrends = () => req<TrendItem[]>('/trends', { method: 'DELETE' });

// ── Image library ─────────────────────────────────────────────────────────────
export const getLibrary = () => req<LibraryImage[]>('/library');

export const getPacks = () => req<LibraryPack[]>('/library/packs');
export const getLibraryFolders = () => req<LibraryFolder[]>('/library/folders');

export const createLibraryFolder = (name: string, type: LibraryFolder['type'] = 'mixed') =>
  req<LibraryFolder>('/library/folders', { method: 'POST', body: JSON.stringify({ name, type }) });

export const updateLibraryFolder = (id: string, patch: Partial<Pick<LibraryFolder, 'name' | 'type'>>) =>
  req<LibraryFolder>(`/library/folders/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) });

export const deleteLibraryFolder = (id: string) =>
  req<LibraryFolder[]>(`/library/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });

export async function importImages(files: File[], folderId?: string) {
  const images = await Promise.all(
    files.map(
      (file) =>
        new Promise<{ name: string; type: string; data: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, type: file.type, data: String(reader.result || '') });
          reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
          reader.readAsDataURL(file);
        })
    )
  );
  return req<{ added: number; images: LibraryImage[] }>('/library/import', {
    method: 'POST',
    body: JSON.stringify({ images, folderId }),
  });
}

export const moveLibraryAsset = (id: string, folderId: string, type: 'image' | 'video' = 'image') =>
  req<LibraryImage[] | VideoAsset[]>(`/library/assets/${encodeURIComponent(id)}/folder`, {
    method: 'PUT',
    body: JSON.stringify({ folderId, type }),
  });

export const scrapePinterest = (searches: string[], count: number, folderId?: string) =>
  req<{ added: number; found: number }>('/library/scrape', {
    method: 'POST',
    body: JSON.stringify({ searches, count, folderId }),
  });

export const deleteLibraryImage = (id: string) =>
  req<LibraryImage[]>(`/library/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Video library
export const getVideos = () => req<VideoAsset[]>('/videos');

export const importVideo = (url: string, pack?: string, folderId?: string) =>
  req<{ added: number; video: VideoAsset }>('/videos/import', {
    method: 'POST',
    body: JSON.stringify({ url, pack, folderId }),
  });

export const scrapeVideos = (source: string, count: number, actor?: string, folderId?: string) =>
  req<{ added: number; found: number }>('/videos/scrape', {
    method: 'POST',
    body: JSON.stringify({ source, count, actor, folderId }),
  });

export const deleteVideo = (id: string) =>
  req<VideoAsset[]>(`/videos/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const getAccounts = () => req<SocialAccount[]>('/accounts');

export interface SchedulePayload {
  id: string;
  caption: string;
  slides: string[]; // PNG data URLs
  socialAccounts: number[];
  scheduledAt: string | null;
  mode: 'draft' | 'schedule';
  timezone?: string;
  warningsAcknowledged?: boolean;
}

export const schedule = (payload: SchedulePayload) =>
  req<unknown>('/schedule', { method: 'POST', body: JSON.stringify(payload) });

export interface ScheduleVideoPayload {
  id: string;
  caption: string;
  socialAccounts: number[];
  scheduledAt: string | null;
  mode: 'draft' | 'schedule';
  videoId: string;
  duration: number;
  textPosition: 'center' | 'top';
  watermark: boolean;
  timezone?: string;
  warningsAcknowledged?: boolean;
}

export const scheduleVideo = (payload: ScheduleVideoPayload) =>
  req<unknown>('/schedule/video', { method: 'POST', body: JSON.stringify(payload) });

export const reschedulePost = (id: string, scheduledAt: string) =>
  req<unknown>(`/posts/${encodeURIComponent(id)}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify({ scheduledAt }),
  });

export const removeScheduledPost = (id: string) =>
  req<{ ok: true }>(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const getDismissedPublishedPostIds = () => req<string[]>('/schedule-dismissals');

export const dismissPublishedPost = (id: string) =>
  req<string[]>(`/schedule-dismissals/${encodeURIComponent(id)}`, { method: 'POST' });

export const restorePublishedPost = (id: string) =>
  req<string[]>(`/schedule-dismissals/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const previewContentPlan = (config: Partial<ContentPlanConfig>) =>
  req<Pick<ContentPlan, 'config' | 'slots' | 'progress'>>('/plans/preview', { method: 'POST', body: JSON.stringify(config) });

export const getContentPlans = () => req<ContentPlan[]>('/plans');
export const getContentPlan = (id: string) => req<ContentPlan>(`/plans/${encodeURIComponent(id)}`);
export const createContentPlan = (config: Partial<ContentPlanConfig>) =>
  req<ContentPlan>('/plans', { method: 'POST', body: JSON.stringify(config) });
export const deleteContentPlan = (id: string) => req<ContentPlan[]>(`/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const updateContentPlanSlot = (planId: string, slotId: string, patch: Record<string, unknown>) =>
  req<ContentPlan>(`/plans/${encodeURIComponent(planId)}/slots/${encodeURIComponent(slotId)}`, { method: 'PUT', body: JSON.stringify(patch) });
export const generateContentPlanSlot = (planId: string, slotId: string) =>
  req<ContentPlan>(`/plans/${encodeURIComponent(planId)}/slots/${encodeURIComponent(slotId)}/generate`, { method: 'POST' });
export const checkContentPlanSlot = (planId: string, slotId: string) =>
  req<ContentPlan>(`/plans/${encodeURIComponent(planId)}/slots/${encodeURIComponent(slotId)}/quality`, { method: 'POST' });
export const fixContentPlanSlot = (planId: string, slotId: string) =>
  req<ContentPlan>(`/plans/${encodeURIComponent(planId)}/slots/${encodeURIComponent(slotId)}/quality/fix`, { method: 'POST' });
export const approveContentPlanSlot = (planId: string, slotId: string, warningsAcknowledged = false) =>
  req<ContentPlan>(`/plans/${encodeURIComponent(planId)}/slots/${encodeURIComponent(slotId)}/approve`, { method: 'POST', body: JSON.stringify({ warningsAcknowledged }) });
export const approveReadyContentPlanSlots = (planId: string, warningsAcknowledged = false) =>
  req<ContentPlan>(`/plans/${encodeURIComponent(planId)}/approve-ready`, {
    method: 'POST', body: JSON.stringify({ warningsAcknowledged }),
  });
export const confirmAutomaticContentPlan = (planId: string) =>
  req<ContentPlan>(`/plans/${encodeURIComponent(planId)}/confirm-automatic`, { method: 'POST', body: JSON.stringify({ confirm: true }) });
export const scheduleContentPlanSlot = (planId: string, slotId: string, payload: {
  slides?: string[];
  videoId?: string;
  duration?: number;
  textPosition?: 'center' | 'top';
  watermark?: boolean;
}) =>
  req<ContentPlan>(`/plans/${encodeURIComponent(planId)}/slots/${encodeURIComponent(slotId)}/schedule`, {
    method: 'POST', body: JSON.stringify(payload),
  });

// post-bridge → ScheduledPost. post-bridge stores caption + media + schedule;
// it has no concept of our per-slide text, so the Schedule view shows the
// rendered images + caption + status.
export async function getScheduledPosts(): Promise<ScheduledPost[]> {
  const raw = await req<Array<Record<string, unknown>>>('/posts');
  return raw.map((p) => ({
    id: String(p.id),
    caption: String(p.caption || ''),
    status: String(p.is_draft ? 'draft' : p.status || 'unknown').toLowerCase(),
    scheduledAt: (p.scheduled_at as string) || null,
    // The server resolves post-bridge's nested media (media.object.url) into a
    // flat string[] under `media_urls` — fall back to raw media for safety.
    media: Array.isArray(p.media_items)
      ? (p.media_items as Array<{ url?: unknown; mimeType?: unknown; duration?: unknown }>).map((item) => ({
          url: String(item.url || ''),
          mimeType: item.mimeType ? String(item.mimeType) : null,
          duration: Number(item.duration) || null,
        })).filter((item) => item.url)
      : Array.isArray(p.media_urls)
      ? (p.media_urls as unknown[]).map((url) => ({ url: String(url), mimeType: null, duration: null })).filter((item) => item.url)
      : Array.isArray(p.media)
      ? (p.media as Array<{ url?: string; mime_type?: string; duration?: number; object?: { url?: string; duration?: number } }>)
          .map((m) => ({
            url: m.object?.url || m.url || '',
            mimeType: m.mime_type || null,
            duration: Number(m.duration ?? m.object?.duration) || null,
          }))
          .filter((item) => item.url)
      : [],
    mediaCount: Number(p.media_count) || (Array.isArray(p.media) ? p.media.length : 0),
    socialAccounts: (p.social_accounts as number[]) || [],
    isDraft: !!p.is_draft,
    createdAt: p.created_at ? String(p.created_at) : null,
  }));
}

export const getScheduledPostMedia = (id: string) =>
  req<ScheduledPost['media']>(`/posts/${encodeURIComponent(id)}/media`);

function mapResult(a: Record<string, unknown>): PostResult {
  return {
    id: String(a.id),
    platform: String(a.platform || ''),
    views: Number(a.view_count || 0),
    likes: Number(a.like_count || 0),
    comments: Number(a.comment_count || 0),
    shares: Number(a.share_count || 0),
    coverImageUrl: (a.cover_image_url as string) || null,
    shareUrl: (a.share_url as string) || null,
    description: (a.video_description as string) || null,
    lastSyncedAt: (a.last_synced_at as string) || null,
  };
}

export async function getResults(): Promise<PostResult[]> {
  const raw = await req<Array<Record<string, unknown>>>('/results');
  return raw.map(mapResult);
}

// Trigger a post-bridge analytics sync, then return the refreshed results.
export async function syncResults(): Promise<PostResult[]> {
  const raw = await req<Array<Record<string, unknown>>>('/results/sync', { method: 'POST' });
  return raw.map(mapResult);
}

export const getLearning = () => req<LearningMemory | null>('/learning');

export const rebuildLearning = () =>
  req<LearningMemory>('/learning/rebuild', { method: 'POST' });

export const clearLearning = () =>
  req<null>('/learning', { method: 'DELETE' });
