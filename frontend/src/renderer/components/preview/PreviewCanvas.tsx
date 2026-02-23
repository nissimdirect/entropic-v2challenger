interface PreviewCanvasProps {
  frameDataUrl: string | null
  width: number
  height: number
}

export default function PreviewCanvas({ frameDataUrl, width, height }: PreviewCanvasProps) {
  return (
    <div className="preview-canvas">
      {frameDataUrl ? (
        <img
          className="preview-canvas__element"
          src={frameDataUrl}
          width={width}
          height={height}
          alt="Preview"
        />
      ) : (
        <div className="preview-canvas__placeholder">
          No video loaded
        </div>
      )}
    </div>
  )
}
