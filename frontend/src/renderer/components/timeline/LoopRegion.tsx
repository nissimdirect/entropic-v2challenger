interface LoopRegionProps {
  loopIn: number
  loopOut: number
  zoom: number
  scrollX: number
}

export default function LoopRegion({ loopIn, loopOut, zoom, scrollX }: LoopRegionProps) {
  const left = loopIn * zoom - scrollX
  const width = (loopOut - loopIn) * zoom

  // Don't render if entirely off-screen
  if (left + width < 0) return null

  return (
    <div
      className="loop-region"
      style={{
        left: `${left}px`,
        width: `${width}px`,
      }}
    />
  )
}
