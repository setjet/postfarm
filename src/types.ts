export type ViewKey = 'queue' | 'trends' | 'library' | 'schedule' | 'results' | 'brain' | 'settings';

export interface Slide {
  id: string;
  text: string;
  // Generated slides have no source image — they're rendered from text over a
  // gradient. `imageUrl` is kept optional for backwards-compat / future use.
  imageUrl?: string;
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
}

export interface BrainState {
  niche: string;
  appName: string;
  appDescription: string;
  audience: string;
  styleMemory: string;
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
  imagePacks: string[]; // background packs generation draws from ([] = gradients only)
}

export interface AppConfig {
  keys: { postbridge: string; openrouter: string; apify: string };
  model: string;
  pinterestActor: string;
  projects: Project[];
  activeProjectId: string;
}

export interface LibraryImage {
  id: string;
  url: string;
  pack: string;
  source: 'bundled' | 'scraped';
}

export interface LibraryPack {
  name: string;
  source: 'bundled' | 'scraped';
  count: number;
  covers: string[];
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
  status: string; // scheduled | processing | posted | draft
  scheduledAt: string | null;
  mediaUrls: string[];
  socialAccounts: number[];
  isDraft: boolean;
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
