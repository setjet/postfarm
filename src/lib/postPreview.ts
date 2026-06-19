import type { ContentPlan, ContentPlanSlot } from '../types';

export interface PreviewAvailability {
  enabled: boolean;
  reason: string | null;
}

export function clampPreviewIndex(index: number, slideCount: number): number {
  if (slideCount <= 0) return 0;
  return Math.min(Math.max(Math.round(index) || 0, 0), slideCount - 1);
}

export function navigatePreview(index: number, direction: -1 | 1, slideCount: number): number {
  return clampPreviewIndex(index + direction, slideCount);
}

export function plannerPreviewAvailability(slot: ContentPlanSlot, videoAvailable = true): PreviewAvailability {
  if (slot.status === 'generating') return { enabled: false, reason: 'Preview is available after generation finishes.' };
  if (slot.status === 'failed') return { enabled: false, reason: 'Preview unavailable for failed posts.' };
  if (!slot.post) {
    return {
      enabled: false,
      reason: 'Generate this post to preview it.',
    };
  }
  if (!Array.isArray(slot.post.slides) || slot.post.slides.length === 0) {
    return { enabled: false, reason: 'Preview unavailable until rendering is complete.' };
  }
  if (slot.post.mediaUnavailable || slot.post.slides.some((slide) => slide.imageUnavailable)) {
    return { enabled: false, reason: 'A Library asset used by this post is unavailable.' };
  }
  if (slot.format === 'video' && !videoAvailable) {
    return { enabled: false, reason: 'The selected background video is unavailable.' };
  }
  return { enabled: true, reason: null };
}

export function latestPreviewSlot(slotId: string | null, slots: ContentPlanSlot[]): ContentPlanSlot | null {
  if (!slotId) return null;
  return slots.find((slot) => slot.id === slotId && slot.status !== 'removed') || null;
}

export function latestPlannerSnapshot(storedPlan: ContentPlan | null, jobPlan: ContentPlan | null): ContentPlan | null {
  if (!jobPlan || (storedPlan && jobPlan.id !== storedPlan.id)) return storedPlan;
  if (!storedPlan) return jobPlan;
  const storedAt = Date.parse(storedPlan.updatedAt) || 0;
  const jobAt = Date.parse(jobPlan.updatedAt) || 0;
  return jobAt >= storedAt ? jobPlan : storedPlan;
}
