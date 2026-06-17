import type { NotesData, Slide, Slideshow } from '../types';
import { captionTextStyle, SLIDE_CONTAINER_STYLE, SIDE_PAD_PCT } from '../lib/captionStyle';

interface SlidePreviewProps {
  slide: Slide;
  className?: string;
  showText?: boolean;
  format?: Slideshow['format'];
  notesData?: NotesData;
  slideIndex?: number;
}

export function SlidePreview({
  slide,
  className = '',
  showText = true,
  format,
  notesData,
  slideIndex = 0,
}: SlidePreviewProps) {
  if (format === 'notes' && notesData && slideIndex === 1) {
    return <NotesPreview notesData={notesData} className={className} />;
  }

  const background = slide.imageUrl
    ? undefined
    : `linear-gradient(135deg, ${slide.bgFrom || '#0f172a'}, ${slide.bgTo || '#1e293b'})`;

  return (
    <div
      className={`relative aspect-[9/16] rounded-lg overflow-hidden bg-raised border border-white/10 shadow-main ${className}`}
      style={background ? { background, ...SLIDE_CONTAINER_STYLE } : SLIDE_CONTAINER_STYLE}
    >
      {slide.imageUrl && (
        <>
          <img
            src={slide.imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/45" />
        </>
      )}
      {showText && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ paddingLeft: `${SIDE_PAD_PCT}%`, paddingRight: `${SIDE_PAD_PCT}%` }}
        >
          <span style={captionTextStyle()}>{slide.text}</span>
        </div>
      )}
    </div>
  );
}

function NotesPreview({ notesData, className }: { notesData: NotesData; className: string }) {
  const stripNumber = (text: string) => String(text || '').replace(/^\s*(?:\d+[).:-]\s*)+/, '').trim().toLowerCase();
  const clean = (text: string) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const totalChars = notesData.points.reduce((sum, point) => sum + point.heading.length + point.body.length, 0);
  const dense = notesData.points.length >= 5 || totalChars > 620;
  const titleSize = dense ? '3cqh' : '3.35cqh';
  const headingSize = dense ? '2.1cqh' : '2.35cqh';
  const bodySize = dense ? '1.8cqh' : '2cqh';
  const pointGap = dense ? '1.45cqh' : '1.9cqh';

  return (
    <div
      className={`relative aspect-[9/16] overflow-hidden bg-[#fffdf8] text-[#1d1d1f] ${className}`}
      style={SLIDE_CONTAINER_STYLE}
    >
      <div className="absolute inset-x-0 top-[6.7%] text-center font-medium text-[#a5a29b]" style={{ fontSize: '1.95cqh', lineHeight: 1.25 }}>
        {clean(notesData.noteDate || 'today, 9:41 am')}
      </div>
      <div className="absolute left-[8.9%] right-[8.9%] top-[14.5%] bottom-[6.8%] overflow-hidden">
        {notesData.noteTitle && (
          <div className="font-bold mb-[2.2cqh]" style={{ fontSize: titleSize, lineHeight: 1.12 }}>
            {clean(notesData.noteTitle)}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: pointGap }}>
          {notesData.points.slice(0, 5).map((point, i) => (
            <div key={`${point.heading}-${i}`}>
              <div className="font-bold" style={{ fontSize: headingSize, lineHeight: 1.18 }}>
                {i + 1}. {stripNumber(point.heading)}
              </div>
              <div className="mt-[0.45cqh] text-[#2f2f31]" style={{ fontSize: bodySize, lineHeight: 1.28 }}>
                {clean(point.body)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
