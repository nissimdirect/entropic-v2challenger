import '../../styles/skeleton.css'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  lines?: number
  borderRadius?: string
}

const LINE_WIDTHS = ['100%', '80%', '90%', '60%']

/**
 * Placeholder skeleton with pulsing animation.
 * If `lines` is set, renders multiple lines with varying widths.
 */
export default function Skeleton({
  width,
  height,
  lines,
  borderRadius,
}: SkeletonProps) {
  if (lines !== undefined && lines > 0) {
    return (
      <div className="skeleton-group">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className="skeleton skeleton__line"
            style={{
              width: LINE_WIDTHS[i % LINE_WIDTHS.length],
              height: typeof height === 'number' ? `${height}px` : (height || '14px'),
              borderRadius: borderRadius || '4px',
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className="skeleton"
      style={{
        width: typeof width === 'number' ? `${width}px` : (width || '100%'),
        height: typeof height === 'number' ? `${height}px` : (height || '16px'),
        borderRadius: borderRadius || '4px',
      }}
    />
  )
}
