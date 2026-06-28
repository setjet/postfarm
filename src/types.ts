export type ViewKey = 'queue' | 'trends' | 'library' | 'schedule' | 'results' | 'learning' | 'brain' | 'settings';

export interface Slide {
  id: string;
  text: string;
  // Generated slides have no source image — they're rendered from text over a
  // gradient. `imageUrl` is kept optional for backwards-compat / future use.
  imageUrl?: string;
  imageAssetId?: string;
  imageFolderId?: string;
  imageUnavailable?: boolean;
  bgFrom?: string;
  bgTo?: string;
}

export interface Slideshow {
  id: string;
  format?: 'standard' | 'notes';
  hook: string;
  caption: string;
  hashtags: string[];
  slides: Slide[];
  createdAt: string;
  rationale: string;
  notesData?: NotesData;
  qualityScore?: number;
  qualityBreakdown?: QualityBreakdown;
  qualityFeedback?: string;
  qualityStatus?: 'strong' | 'ready' | 'needs-review' | 'weak';
  rewriteAttempts?: number;
  trendSourcesUsed?: string[];
  generationMode?: string;
  contentBucket?: string;
  ctaKeyword?: string;
  topicMode?: 'general' | 'custom';
  topic?: string;
  generationNotes?: string;
  hashtagNotes?: string;
  productEmphasis?: string;
  plannerFormat?: PlannerFormat;
  plannerSlotId?: string;
  qualityReport?: QualityReport | null;
  qualityInvalidatedAt?: string;
  mediaUnavailable?: boolean;
  mediaError?: string;
  schedulingState?: 'preflight' | 'rendering' | 'uploading' | 'creating' | 'uncertain' | null;
}

export type QualitySeverity = 'blocking' | 'warning';

export interface QualityFinding {
  id: string;
  check: string;
  severity: QualitySeverity;
  explanation: string;
  field: string;
  suggestion: string;
  slideIndex?: number;
  fix?: 'safe';
}

export interface QualityReport {
  version: number;
  contentVersion: string;
  checkedAt: string;
  status: 'passed' | 'warnings' | 'blocked';
  score: number;
  summary: { blocking: number; warnings: number; passed: number };
  findings: QualityFinding[];
}

export type PlannerFormat = 'standard' | 'notes' | 'image' | 'video';
export type PlannerSlotStatus =
  | 'planned' | 'generating' | 'quality_check' | 'needs_attention' | 'ready_for_review'
  | 'approved' | 'scheduling' | 'scheduled' | 'failed' | 'removed';

export interface ContentPillar { name: string; percentage: number; }

export interface ContentPlanConfig {
  name: string;
  goal: 'growth' | 'engagement' | 'education' | 'promotion' | 'traffic';
  rangePreset: '7' | '14' | '30' | 'custom';
  startDate: string;
  endDate: string;
  timezone: string;
  postingDays: number[];
  postsPerDay: number;
  preferredTimeMode: 'manual' | 'ai';
  preferredTimes: string[];
  socialAccountIds: number[];
  topicMode: 'general' | 'custom';
  topics: string[];
  contentPillars: ContentPillar[];
  formats: PlannerFormat[];
  backgroundSelections: string[];
  generationNotes: string;
  productEmphasis: string;
  videoId: string | null;
  approvalMode: 'manual' | 'automatic';
  useTrends: boolean;
}

export interface ContentPlanSlot {
  id: string;
  localDate: string;
  localTime: string;
  scheduledAt: string;
  timezone: string;
  topic: string;
  pillar: string;
  format: PlannerFormat;
  backgroundSelection: string | null;
  socialAccountIds: number[];
  status: PlannerSlotStatus;
  conflicts: Array<{ postId: string; scheduledAt: string; socialAccounts: number[] }>;
  post: Slideshow | null;
  qualityReport: QualityReport | null;
  approvedAt: string | null;
  warningsAcknowledgedAt?: string | null;
  postbridgeId: string | null;
  scheduleUncertain: boolean;
  error: string | null;
}

