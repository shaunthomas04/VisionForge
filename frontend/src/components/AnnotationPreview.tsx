interface Bbox {
  x: number
  y: number
  w: number
  h: number
}

interface Props {
  src: string
  bbox?: Bbox
  label?: string
  width: number
  height: number
  className?: string
}

export default function AnnotationPreview({ src, bbox, label, width, height, className = '' }: Props) {
  const boxStyle = bbox
    ? {
        left: `${(bbox.x / width) * 100}%`,
        top: `${(bbox.y / height) * 100}%`,
        width: `${(bbox.w / width) * 100}%`,
        height: `${(bbox.h / height) * 100}%`,
      }
    : null

  return (
    <div className={`relative overflow-hidden rounded-lg bg-surface ${className}`} style={{ aspectRatio: `${width}/${height}` }}>
      <img
        src={src}
        alt={label ?? 'annotation'}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      {boxStyle && (
        <div
          className="absolute border-2 border-accent pointer-events-none"
          style={boxStyle}
        >
          {label && (
            <span className="absolute -top-5 left-0 bg-accent text-white text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
