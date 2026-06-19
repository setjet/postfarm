import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileEdit,
  ImageIcon,
  Images,
  Loader2,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import type { ScheduledPost, SocialAccount } from '../types';
import { Button } from '../components/Button';
import { ViewHeader } from '../components/ViewHeader';
import {
  dismissPublishedPost, getDismissedPublishedPostIds, getScheduledPostMedia, getScheduledPosts,
  removeScheduledPost, reschedulePost, restorePublishedPost,
} from '../lib/api';

interface ScheduleViewProps {
  configured: boolean;
  accounts: SocialAccount[];
  onPlanContent: () => void;
}

type PostMedia = ScheduledPost['media'][number];

const statusMeta: Record<string, { icon: typeof Clock; badge: string; label: string }> = {
  draft: { icon: FileEdit, badge: 'border-line-2 bg-white/5 text-ink-4', label: 'Draft' },
  scheduled: { icon: Clock, badge: 'border-accent/30 bg-accent/10 text-accent', label: 'Scheduled' },
  processing: { icon: Loader2, badge: 'border-warning/30 bg-amber-500/10 text-warning', label: 'Processing' },
  posted: { icon: CheckCircle2, badge: 'border-success/30 bg-green-500/10 text-success', label: 'Posted' },
  failed: { icon: XCircle, badge: 'border-danger/30 bg-red-500/10 text-danger', label: 'Failed' },
  unknown: { icon: AlertTriangle, badge: 'border-line-2 bg-white/5 text-ink-5', label: 'Read-only' },
};

function postStatus(post: ScheduledPost) {
  return post.isDraft ? 'draft' : post.status;
}

function getStatusMeta(post: ScheduledPost) {
  return statusMeta[postStatus(post)] || statusMeta.unknown;
}

function canReschedule(post: ScheduledPost) {
  return !post.isDraft && post.status === 'scheduled';
}

function canRemove(post: ScheduledPost) {
  return post.isDraft || post.status === 'scheduled';
}

function canDismiss(post: ScheduledPost) {
  return !post.isDraft && post.status === 'posted';
}

function dayKey(post: ScheduledPost) {
  if (!post.scheduledAt) return 'Drafts';
  const date = new Date(post.scheduledAt);
  return Number.isNaN(date.getTime()) ? 'Unscheduled' : date.toDateString();
}

function formatDayLabel(key: string) {
  if (key === 'Drafts' || key === 'Unscheduled') return key;
  const date = new Date(key);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(iso: string | null) {
  if (!iso) return 'No time set';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Invalid time';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatExactDate(iso: string | null) {
  if (!iso) return 'No scheduled time';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Invalid scheduled time';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' }).format(date);
}

function isVideo(media?: PostMedia) {
  return !!media && (media.mimeType?.startsWith('video/') || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(media.url));
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function postType(post: ScheduledPost) {
  if (post.mediaCount > 1) return 'Carousel';
  if (isVideo(post.media[0])) return 'Video';
  if (post.media.length === 1) return 'Image';
  return post.isDraft ? 'Draft' : 'Text post';
}

function accountLabel(id: number, accounts: SocialAccount[]) {
  const account = accounts.find((item) => item.id === id);
  return account ? `${account.platform} · @${account.username.replace(/^@/, '')}` : `Account #${id}`;
}

function localParts(iso: string | null) {
  const date = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const safe = Number.isNaN(date.getTime()) ? new Date(Date.now() + 60 * 60 * 1000) : date;
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    date: `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}`,
    time: `${pad(safe.getHours())}:${pad(safe.getMinutes())}`,
  };
}