export interface ContentPlan {
  id: string;
  projectId: string;
  name: string;
  config: ContentPlanConfig;
  slots: ContentPlanSlot[];
  automaticSchedulingConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress: { total: number; complete: number; failures: number; remaining: number };
}

export interface NotesData {
  hookText: string;
  noteTitle?: string;
  noteDate?: string;
  points: NotesPoint[];
}

export interface NotesPoint {
  heading: string;
  body: string;
}

export interface QualityBreakdown {
  hookStrength?: number;
  clarity?: number;
  originality?: number;
  brandFit?: number;
  audienceFit?: number;
  ctaStrength?: number;
  viralPotential?: number;
  usefulness?: number;
  nonGenericWording?: number;
  instructionAdherence?: number;
}

export interface BrainState {
  niche: string;
  appName: string;
  appDescription: string;
  audience: string;
  styleMemory: string;
}

export interface HashtagStrategy {
  preferred?: string[];
  required?: string[];
  banned?: string[];
  brand?: string[];
  niche?: string[];
  tools?: string[];
  style?: 'balanced' | 'broad' | 'niche' | 'tool' | 'product' | 'minimal';
  count?: 3 | 5 | 8 | 10;
  trendInfluence?: 'off' | 'light' | 'balanced' | 'strong';
  avoidGeneric?: boolean;
  notes?: string;
}

export interface ProjectDefaults {
  socialAccountIds: number[];
  mode: 'draft' | 'schedule';
}

export interface Project {
  id: string;
  name: string;
  brain: BrainState;
  defaults: ProjectDefaults;
  hashtagStrategy?: HashtagStrategy;
  // Bundled pack names and stable Library folder ids ([] = gradients only).
  imagePacks: string[];
}

export interface AppConfig {
  keys: { postbridge: string; openrouter: string; apify: string; deepseek: string };
  aiProvider: 'openrouter' | 'deepseek';
  model: string;
  models: {
    openrouter: string;
    deepseek: string;
  };
  pinterestActor: string;
  projects: Project[];
  activeProjectId: string;
}

export interface LibraryImage {
  id: string;
  url: string;
  pack: string;
  source: 'bundled' | 'scraped' | 'imported';
  folderId?: string;
  addedAt?: string | null;
  originalName?: string | null;
}

export interface LibraryPack {
  id: string;
  name: string;
  source: 'bundled' | 'library';
  count: number;
  covers: string[];
}

export interface LibraryFolder {
  id: string;
  name: string;
  type: 'mixed' | 'image' | 'video';
  createdAt?: string | null;
  updatedAt?: string | null;
  readonly?: boolean;
  system?: boolean;
}

export interface TrendItem {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  postUrl: string;
  platform: string;
  author: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  duration: number | null;
  uploadDate: string | null;
  scrapedAt: string;
  contentType: string;
  query: string;
}

export interface LearningMemory {
  projectId: string;
  generatedAt: string;
  sourcePostCount: number;
  summary: string;
  working: string[];
  avoid: string[];
  bestCtas: string[];
  bestHookFormulas: string[];
  recommendedNextPosts: string[];
  suggestedBuckets: string[];
}

export interface VideoAsset {
  id: string;
  url: string;
  pack: string;
  source: 'imported' | 'scraped';
  addedAt: string;
  duration: number | null;
  originalUrl: string | null;
  folderId?: string;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface SocialAccount {
  id: number;
  platform: string;
  username: string;
}

// Shapes returned by post-bridge (mapped in lib/api.ts).
export interface ScheduledPost {
  id: string;
  caption: string;
  status: string; // scheduled | processing | posted | failed | draft | unknown
  scheduledAt: string | null;
  media: Array<{ url: string; mimeType: string | null; duration: number | null }>;
  mediaCount: number;
  socialAccounts: number[];
  isDraft: boolean;
  createdAt: string | null;
}

export interface PostResult {
  id: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  coverImageUrl: string | null;
  shareUrl: string | null;
  description: string | null;
  lastSyncedAt: string | null;
}
