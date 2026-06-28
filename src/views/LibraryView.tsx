import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Edit3,
  Folder,
  FolderPlus,
  ImageIcon,
  Link2,
  Loader2,
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type { LibraryFolder, LibraryImage, VideoAsset } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import {
  createLibraryFolder,
  deleteLibraryFolder,
  deleteLibraryImage,
  deleteVideo,
  getLibrary,
  getLibraryFolders,
  getVideos,
  importImages,
  importVideo as importVideoAsset,
  importVideos,
  moveLibraryAsset,
  scrapePinterest,
  scrapeVideos as scrapeVideoAssets,
  updateLibraryFolder,
} from '../lib/api';

interface LibraryViewProps {
  hasApify: boolean;
}

type MediaFilter = 'all' | 'images' | 'videos';

const ALL_FOLDER_ID = 'all';
const UNCATEGORIZED_FOLDER_ID = 'folder:uncategorized';
const BUNDLED_FOLDER_ID = 'folder:bundled';
const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm';
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm)$/i;
const MAX_DEVICE_VIDEO_BYTES = 300 * 1024 * 1024;

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function folderName(folders: LibraryFolder[], id: string) {
  if (id === ALL_FOLDER_ID) return 'All assets';
  return folders.find((folder) => folder.id === id)?.name || 'Folder';
}

function assetText(image?: LibraryImage, video?: VideoAsset) {
  if (image) return [image.pack, image.source, image.originalName].filter(Boolean).join(' ');
  if (video) return [video.pack, video.source, video.originalName, video.originalUrl].filter(Boolean).join(' ');
  return '';
}

