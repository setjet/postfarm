import type { Slide } from '../types';
import { captionTextStyle, SLIDE_CONTAINER_STYLE, SIDE_PAD_PCT } from '../lib/captionStyle';

interface SlidePreviewProps {
  slide: Slide;
  className?: string;
  showText?: boolean;
}

export function SlidePreview({ slide, className = '', showText = true }: SlidePreviewProps) {
  // Generated slides have no source image — render the same gradient the canvas
  // renderer uses, so the preview matches the exported PNG.
  const background = slide.imageUrl
    ? undefined
    : `linear-gradient(135deg, ${slide.bgFrom || '#0f172a'}, ${slide.bgTo || '#1e293b'})`;

  return (
    <div
      // containerType: 'size' lets the caption's `cqh` units resolve to a percent
      // of THIS slide's height, so the text scales identically to the baked PNG.
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
          {/* Match the canvas bake's darkening (rgba(0,0,0,0.45)) for readability. */}
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