export function ScheduleView({ configured, accounts, onPlanContent }: ScheduleViewProps) {
  const [posts, setPosts] = useState<ScheduledPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<ScheduledPost | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ScheduledPost | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [undoPost, setUndoPost] = useState<ScheduledPost | null>(null);

  const load = useCallback(async () => {
    if (!configured) return;
    setRefreshing(true);
    setError(null);
    try {
      const [nextPosts, nextDismissedIds] = await Promise.all([
        getScheduledPosts(),
        getDismissedPublishedPostIds(),
      ]);
      setPosts(nextPosts);
      setDismissedIds(nextDismissedIds);
      if (!nextDismissedIds.length) setShowHidden(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRefreshing(false);
    }
  }, [configured]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => { setNotice(null); setUndoPost(null); }, 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!menuPostId) return;
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target as Element).closest('[data-post-menu]')) setMenuPostId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuPostId(null);
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuPostId]);

  const hiddenCount = posts?.filter((post) => canDismiss(post) && dismissedIds.includes(post.id)).length || 0;
  const displayedPosts = useMemo(() => {
    if (!posts) return null;
    return showHidden
      ? posts.filter((post) => canDismiss(post) && dismissedIds.includes(post.id))
      : posts.filter((post) => !canDismiss(post) || !dismissedIds.includes(post.id));
  }, [dismissedIds, posts, showHidden]);

  const grouped = useMemo(() => {
    if (!displayedPosts) return [];
    const groups = displayedPosts.reduce<Record<string, ScheduledPost[]>>((result, post) => {
      (result[dayKey(post)] ||= []).push(post);
      return result;
    }, {});
    for (const items of Object.values(groups)) {
      items.sort((a, b) => {
        const first = new Date(a.scheduledAt || a.createdAt || 0).getTime();
        const second = new Date(b.scheduledAt || b.createdAt || 0).getTime();
        return first - second;
      });
    }
    return Object.entries(groups).sort(([a], [b]) => {
      const trailing = (key: string) => key === 'Drafts' || key === 'Unscheduled';
      if (trailing(a) !== trailing(b)) return trailing(a) ? 1 : -1;
      return new Date(a).getTime() - new Date(b).getTime();
    });
  }, [displayedPosts]);
  const openPost = (post: ScheduledPost) => setSelectedPost(post);
  const togglePostMenu = (post: ScheduledPost) => {
    setMenuPostId((current) => current === post.id ? null : post.id);
  };

  const openReschedule = (post: ScheduledPost) => {
    setMenuPostId(null);
    setSelectedPost(null);
    setRescheduleTarget(post);
  };

  const openRemove = (post: ScheduledPost) => {
    setMenuPostId(null);
    setSelectedPost(null);
    setRemoveTarget(post);
  };

  const confirmReschedule = async (post: ScheduledPost, scheduledAt: string) => {
    await reschedulePost(post.id, scheduledAt);
    await load();
    setNotice('Post rescheduled.');
  };

  const confirmRemove = async (post: ScheduledPost) => {
    if (canDismiss(post)) {
      setDismissedIds(await dismissPublishedPost(post.id));
      setUndoPost(post);
      setNotice('Post removed from Schedule.');
      return;
    }
    await removeScheduledPost(post.id);
    await load();
    setNotice(post.isDraft ? 'Draft removed.' : 'Scheduled post removed.');
  };

  const restoreHidden = async (post: ScheduledPost) => {
    const next = await restorePublishedPost(post.id);
    setDismissedIds(next);
    if (!next.length) setShowHidden(false);
    setNotice('Post restored to Schedule.');
    setUndoPost(null);
  };

  const undoDismissal = async () => {
    if (!undoPost) return;
    await restoreHidden(undoPost);
  };

  return (
    <>
      <ViewHeader
        title="Schedule"
        subtitle="The live Postbridge queue. Review, reschedule, or remove posts without re-uploading their media."
        right={(
          <div className="flex items-center gap-2">
            {hiddenCount > 0 && (
              <Button onClick={() => setShowHidden((value) => !value)}>
                {showHidden ? 'Back to Schedule' : `Show hidden posts (${hiddenCount})`}
              </Button>
            )}
            <Button onClick={onPlanContent} icon={<CalendarClock size={13} />}>Plan content</Button>
            {configured && (
              <Button
                onClick={() => void load()}
                disabled={refreshing}
                icon={<RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
            )}
          </div>
        )}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-5xl mx-auto space-y-7">
          {notice && (
            <div role="status" className="sticky top-0 z-30 mx-auto flex w-fit items-center gap-3 rounded-lg border border-success/30 bg-[#15231b] px-3 py-2 text-[12px] text-success shadow-main">
              <span>{notice}</span>
              {undoPost && <button type="button" onClick={() => void undoDismissal()} className="font-semibold underline underline-offset-2 hover:text-ink">Undo</button>}
            </div>
          )}

          {!configured ? (
            <Empty text="Add your Postbridge API key in Settings to see your scheduled posts." />
          ) : posts === null ? (
            <Loading />
          ) : (
            <>
              {error && (
                <div role="alert" className="rounded-xl border border-danger/25 bg-red-500/10 px-4 py-3 text-[12px] text-danger">
                  Refresh failed: {error}
                </div>
              )}
              {displayedPosts?.length === 0 ? (
                <Empty text={showHidden ? 'No hidden published posts.' : 'Nothing is scheduled yet. Approve a slideshow from the Queue to send it here.'} />
              ) : (
                grouped.map(([day, items]) => (
                  <section key={day} aria-labelledby={`schedule-${day.replace(/\W/g, '-')}`}>
                    <div className="mb-3 flex items-baseline gap-3">
                      <h2 id={`schedule-${day.replace(/\W/g, '-')}`} className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                        {formatDayLabel(day)}
                      </h2>
                      <span className="text-[11px] text-ink-6">{items.length} post{items.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {items.map((post) => (
                        <PostCard
                          key={post.id}
                          post={post}
                          accounts={accounts}
                          menuOpen={menuPostId === post.id}
                          onOpen={openPost}
                          onToggleMenu={togglePostMenu}
                          onReschedule={openReschedule}
                          onRemove={openRemove}
                          hidden={showHidden}
                          onRestore={restoreHidden}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          accounts={accounts}
          onClose={() => setSelectedPost(null)}
          onReschedule={() => openReschedule(selectedPost)}
          onRemove={() => openRemove(selectedPost)}
          hidden={showHidden}
          onRestore={() => { setSelectedPost(null); void restoreHidden(selectedPost); }}
        />
      )}
      {rescheduleTarget && (
        <RescheduleModal
          post={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onConfirm={async (scheduledAt) => {
            await confirmReschedule(rescheduleTarget, scheduledAt);
            setRescheduleTarget(null);
          }}
        />
      )}
      {removeTarget && (
        <RemoveModal
          post={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onConfirm={async () => {
            await confirmRemove(removeTarget);
            setRemoveTarget(null);
          }}
        />
      )}
    </>
  );
}

function PostCard({
  post,
  accounts,
  menuOpen,
  onOpen,
  onToggleMenu,
  onReschedule,
  onRemove,
  hidden,
  onRestore,
}: {
  post: ScheduledPost;
  accounts: SocialAccount[];
  menuOpen: boolean;
  onOpen: (post: ScheduledPost) => void;
  onToggleMenu: (post: ScheduledPost) => void;
  onReschedule: (post: ScheduledPost) => void;
  onRemove: (post: ScheduledPost) => void;
  hidden: boolean;
  onRestore: (post: ScheduledPost) => void;
}) {
  const meta = getStatusMeta(post);
  const StatusIcon = meta.icon;
  const accountNames = post.socialAccounts.map((id) => accountLabel(id, accounts));
  return (
    <article className="relative rounded-xl border border-line bg-surface shadow-main transition-colors hover:border-line-2 focus-within:border-line-2">
      <button type="button" onClick={() => onOpen(post)} className="flex w-full gap-4 rounded-xl p-3 pr-12 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
        <MediaPreview media={post.media[0]} count={post.mediaCount} compact />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">{formatTime(post.scheduledAt)}</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}>
              <StatusIcon size={10} className={post.status === 'processing' ? 'animate-spin' : ''} />
              {meta.label}
            </span>
          </div>
          <p className="line-clamp-2 min-h-[2.5rem] text-[12px] leading-relaxed text-ink-4">
            {post.caption || '(No caption)'}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-ink-5">{postType(post)}</span>
            {accountNames.slice(0, 2).map((name) => (
              <span key={name} className="max-w-[12rem] truncate rounded-md bg-white/5 px-2 py-1 text-[10px] capitalize text-ink-5">{name}</span>
            ))}
            {accountNames.length > 2 && <span className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-ink-5">+{accountNames.length - 2}</span>}
          </div>
        </div>
      </button>

      <div data-post-menu className="absolute right-2 top-2 z-20">
        <button
          type="button"
          onClick={() => onToggleMenu(post)}
          aria-label="Post actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-5 hover:bg-white/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div role="menu" className="absolute right-0 top-9 w-44 rounded-xl border border-line bg-raised p-1.5 shadow-xl">
            {canReschedule(post) && (
              <MenuButton icon={<CalendarClock size={14} />} onClick={() => onReschedule(post)}>Reschedule</MenuButton>
            )}
            {canRemove(post) && (
              <MenuButton icon={<Trash2 size={14} />} danger onClick={() => onRemove(post)}>Remove post</MenuButton>
            )}
            {canDismiss(post) && (hidden
              ? <MenuButton icon={<RotateCcw size={14} />} onClick={() => onRestore(post)}>Restore to Schedule</MenuButton>
              : <MenuButton icon={<Trash2 size={14} />} onClick={() => onRemove(post)}>Remove from Schedule</MenuButton>
            )}
            {!canReschedule(post) && !canRemove(post) && !canDismiss(post) && (
              <div className="px-2.5 py-2 text-[11px] leading-relaxed text-ink-6">This status is read-only.</div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function MenuButton({ children, icon, danger, onClick }: { children: string; icon: React.ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] ${danger ? 'text-danger hover:bg-red-500/10' : 'text-ink-3 hover:bg-white/[0.06] hover:text-ink'}`}
    >
      {icon}{children}
    </button>
  );
}

function MediaPreview({ media, count = 0, compact = false }: { media?: PostMedia; count?: number; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  // Preserve the original reset behavior when a refreshed post returns a new media URL.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setFailed(false), [media?.url]);
  const duration = media ? formatDuration(media.duration) : null;
  const video = isVideo(media);
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-lg border border-line bg-raised ${compact ? 'h-32 w-[4.5rem]' : 'aspect-[9/16] w-full'}`}>
      {!media || failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-6">
          <ImageIcon size={compact ? 18 : 28} />
          {!compact && <span className="text-[10px]">Preview unavailable</span>}
        </div>
      ) : video ? (
        <video src={media.url} muted playsInline preload="metadata" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <img src={media.url} alt="Post preview" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      )}
      {media && !failed && video && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/10 text-white drop-shadow"><Play size={compact ? 18 : 28} fill="currentColor" /></span>
      )}
      {duration && <span className="absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[9px] text-white">{duration}</span>}
      {count > 1 && (
        <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] text-white">
          <Images size={10} /> {count}
        </span>
      )}
    </div>
  );
}

function PostDetailModal({ post, accounts, onClose, onReschedule, onRemove, hidden, onRestore }: {
  post: ScheduledPost;
  accounts: SocialAccount[];
  onClose: () => void;
  onReschedule: () => void;
  onRemove: () => void;
  hidden: boolean;
  onRestore: () => void;
}) {
  const [mediaIndex, setMediaIndex] = useState(0);
  const [detailMedia, setDetailMedia] = useState(post.media);
  const [loadingMedia, setLoadingMedia] = useState(post.mediaCount > post.media.length);
  const [mediaLoadFailed, setMediaLoadFailed] = useState(false);
  const meta = getStatusMeta(post);
  const StatusIcon = meta.icon;

  useEffect(() => {
    if (post.mediaCount <= post.media.length) return;
    let cancelled = false;
    getScheduledPostMedia(post.id)
      .then((media) => {
        if (!cancelled && media.length) setDetailMedia(media);
      })
      .catch(() => {
        if (!cancelled) setMediaLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingMedia(false);
      });
    return () => { cancelled = true; };
  }, [post.id, post.media.length, post.mediaCount]);

  return (
    <ModalShell title="Scheduled post details" onClose={onClose} wide>
      <div className="grid gap-6 p-5 sm:grid-cols-[15rem_1fr] sm:p-6">
        <div>
          <MediaPreview key={detailMedia[mediaIndex]?.url || 'empty'} media={detailMedia[mediaIndex]} count={post.mediaCount} />
          {loadingMedia && <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-6"><Loader2 size={11} className="animate-spin" /> Loading carousel…</div>}
          {mediaLoadFailed && <div className="mt-2 text-[10px] text-ink-6">Some carousel previews are unavailable.</div>}
          {detailMedia.length > 1 && (
            <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Carousel media">
              {detailMedia.map((media, index) => (
                <button
                  key={`${media.url}-${index}`}
                  type="button"
                  onClick={() => setMediaIndex(index)}
                  aria-label={`Show carousel item ${index + 1}`}
                  className={`h-16 w-10 shrink-0 overflow-hidden rounded-md border ${index === mediaIndex ? 'border-accent' : 'border-line opacity-70 hover:opacity-100'}`}
                >
                  {isVideo(media)
                    ? <video src={media.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    : <img src={media.url} alt="" className="h-full w-full object-cover" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.badge}`}>
              <StatusIcon size={12} className={post.status === 'processing' ? 'animate-spin' : ''} /> {meta.label}
            </span>
            <span className="rounded-full border border-line bg-white/5 px-2.5 py-1 text-[11px] text-ink-4">{postType(post)}</span>
          </div>

          <div className="mt-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-6">Date and time</div>
            <div className="mt-1.5 text-[13px] text-ink-2">{formatExactDate(post.scheduledAt)}</div>
          </div>

          <div className="mt-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-6">Accounts</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {post.socialAccounts.length ? post.socialAccounts.map((id) => (
                <span key={id} className="rounded-lg border border-line bg-white/5 px-2.5 py-1.5 text-[11px] capitalize text-ink-4">{accountLabel(id, accounts)}</span>
              )) : <span className="text-[12px] text-ink-6">No account data returned.</span>}
            </div>
          </div>

          <div className="mt-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-6">Caption and hashtags</div>
            <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-black/10 p-3 text-[12px] leading-relaxed text-ink-3">
              {post.caption || '(No caption)'}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            {canRemove(post) && <Button variant="danger-ghost" icon={<Trash2 size={14} />} onClick={onRemove}>Remove</Button>}
            {canDismiss(post) && (hidden
              ? <Button icon={<RotateCcw size={14} />} onClick={onRestore}>Restore to Schedule</Button>
              : <Button icon={<Trash2 size={14} />} onClick={onRemove}>Remove from Schedule</Button>
            )}
            {canReschedule(post) && <Button variant="primary" icon={<CalendarClock size={14} />} onClick={onReschedule}>Reschedule</Button>}
            {!canReschedule(post) && !canRemove(post) && !canDismiss(post) && <span className="self-center text-[11px] text-ink-6">This post is read-only.</span>}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function RescheduleModal({ post, onClose, onConfirm }: { post: ScheduledPost; onClose: () => void; onConfirm: (scheduledAt: string) => Promise<void> }) {
  const initial = localParts(post.scheduledAt);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!date || !time) return setError('Choose both a date and time.');
    const when = new Date(`${date}T${time}`);
    if (Number.isNaN(when.getTime())) return setError('Choose a valid date and time.');
    if (when.getTime() <= Date.now()) return setError('Choose a time in the future.');
    setSaving(true);
    try {
      await onConfirm(when.toISOString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Reschedule post" onClose={onClose} closeDisabled={saving}>
      <form onSubmit={(event) => void submit(event)} className="p-5 sm:p-6">
        <p className="text-[12px] leading-relaxed text-ink-5">Change this post's existing Postbridge schedule. Its caption, accounts, and media stay untouched.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="text-[11px] font-medium text-ink-4">
            Date
            <input autoFocus type="date" value={date} min={localParts(new Date().toISOString()).date} onChange={(event) => setDate(event.target.value)} disabled={saving} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-control px-3 text-[12px] text-ink outline-none focus:border-accent disabled:opacity-50" />
          </label>
          <label className="text-[11px] font-medium text-ink-4">
            Time
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} disabled={saving} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-control px-3 text-[12px] text-ink outline-none focus:border-accent disabled:opacity-50" />
          </label>
        </div>
        <p className="mt-2 text-[10px] text-ink-6">Timezone: {timezone}</p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving} icon={saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}>
            {saving ? 'Updating…' : 'Update schedule'}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function RemoveModal({ post, onClose, onConfirm }: { post: ScheduledPost; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localOnly = canDismiss(post);

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await onConfirm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setRemoving(false);
    }
  };

  return (
    <ModalShell title={localOnly ? 'Remove from Schedule?' : post.isDraft ? 'Remove draft?' : 'Remove scheduled post?'} onClose={onClose} closeDisabled={removing}>
      <div className="p-5 sm:p-6">
        <div className={`flex gap-3 rounded-xl border p-3.5 ${localOnly ? 'border-accent/20 bg-sky-500/10' : 'border-danger/20 bg-red-500/10'}`}>
          <AlertTriangle size={18} className={`mt-0.5 shrink-0 ${localOnly ? 'text-accent' : 'text-danger'}`} />
          <p className="text-[12px] leading-relaxed text-ink-3">{localOnly
            ? 'This removes the post from your Schedule view. The published post and its analytics will remain available.'
            : 'This deletes the post from Postbridge. It will disappear from this schedule and cannot be undone.'}</p>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button autoFocus onClick={onClose} disabled={removing}>Cancel</Button>
          <Button variant={localOnly ? 'primary' : 'danger-ghost'} onClick={() => void remove()} disabled={removing} icon={removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}>
            {removing ? 'Removing…' : localOnly ? 'Remove from Schedule' : 'Remove from Postbridge'}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, closeDisabled, wide, children }: { title: string; onClose: () => void; closeDisabled?: boolean; wide?: boolean; children: React.ReactNode }) {
  const titleId = `modal-${title.toLowerCase().replace(/\W+/g, '-')}`;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeDisabled, onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !closeDisabled && onClose()}>
      <div className={`max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <h2 id={titleId} className="text-[14px] font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} disabled={closeDisabled} aria-label="Close dialog" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-5 hover:bg-white/[0.06] hover:text-ink disabled:opacity-40"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Loading() {
  return <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-ink-5"><Loader2 size={14} className="animate-spin text-accent" /> Loading from Postbridge…</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="mx-auto max-w-md py-16 text-center text-[13px] leading-relaxed text-ink-5">{text}</div>;
}