export function LibraryView({ hasApify }: LibraryViewProps) {
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState(ALL_FOLDER_ID);
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [videos, setVideos] = useState<VideoAsset[] | null>(null);
  const [search, setSearch] = useState('');
  const [searches, setSearches] = useState('');
  const [count, setCount] = useState(40);
  const [scrapeFolderId, setScrapeFolderId] = useState(UNCATEGORIZED_FOLDER_ID);
  const [importFolderId, setImportFolderId] = useState(UNCATEGORIZED_FOLDER_ID);
  const [scraping, setScraping] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<LibraryImage | null>(null);
  const [videoPreview, setVideoPreview] = useState<VideoAsset | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoPack, setVideoPack] = useState('');
  const [videoSource, setVideoSource] = useState('');
  const [videoCount, setVideoCount] = useState(5);
  const [videoFolderId, setVideoFolderId] = useState('folder:videos');
  const [videoImportFolderId, setVideoImportFolderId] = useState(UNCATEGORIZED_FOLDER_ID);
  const [videoBusy, setVideoBusy] = useState<'import' | 'scrape' | 'file' | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoNote, setVideoNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadImages = useCallback(() => getLibrary().then(setImages).catch((e) => setError(e.message)), []);
  const loadVideos = useCallback(() => getVideos().then(setVideos).catch((e) => setVideoError(e.message)), []);
  const loadFolders = useCallback(() => getLibraryFolders().then(setFolders).catch(() => setFolders([])), []);
  const reloadAll = useCallback(async () => {
    await Promise.all([loadImages(), loadVideos(), loadFolders()]);
  }, [loadFolders, loadImages, loadVideos]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  const imageFolders = folders.filter((folder) => folder.type !== 'video' && folder.id !== BUNDLED_FOLDER_ID);
  const movableFolders = folders.filter((folder) => !folder.readonly);
  const targetFolderOptions = folders.filter((folder) => folder.id !== BUNDLED_FOLDER_ID);

  const folderSummaries = useMemo(() => {
    const imageList = images || [];
    const videoList = videos || [];
    return folders.map((folder) => {
      const folderImages = imageList.filter((image) => (image.folderId || UNCATEGORIZED_FOLDER_ID) === folder.id);
      const folderVideos = videoList.filter((video) => (video.folderId || 'folder:videos') === folder.id);
      return {
        folder,
        imageCount: folderImages.length,
        videoCount: folderVideos.length,
        previews: [
          ...folderImages.slice(0, 4).map((image) => ({ type: 'image' as const, url: image.url })),
          ...folderVideos.slice(0, Math.max(0, 4 - folderImages.length)).map((video) => ({ type: 'video' as const, url: video.url })),
        ].slice(0, 4),
      };
    });
  }, [folders, images, videos]);

  const visibleImages = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (images || []).filter((image) => {
      if (mediaFilter === 'videos') return false;
      if (selectedFolderId !== ALL_FOLDER_ID && (image.folderId || UNCATEGORIZED_FOLDER_ID) !== selectedFolderId) return false;
      return !needle || assetText(image).toLowerCase().includes(needle);
    });
  }, [images, mediaFilter, search, selectedFolderId]);

  const visibleVideos = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (videos || []).filter((video) => {
      if (mediaFilter === 'images') return false;
      if (selectedFolderId !== ALL_FOLDER_ID && (video.folderId || 'folder:videos') !== selectedFolderId) return false;
      return !needle || assetText(undefined, video).toLowerCase().includes(needle);
    });
  }, [videos, mediaFilter, search, selectedFolderId]);

  const scrape = async () => {
    setError(null);
    setNote(null);
    setScraping(true);
    try {
      const queries = searches.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await scrapePinterest(queries, count, scrapeFolderId);
      setNote(`Added ${r.added} image${r.added === 1 ? '' : 's'} from ${r.found} found.`);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScraping(false);
    }
  };

  const importSelectedImages = async (files: FileList | null) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setError(null);
    setNote(null);
    setImporting(true);
    try {
      const r = await importImages(selected, importFolderId);
      setNote(`Added ${r.added} image${r.added === 1 ? '' : 's'}.`);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const importVideo = async () => {
    setVideoError(null);
    setVideoNote(null);
    setVideoBusy('import');
    try {
      const r = await importVideoAsset(videoUrl.trim(), videoPack.trim() || undefined, videoFolderId);
      setVideoNote(`Added ${r.added} video.`);
      setVideoUrl('');
      setVideoPack('');
      await reloadAll();
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : String(e));
    } finally {
      setVideoBusy(null);
    }
  };

  const importSelectedVideos = async (files: FileList | null) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const valid: File[] = [];
    const skipped: string[] = [];
    for (const file of selected) {
      const supportedType = !file.type || file.type.startsWith('video/') || file.type === 'application/octet-stream';
      if (!supportedType || !VIDEO_EXT_RE.test(file.name)) skipped.push(file.name);
      else if (file.size > MAX_DEVICE_VIDEO_BYTES) skipped.push(`${file.name} is over 300 MB`);
      else valid.push(file);
    }
    if (!valid.length) {
      setVideoError('Choose MP4, MOV, WebM, or M4V files under 300 MB.');
      if (videoFileInputRef.current) videoFileInputRef.current.value = '';
      return;
    }
    setVideoError(null);
    setVideoNote(null);
    setVideoBusy('file');
    try {
      const r = await importVideos(valid, videoImportFolderId);
      const failed = [...skipped, ...(r.failed || []).map((item) => `${item.name}: ${item.error}`)];
      setVideoNote(`Added ${r.added} video${r.added === 1 ? '' : 's'}${failed.length ? ` (${failed.length} skipped)` : ''}.`);
      await reloadAll();
      window.dispatchEvent(new Event('postfarm:library-changed'));
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : String(e));
    } finally {
      setVideoBusy(null);
      if (videoFileInputRef.current) videoFileInputRef.current.value = '';
    }
  };

  const scrapeVideo = async () => {
    setVideoError(null);
    setVideoNote(null);
    setVideoBusy('scrape');
    try {
      const r = await scrapeVideoAssets(videoSource.trim(), videoCount, undefined, videoFolderId);
      setVideoNote(`Added ${r.added} video${r.added === 1 ? '' : 's'} from ${r.found} found.`);
      await reloadAll();
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : String(e));
    } finally {
      setVideoBusy(null);
    }
  };

  const createFolder = async () => {
    const name = window.prompt('Folder name');
    if (!name?.trim()) return;
    await createLibraryFolder(name.trim(), mediaFilter === 'videos' ? 'video' : mediaFilter === 'images' ? 'image' : 'mixed');
    await loadFolders();
  };

  const renameFolder = async (folder: LibraryFolder) => {
    const name = window.prompt('Rename folder', folder.name);
    if (!name?.trim()) return;
    await updateLibraryFolder(folder.id, { name: name.trim(), type: folder.type });
    await loadFolders();
  };

  const removeFolder = async (folder: LibraryFolder) => {
    if (!window.confirm(`Delete "${folder.name}"? Assets will move to Uncategorized.`)) return;
    await deleteLibraryFolder(folder.id);
    setSelectedFolderId(ALL_FOLDER_ID);
    await reloadAll();
  };

  const removeImage = async (id: string) => {
    setError(null);
    try {
      setImages(await deleteLibraryImage(id));
      setPreview((current) => (current?.id === id ? null : current));
      window.dispatchEvent(new Event('postfarm:library-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeVideo = async (id: string) => {
    setVideoError(null);
    try {
      setVideos(await deleteVideo(id));
      setVideoPreview((current) => (current?.id === id ? null : current));
      window.dispatchEvent(new Event('postfarm:library-changed'));
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : String(e));
    }
  };

  const moveAsset = async (id: string, folderId: string, type: 'image' | 'video') => {
    const next = await moveLibraryAsset(id, folderId, type);
    if (type === 'video') setVideos(next as VideoAsset[]);
    else setImages(next as LibraryImage[]);
    await loadFolders();
  };

  const loading = images === null || videos === null;
  const selectedFolderName = folderName(folders, selectedFolderId);

  return (
    <>
      <ViewHeader
        title="Library"
        subtitle="Organize image and video backgrounds into clean folders without losing pack-based generation."
        right={
          <Button variant="secondary" icon={<FolderPlus size={13} />} onClick={createFolder}>
            New folder
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-8 pt-4">
          <div className="max-w-6xl mx-auto space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-main">
                {(['all', 'images', 'videos'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setMediaFilter(filter)}
                    className={`h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 ${
                      mediaFilter === filter ? 'bg-control text-ink' : 'text-ink-5 hover:text-ink hover:bg-white/[0.055]'
                    }`}
                  >
                    {filter === 'videos' ? <Video size={13} /> : filter === 'images' ? <ImageIcon size={13} /> : <Folder size={13} />}
                    {filter[0].toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[220px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-6" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search assets"
                  className="w-full h-10 bg-raised border border-line rounded-lg pl-8 pr-3 text-[12px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2"
                />
              </div>
            </div>

            {selectedFolderId !== ALL_FOLDER_ID && (
              <div className="flex items-center gap-2 text-[12px] text-ink-5">
                <button onClick={() => setSelectedFolderId(ALL_FOLDER_ID)} className="inline-flex items-center gap-1 text-ink-4 hover:text-ink">
                  <ArrowLeft size={13} /> Library
                </button>
                <span>/</span>
                <span className="text-ink">{selectedFolderName}</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-8 py-4">
          <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface p-4 shadow-main space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-[12px] font-semibold text-ink-3 uppercase tracking-[0.12em]">Images</h2>
                  <p className="text-[11px] text-ink-6 mt-0.5">Import your own, or scrape Pinterest.</p>
                </div>
                <select
                  value={importFolderId}
                  onChange={(e) => {
                    setImportFolderId(e.target.value);
                    setScrapeFolderId(e.target.value);
                  }}
                  className="h-9 max-w-[190px] bg-raised border border-line rounded-lg px-2 text-[12px] text-ink outline-none"
                >
                  {imageFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => void importSelectedImages(e.target.files)}
              />
              <div className="flex items-start gap-2 flex-wrap">
                <Button
                  variant="primary"
                  icon={importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? 'Importing...' : 'Import images'}
                </Button>
                <div className="flex-1 min-w-[220px]">
                  <input
                    value={searches}
                    onChange={(e) => setSearches(e.target.value)}
                    placeholder="Pinterest searches"
                    disabled={!hasApify || scraping}
                    className="w-full h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2 disabled:opacity-50"
                  />
                </div>
                <input
                  type="number"
                  value={count}
                  min={10}
                  max={200}
                  onChange={(e) => setCount(Number(e.target.value))}
                  onBlur={() => setCount((c) => Math.min(Math.max(c || 10, 10), 200))}
                  disabled={!hasApify || scraping}
                  className="w-20 h-9 bg-raised border border-line rounded-lg px-2 text-[12px] text-ink outline-none focus:border-line-2 disabled:opacity-50"
                />
                <Button
                  variant="secondary"
                  icon={scraping ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  onClick={scrape}
                  disabled={!hasApify || scraping || !searches.trim()}
                >
                  {scraping ? 'Scraping...' : 'Scrape'}
                </Button>
              </div>
              {!hasApify && <p className="text-[11px] text-ink-6">Add your Apify key in Settings to scrape. Imports work without it.</p>}
              {note && <p className="text-[12px] text-success">{note}</p>}
              {error && <p className="text-[12px] text-danger">{error}</p>}
            </div>

            <div className="rounded-xl border border-line bg-surface p-4 shadow-main space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-[12px] font-semibold text-ink-3 uppercase tracking-[0.12em]">Videos</h2>
                  <p className="text-[11px] text-ink-6 mt-0.5">Import direct URLs or scrape TikTok backgrounds.</p>
                </div>
                <select
                  value={videoFolderId}
                  onChange={(e) => setVideoFolderId(e.target.value)}
                  className="h-9 max-w-[190px] bg-raised border border-line rounded-lg px-2 text-[12px] text-ink outline-none"
                >
                  {targetFolderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>
              <input
                ref={videoFileInputRef}
                type="file"
                accept={VIDEO_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => void importSelectedVideos(e.target.files)}
              />
              <div className="flex items-start gap-2 flex-wrap">
                <Button
                  variant="primary"
                  icon={videoBusy === 'file' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  onClick={() => videoFileInputRef.current?.click()}
                  disabled={videoBusy !== null}
                >
                  {videoBusy === 'file' ? 'Importing...' : 'Import videos'}
                </Button>
                <select
                  value={videoImportFolderId}
                  onChange={(e) => setVideoImportFolderId(e.target.value)}
                  disabled={videoBusy === 'file'}
                  className="h-9 max-w-[190px] bg-raised border border-line rounded-lg px-2 text-[12px] text-ink outline-none disabled:opacity-50"
                >
                  {targetFolderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-start gap-2 flex-wrap">
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Direct MP4/WebM URL"
                  className="flex-1 min-w-[220px] h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2"
                />
                <input
                  value={videoPack}
                  onChange={(e) => setVideoPack(e.target.value)}
                  placeholder="Pack"
                  className="w-28 h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2"
                />
                <Button
                  variant="secondary"
                  icon={videoBusy === 'import' ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                  onClick={importVideo}
                  disabled={videoBusy !== null || !videoUrl.trim()}
                >
                  Import
                </Button>
              </div>
              <div className="flex items-start gap-2 flex-wrap">
                <input
                  value={videoSource}
                  onChange={(e) => setVideoSource(e.target.value)}
                  placeholder="TikTok URL, @profile, #hashtag, or search"
                  disabled={!hasApify || videoBusy !== null}
                  className="flex-1 min-w-[220px] h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2 disabled:opacity-50"
                />
                <input
                  type="number"
                  value={videoCount}
                  min={1}
                  max={20}
                  onChange={(e) => setVideoCount(Number(e.target.value))}
                  onBlur={() => setVideoCount((c) => Math.min(Math.max(c || 1, 1), 20))}
                  disabled={!hasApify || videoBusy !== null}
                  className="w-20 h-9 bg-raised border border-line rounded-lg px-2 text-[12px] text-ink outline-none focus:border-line-2 disabled:opacity-50"
                />
                <Button
                  variant="secondary"
                  icon={videoBusy === 'scrape' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  onClick={scrapeVideo}
                  disabled={!hasApify || videoBusy !== null || !videoSource.trim()}
                >
                  Scrape
                </Button>
              </div>
              {videoNote && <p className="text-[12px] text-success">{videoNote}</p>}
              {videoError && <p className="text-[12px] text-danger">{videoError}</p>}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-8 pt-0">
          <div className="max-w-6xl mx-auto space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
                <Loader2 size={14} className="animate-spin text-accent" /> Loading library...
              </div>
            ) : (
              <>
                {selectedFolderId === ALL_FOLDER_ID && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {folderSummaries.map((summary) => (
                      <FolderCard
                        key={summary.folder.id}
                        summary={summary}
                        onOpen={() => setSelectedFolderId(summary.folder.id)}
                        onRename={() => void renameFolder(summary.folder)}
                        onDelete={() => void removeFolder(summary.folder)}
                      />
                    ))}
                  </div>
                )}

                <div>
                  <div className="flex items-baseline gap-3 mb-3">
                    <h2 className="text-[12px] font-semibold text-ink-3 uppercase tracking-[0.12em]">
                      {selectedFolderId === ALL_FOLDER_ID ? 'All assets' : selectedFolderName}
                    </h2>
                    <span className="text-[11px] text-ink-6">
                      {visibleImages.length} images · {visibleVideos.length} videos
                    </span>
                  </div>

                  {!visibleImages.length && !visibleVideos.length ? (
                    <div className="text-center py-16 text-[13px] text-ink-5">
                      No assets here yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-7 gap-3">
                      {visibleImages.map((image) => (
                        <ImageAssetCard
                          key={image.id}
                          image={image}
                          folders={movableFolders}
                          onPreview={() => setPreview(image)}
                          onDelete={() => void removeImage(image.id)}
                          onMove={(folderId) => void moveAsset(image.id, folderId, 'image')}
                        />
                      ))}
                      {visibleVideos.map((video) => (
                        <VideoAssetCard
                          key={video.id}
                          video={video}
                          folders={movableFolders}
                          onPreview={() => setVideoPreview(video)}
                          onDelete={() => void removeVideo(video.id)}
                          onMove={(folderId) => void moveAsset(video.id, folderId, 'video')}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
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
            <CloseButton onClick={() => setPreview(null)} />
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
              playsInline
              className="max-h-[92vh] max-w-[92vw] rounded-xl border border-line bg-black object-contain shadow-main"
            />
            <CloseButton onClick={() => setVideoPreview(null)} />
          </div>
        </div>
      )}
    </>
  );
}

function FolderCard({
  summary,
  onOpen,
  onRename,
  onDelete,
}: {
  summary: { folder: LibraryFolder; imageCount: number; videoCount: number; previews: { type: 'image' | 'video'; url: string }[] };
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { folder, imageCount, videoCount, previews } = summary;
  const total = imageCount + videoCount;
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-main fade-up">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="aspect-[16/10] rounded-lg overflow-hidden bg-raised border border-line grid grid-cols-2 grid-rows-2">
          {Array.from({ length: 4 }).map((_, i) => {
            const preview = previews[i];
            return (
              <div key={i} className="overflow-hidden bg-control">
                {preview?.type === 'image' && <img src={preview.url} alt="" loading="lazy" className="w-full h-full object-cover" />}
                {preview?.type === 'video' && <video src={preview.url} preload="metadata" muted className="w-full h-full object-cover" />}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-start gap-2">
          <div className="w-8 h-8 rounded-lg border border-line bg-control text-accent flex items-center justify-center shrink-0">
            <Folder size={14} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-ink truncate">{folder.name}</h3>
            <p className="text-[11px] text-ink-6 mt-0.5">{total} asset{total === 1 ? '' : 's'} · {folder.type}</p>
          </div>
        </div>
      </button>
      {!folder.readonly && (
        <div className="mt-3 flex gap-1.5">
          <Button variant="ghost" size="sm" icon={<Edit3 size={11} />} onClick={onRename}>
            Rename
          </Button>
          {folder.id !== UNCATEGORIZED_FOLDER_ID && (
            <Button variant="danger-ghost" size="sm" icon={<Trash2 size={11} />} onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ImageAssetCard({
  image,
  folders,
  onPreview,
  onDelete,
  onMove,
}: {
  image: LibraryImage;
  folders: LibraryFolder[];
  onPreview: () => void;
  onDelete: () => void;
  onMove: (folderId: string) => void;
}) {
  const movable = image.source !== 'bundled';
  return (
    <div className="rounded-lg border border-line bg-surface p-1.5 shadow-main">
      <button
        type="button"
        onClick={onPreview}
        className="relative aspect-[9/16] w-full cursor-zoom-in overflow-hidden rounded-md bg-raised"
      >
        <img src={image.url} alt="" loading="lazy" className="w-full h-full object-cover" />
      </button>
      <div className="mt-1.5 flex items-center gap-1.5">
        {movable ? (
          <select
            value={image.folderId || UNCATEGORIZED_FOLDER_ID}
            onChange={(e) => onMove(e.target.value)}
            className="min-w-0 flex-1 h-8 bg-raised border border-line rounded-md px-1.5 text-[10px] text-ink outline-none"
          >
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[10px] text-ink-6 px-1">Bundled</span>
        )}
        {movable && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Remove image"
            className="w-8 h-8 rounded-md text-ink-5 hover:text-danger hover:bg-red-500/10 flex items-center justify-center"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function VideoAssetCard({
  video,
  folders,
  onPreview,
  onDelete,
  onMove,
}: {
  video: VideoAsset;
  folders: LibraryFolder[];
  onPreview: () => void;
  onDelete: () => void;
  onMove: (folderId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-1.5 shadow-main">
      <button
        type="button"
        onClick={onPreview}
        className="relative aspect-[9/16] w-full cursor-zoom-in overflow-hidden rounded-md bg-raised"
      >
        <video src={video.url} preload="metadata" muted playsInline className="w-full h-full object-cover" />
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
          {formatDuration(video.duration) || 'Video'}
        </span>
      </button>
      <div className="mt-1.5 flex items-center gap-1.5">
        <select
          value={video.folderId || 'folder:videos'}
          onChange={(e) => onMove(e.target.value)}
          className="min-w-0 flex-1 h-8 bg-raised border border-line rounded-md px-1.5 text-[10px] text-ink outline-none"
        >
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove video"
          className="w-8 h-8 rounded-md text-ink-5 hover:text-danger hover:bg-red-500/10 flex items-center justify-center"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close preview"
      onClick={onClick}
      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/70 text-white hover:bg-black"
    >
      <X size={16} />
    </button>
  );
}
