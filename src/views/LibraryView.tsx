import { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, Trash2, X, ImageIcon, Video, Link2 } from 'lucide-react';
import type { LibraryImage, VideoAsset } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import {
  getLibrary,
  scrapePinterest,
  deleteLibraryImage,
  getVideos,
  importVideo as importVideoAsset,
  scrapeVideos as scrapeVideoAssets,
  deleteVideo,
} from '../lib/api';

interface LibraryViewProps {
  hasApify: boolean;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function LibraryView({ hasApify }: LibraryViewProps) {
  const [tab, setTab] = useState<'images' | 'videos'>('images');
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [videos, setVideos] = useState<VideoAsset[] | null>(null);
  const [searches, setSearches] = useState('');
  const [count, setCount] = useState(40);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<LibraryImage | null>(null);
  const [videoPreview, setVideoPreview] = useState<VideoAsset | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoPack, setVideoPack] = useState('');
  const [videoSource, setVideoSource] = useState('');
  const [videoCount, setVideoCount] = useState(5);
  const [videoBusy, setVideoBusy] = useState<'import' | 'scrape' | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoNote, setVideoNote] = useState<string | null>(null);

  const loadImages = () => getLibrary().then(setImages).catch((e) => setError(e.message));
  const loadVideos = () => getVideos().then(setVideos).catch((e) => setVideoError(e.message));

  useEffect(() => {
    void loadImages();
    void loadVideos();
  }, []);

  const scrape = async () => {
    setError(null);
    setNote(null);
    setScraping(true);
    try {
      const queries = searches.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await scrapePinterest(queries, count);
      setNote(`Added ${r.added} image${r.added === 1 ? '' : 's'} from ${r.found} found.`);
      await loadImages();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScraping(false);
    }
  };

  const importVideo = async () => {
    setVideoError(null);
    setVideoNote(null);
    setVideoBusy('import');
    try {
      const r = await importVideoAsset(videoUrl.trim(), videoPack.trim() || undefined);
      setVideoNote(`Added ${r.added} video.`);
      setVideoUrl('');
      setVideoPack('');
      await loadVideos();
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : String(e));
    } finally {
      setVideoBusy(null);
    }
  };

  const scrapeVideo = async () => {
    setVideoError(null);
    setVideoNote(null);
    setVideoBusy('scrape');
    try {
      const r = await scrapeVideoAssets(videoSource.trim(), videoCount);
      setVideoNote(`Added ${r.added} video${r.added === 1 ? '' : 's'} from ${r.found} found.`);
      await loadVideos();
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : String(e));
    } finally {
      setVideoBusy(null);
    }
  };

  const remove = async (id: string) => setImages(await deleteLibraryImage(id));
  const removeVideo = async (id: string) => {
    setVideos(await deleteVideo(id));
    setVideoPreview((current) => (current?.id === id ? null : current));
  };

  const groups = useMemo(() => {
    const map = new Map<string, LibraryImage[]>();
    for (const img of images || []) {
      if (!map.has(img.pack)) map.set(img.pack, []);
      map.get(img.pack)!.push(img);
    }
    return [...map.entries()];
  }, [images]);

  const videoGroups = useMemo(() => {
    const map = new Map<string, VideoAsset[]>();
    for (const video of videos || []) {
      if (!map.has(video.pack)) map.set(video.pack, []);
      map.get(video.pack)!.push(video);
    }
    return [...map.entries()];
  }, [videos]);

  return (
    <>
      <ViewHeader
        title="Library"
        subtitle="Background assets for your posts. Images power carousels; videos power single MP4 posts."
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-8 pt-4">
          <div className="max-w-6xl mx-auto">
            <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-main">
              <button
                type="button"
                onClick={() => setTab('images')}
                className={`h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 ${
                  tab === 'images' ? 'bg-control text-ink' : 'text-ink-5 hover:text-ink hover:bg-white/[0.055]'
                }`}
              >
                <ImageIcon size={13} /> Images
              </button>
              <button
                type="button"
                onClick={() => setTab('videos')}
                className={`h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 ${
                  tab === 'videos' ? 'bg-control text-ink' : 'text-ink-5 hover:text-ink hover:bg-white/[0.055]'
                }`}
              >
                <Video size={13} /> Videos
              </button>
            </div>
          </div>
        </div>

        {tab === 'images' ? (
          <>
            <div className="px-4 sm:px-8 py-4">
              <div className="max-w-6xl mx-auto">
                <div className="flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <label className="text-[11px] text-ink-5 mb-1 block">Pinterest searches</label>
                    <input
                      value={searches}
                      onChange={(e) => setSearches(e.target.value)}
                      placeholder="e.g. dark moody aesthetic, cozy bedroom, foggy mountain"
                      disabled={!hasApify}
                      className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2 disabled:opacity-50"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-[11px] text-ink-5 mb-1 block">Max</label>
                    <input
                      type="number"
                      value={count}
                      min={10}
                      max={200}
                      onChange={(e) => setCount(Number(e.target.value))}
                      onBlur={() => setCount((c) => Math.min(Math.max(c || 10, 10), 200))}
                      disabled={!hasApify}
                      className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-ink-6 mt-1 block">min 10</span>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    className="mt-5"
                    icon={scraping ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    onClick={scrape}
                    disabled={!hasApify || scraping || !searches.trim()}
                  >
                    {scraping ? 'Scraping...' : 'Scrape Pinterest'}
                  </Button>
                </div>
                {!hasApify && (
                  <p className="text-[12px] text-ink-5 mt-2">
                    Add your Apify API key in Settings to scrape Pinterest. The bundled packs below work without it.
                  </p>
                )}
                {note && <p className="text-[12px] text-success mt-2">{note}</p>}
                {error && <p className="text-[12px] text-danger mt-2">{error}</p>}
              </div>
            </div>

            <div className="p-4 sm:p-8">
              <div className="max-w-6xl mx-auto space-y-8">
                {images === null ? (
                  <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
                    <Loader2 size={14} className="animate-spin text-accent" /> Loading library...
                  </div>
                ) : (
                  groups.map(([pack, imgs]) => (
                    <div key={pack} className="fade-up">
                      <div className="flex items-baseline gap-3 mb-3">
                        <h2 className="text-[12px] font-semibold text-ink-3 uppercase tracking-[0.12em]">{pack}</h2>
                        <span className="text-[11px] text-ink-6">{imgs.length} images</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 xl:grid-cols-9 gap-2">
                        {imgs.map((img) => (
                          <div
                            key={img.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setPreview(img)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') setPreview(img);
                            }}
                            className="group relative aspect-[9/16] cursor-zoom-in rounded-lg overflow-hidden bg-raised border border-line shadow-main transition-all hover:-translate-y-0.5 hover:border-line-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                            {img.source === 'scraped' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  remove(img.id);
                                }}
                                aria-label="Remove image"
                                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/70 text-white border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="px-4 sm:px-8 py-4">
              <div className="max-w-6xl mx-auto space-y-4">
                <div className="flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <label className="text-[11px] text-ink-5 mb-1 block">Direct video URL</label>
                    <input
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://.../background.mp4"
                      className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2"
                    />
                  </div>
                  <div className="w-44">
                    <label className="text-[11px] text-ink-5 mb-1 block">Pack</label>
                    <input
                      value={videoPack}
                      onChange={(e) => setVideoPack(e.target.value)}
                      placeholder="Imported"
                      className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2"
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    className="mt-5"
                    icon={videoBusy === 'import' ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                    onClick={importVideo}
                    disabled={videoBusy !== null || !videoUrl.trim()}
                  >
                    {videoBusy === 'import' ? 'Importing...' : 'Import video'}
                  </Button>
                </div>

                <div className="flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <label className="text-[11px] text-ink-5 mb-1 block">TikTok source</label>
                    <input
                      value={videoSource}
                      onChange={(e) => setVideoSource(e.target.value)}
                      placeholder="TikTok URL, @profile, #hashtag, or search"
                      disabled={!hasApify}
                      className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2 disabled:opacity-50"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-[11px] text-ink-5 mb-1 block">Max</label>
                    <input
                      type="number"
                      value={videoCount}
                      min={1}
                      max={20}
                      onChange={(e) => setVideoCount(Number(e.target.value))}
                      onBlur={() => setVideoCount((c) => Math.min(Math.max(c || 1, 1), 20))}
                      disabled={!hasApify}
                      className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-ink-6 mt-1 block">max 20</span>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    className="mt-5"
                    icon={videoBusy === 'scrape' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    onClick={scrapeVideo}
                    disabled={!hasApify || videoBusy !== null || !videoSource.trim()}
                  >
                    {videoBusy === 'scrape' ? 'Scraping...' : 'Scrape videos'}
                  </Button>
                </div>

                {!hasApify && (
                  <p className="text-[12px] text-ink-5">
                    Add your Apify API key in Settings to scrape video sources. Direct MP4/WebM imports work without it.
                  </p>
                )}
                {videoNote && <p className="text-[12px] text-success">{videoNote}</p>}
                {videoError && <p className="text-[12px] text-danger">{videoError}</p>}
              </div>
            </div>

            <div className="p-4 sm:p-8">
              <div className="max-w-6xl mx-auto space-y-8">
                {videos === null ? (
                  <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
                    <Loader2 size={14} className="animate-spin text-accent" /> Loading videos...
                  </div>
                ) : videos.length === 0 ? (
                  <div className="text-center py-16 text-[13px] text-ink-5">
                    No background videos yet. Import a direct video URL or scrape one with Apify.
                  </div>
                ) : (
                  videoGroups.map(([pack, items]) => (
                    <div key={pack} className="fade-up">
                      <div className="flex items-baseline gap-3 mb-3">
                        <h2 className="text-[12px] font-semibold text-ink-3 uppercase tracking-[0.12em]">{pack}</h2>
                        <span className="text-[11px] text-ink-6">{items.length} videos</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                        {items.map((video) => (
                          <div
                            key={video.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setVideoPreview(video)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') setVideoPreview(video);
                            }}
                            className="group relative aspect-[9/16] cursor-zoom-in rounded-lg overflow-hidden bg-raised border border-line shadow-main transition-all hover:-translate-y-0.5 hover:border-line-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            <video src={video.url} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <div className="text-[11px] text-white font-medium truncate">{video.source}</div>
                              {formatDuration(video.duration) && (
                                <div className="text-[10px] text-white/70">{formatDuration(video.duration)}</div>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void removeVideo(video.id);
                              }}
                              aria-label="Remove video"
                              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/70 text-white border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={preview.url}
              alt=""
              className="max-h-[92vh] max-w-[92vw] rounded-xl border border-line bg-raised object-contain shadow-main"
            />
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => setPreview(null)}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/70 text-white hover:bg-black"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {videoPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setVideoPreview(null)}
        >
          <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <video
              src={videoPreview.url}
              controls
              autoPlay
              playsInline
              className="max-h-[92vh] max-w-[92vw] rounded-xl border border-line bg-black object-contain shadow-main"
            />
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => setVideoPreview(null)}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/70 text-white hover:bg-black"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
