import { useState } from 'react'

interface ExportDialogProps {
  isOpen: boolean
  totalFrames: number
  onExport: (settings: ExportSettings) => void
  onClose: () => void
}

export interface ExportSettings {
  outputPath: string
  codec: string
  resolution: [number, number] | null
}

export default function ExportDialog({ isOpen, totalFrames, onExport, onClose }: ExportDialogProps) {
  const [codec] = useState('h264')
  const [useOriginalRes, setUseOriginalRes] = useState(true)
  const [customWidth, setCustomWidth] = useState(1920)
  const [customHeight, setCustomHeight] = useState(1080)

  if (!isOpen) return null

  const handleExport = async () => {
    if (!window.entropic) return

    const outputPath = await window.entropic.selectSavePath('output.mp4')
    if (!outputPath) return

    onExport({
      outputPath,
      codec,
      resolution: useOriginalRes ? null : [customWidth, customHeight],
    })
  }

  return (
    <div className="export-dialog__overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-dialog__header">
          <span>Export Video</span>
          <button className="export-dialog__close" onClick={onClose}>x</button>
        </div>
        <div className="export-dialog__body">
          <div className="export-dialog__field">
            <label>Codec</label>
            <span className="export-dialog__codec-label">H.264 (MP4)</span>
          </div>
          <div className="export-dialog__field">
            <label>Frames</label>
            <span>{totalFrames}</span>
          </div>
          <div className="export-dialog__field">
            <label>
              <input
                type="checkbox"
                checked={useOriginalRes}
                onChange={(e) => setUseOriginalRes(e.target.checked)}
              />
              Use original resolution
            </label>
          </div>
          {!useOriginalRes && (
            <div className="export-dialog__field export-dialog__field--resolution">
              <input
                type="number"
                className="export-dialog__res-input"
                value={customWidth}
                onChange={(e) => setCustomWidth(parseInt(e.target.value, 10) || 0)}
                min={1}
                max={7680}
              />
              <span>x</span>
              <input
                type="number"
                className="export-dialog__res-input"
                value={customHeight}
                onChange={(e) => setCustomHeight(parseInt(e.target.value, 10) || 0)}
                min={1}
                max={4320}
              />
            </div>
          )}
        </div>
        <div className="export-dialog__footer">
          <button className="export-dialog__cancel-btn" onClick={onClose}>Cancel</button>
          <button className="export-dialog__export-btn" onClick={handleExport}>Export</button>
        </div>
      </div>
    </div>
  )
}
