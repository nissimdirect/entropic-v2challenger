import { useState, useMemo } from 'react'
import { useToastStore } from '../../stores/toast'

export interface ExportSettings {
  outputPath: string
  exportType: 'video' | 'gif' | 'image_sequence'
  // Video settings
  codec: string
  resolution: string
  customWidth?: number
  customHeight?: number
  fps: string
  qualityPreset: string
  bitrateMode: 'crf' | 'cbr'
  crf: number
  bitrate: number
  includeAudio: boolean
  // Region
  region: string
  startFrame?: number
  endFrame?: number
  // GIF settings
  gifMaxWidth: number
  gifDithering: boolean
  // Image sequence settings
  imageFormat: string
  jpegQuality: number
}

interface ExportDialogProps {
  isOpen: boolean
  totalFrames: number
  sourceWidth: number
  sourceHeight: number
  sourceFps: number
  loopIn: number | null
  loopOut: number | null
  onExport: (settings: ExportSettings) => void
  onClose: () => void
}

type ExportTab = 'video' | 'gif' | 'image_sequence'

const CODECS = [
  { value: 'h264', label: 'H.264 (MP4)' },
  { value: 'h265', label: 'H.265 (MP4)' },
  { value: 'prores_422', label: 'ProRes 422 (MOV)' },
  { value: 'prores_4444', label: 'ProRes 4444 (MOV)' },
]

const RESOLUTIONS = [
  { value: 'source', label: 'Source' },
  { value: '720p', label: '720p (1280x720)' },
  { value: '1080p', label: '1080p (1920x1080)' },
  { value: '4k', label: '4K (3840x2160)' },
  { value: 'custom', label: 'Custom' },
]

const FPS_OPTIONS = [
  { value: 'source', label: 'Source' },
  { value: '24', label: '24 fps' },
  { value: '25', label: '25 fps' },
  { value: '30', label: '30 fps' },
  { value: '60', label: '60 fps' },
]

const QUALITY_PRESETS = [
  { value: 'fast', label: 'Fast' },
  { value: 'medium', label: 'Medium' },
  { value: 'slow', label: 'Slow' },
]

const GIF_WIDTHS = [
  { value: 240, label: '240p' },
  { value: 360, label: '360p' },
  { value: 480, label: '480p' },
]

const IMAGE_FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'tiff', label: 'TIFF' },
]

function getDefaultExtension(codec: string): string {
  if (codec === 'prores_422' || codec === 'prores_4444') return '.mov'
  return '.mp4'
}

function getDefaultFilename(tab: ExportTab, codec: string): string {
  switch (tab) {
    case 'video': return `output${getDefaultExtension(codec)}`
    case 'gif': return 'output.gif'
    case 'image_sequence': return 'frame_sequence'
  }
}

export default function ExportDialog({
  isOpen,
  totalFrames,
  sourceWidth,
  sourceHeight,
  sourceFps,
  loopIn,
  loopOut,
  onExport,
  onClose,
}: ExportDialogProps) {
  const [activeTab, setActiveTab] = useState<ExportTab>('video')

  // Video settings
  const [codec, setCodec] = useState('h264')
  const [resolution, setResolution] = useState('source')
  const [customWidth, setCustomWidth] = useState(sourceWidth || 1920)
  const [customHeight, setCustomHeight] = useState(sourceHeight || 1080)
  const [fps, setFps] = useState('source')
  const [qualityPreset, setQualityPreset] = useState('medium')
  const [bitrateMode, setBitrateMode] = useState<'crf' | 'cbr'>('crf')
  const [crf, setCrf] = useState(23)
  const [bitrate, setBitrate] = useState(10)
  const [includeAudio, setIncludeAudio] = useState(true)

  // Region
  const [region, setRegion] = useState('full')
  const [startFrame, setStartFrame] = useState(0)
  const [endFrame, setEndFrame] = useState(Math.max(1, totalFrames))

  // GIF settings
  const [gifMaxWidth, setGifMaxWidth] = useState(480)
  const [gifDithering, setGifDithering] = useState(true)

  // Image sequence settings
  const [imageFormat, setImageFormat] = useState('png')
  const [jpegQuality, setJpegQuality] = useState(95)

  const hasLoop = loopIn !== null && loopOut !== null

  const settings = useMemo<ExportSettings>(() => ({
    outputPath: '',
    exportType: activeTab,
    codec,
    resolution,
    customWidth: resolution === 'custom' ? customWidth : undefined,
    customHeight: resolution === 'custom' ? customHeight : undefined,
    fps,
    qualityPreset,
    bitrateMode,
    crf,
    bitrate,
    includeAudio,
    region,
    startFrame: region === 'custom' ? startFrame : undefined,
    endFrame: region === 'custom' ? endFrame : undefined,
    gifMaxWidth,
    gifDithering,
    imageFormat,
    jpegQuality,
  }), [
    activeTab, codec, resolution, customWidth, customHeight, fps,
    qualityPreset, bitrateMode, crf, bitrate, includeAudio,
    region, startFrame, endFrame, gifMaxWidth, gifDithering,
    imageFormat, jpegQuality,
  ])

  if (!isOpen) return null

  const handleExport = async () => {
    if (!window.entropic) {
      console.error('[export-dialog] window.entropic bridge missing')
      useToastStore.getState().addToast({
        level: 'error',
        message: 'Export unavailable',
        source: 'export',
        details: 'IPC bridge to backend is missing. Restart the app.',
      })
      return
    }

    if (totalFrames === 0) {
      console.error('[export-dialog] no asset loaded — totalFrames=0')
      useToastStore.getState().addToast({
        level: 'error',
        message: 'No asset loaded',
        source: 'export',
        details: 'Load a video or image before exporting.',
      })
      return
    }

    if (region === 'custom' && startFrame >= endFrame) {
      console.error('[export-dialog] invalid range', { startFrame, endFrame })
      useToastStore.getState().addToast({
        level: 'error',
        message: 'Invalid export range',
        source: 'export',
        details: `Start (${startFrame}) must be before end (${endFrame}).`,
      })
      return
    }

    const defaultName = getDefaultFilename(activeTab, codec)
    let outputPath: string | null = null
    try {
      outputPath = await window.entropic.selectSavePath(defaultName)
    } catch (err) {
      console.error('[export-dialog] selectSavePath threw', err)
      useToastStore.getState().addToast({
        level: 'error',
        message: 'Could not open save dialog',
        source: 'export',
        details: err instanceof Error ? err.message : String(err),
      })
      return
    }
    if (!outputPath) return // user cancelled save dialog — silent is correct here

    onExport({ ...settings, outputPath })
  }

  const renderRegionFields = () => (
    <>
      <div className="export-dialog__field">
        <label>Region</label>
        <select
          className="export-dialog__select"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="full">Full Timeline ({totalFrames} frames)</option>
          <option value="loop_region" disabled={!hasLoop}>
            Loop Region{hasLoop ? ` (${loopIn}–${loopOut})` : ' (no loop set)'}
          </option>
          <option value="custom" disabled={totalFrames === 0}>
            Custom Range{totalFrames === 0 ? ' (load a video first)' : ''}
          </option>
        </select>
      </div>
      {region === 'custom' && (
        <>
          <div className="export-dialog__field export-dialog__field--resolution">
            <label>Start frame</label>
            <input
              type="number"
              className="export-dialog__res-input"
              value={startFrame}
              onChange={(e) => setStartFrame(Math.max(0, parseInt(e.target.value, 10) || 0))}
              min={0}
              max={totalFrames - 1}
            />
            <span className="export-dialog__hint">
              {sourceFps > 0 ? `${(startFrame / sourceFps).toFixed(2)}s` : ''}
            </span>
            <label>End frame</label>
            <input
              type="number"
              className="export-dialog__res-input"
              value={endFrame}
              onChange={(e) => setEndFrame(Math.min(totalFrames, parseInt(e.target.value, 10) || 0))}
              min={1}
              max={totalFrames}
            />
            <span className="export-dialog__hint">
              {sourceFps > 0 ? `${(endFrame / sourceFps).toFixed(2)}s` : ''}
            </span>
          </div>
          <div className="export-dialog__hint-row">
            Range: frames {startFrame}–{endFrame} of {totalFrames}
            {sourceFps > 0 && ` (${((endFrame - startFrame) / sourceFps).toFixed(2)}s @ ${sourceFps.toFixed(2)} fps)`}
          </div>
        </>
      )}
    </>
  )

  const renderVideoTab = () => (
    <>
      <div className="export-dialog__field">
        <label>Codec</label>
        <select
          className="export-dialog__select"
          value={codec}
          onChange={(e) => setCodec(e.target.value)}
        >
          {CODECS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="export-dialog__field">
        <label>Resolution</label>
        <select
          className="export-dialog__select"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
        >
          {RESOLUTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.value === 'source' ? `Source (${sourceWidth}x${sourceHeight})` : r.label}
            </option>
          ))}
        </select>
      </div>
      {resolution === 'custom' && (
        <div className="export-dialog__field export-dialog__field--resolution">
          <input
            type="number"
            className="export-dialog__res-input"
            value={customWidth}
            onChange={(e) => setCustomWidth(Math.max(1, Math.min(7680, parseInt(e.target.value, 10) || 0)))}
            min={1}
            max={7680}
          />
          <span>x</span>
          <input
            type="number"
            className="export-dialog__res-input"
            value={customHeight}
            onChange={(e) => setCustomHeight(Math.max(1, Math.min(4320, parseInt(e.target.value, 10) || 0)))}
            min={1}
            max={4320}
          />
        </div>
      )}

      <div className="export-dialog__field">
        <label>Frame Rate</label>
        <select
          className="export-dialog__select"
          value={fps}
          onChange={(e) => setFps(e.target.value)}
        >
          {FPS_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.value === 'source' ? `Source (${sourceFps} fps)` : f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="export-dialog__field">
        <label>Quality Preset</label>
        <select
          className="export-dialog__select"
          value={qualityPreset}
          onChange={(e) => setQualityPreset(e.target.value)}
        >
          {QUALITY_PRESETS.map((q) => (
            <option key={q.value} value={q.value}>{q.label}</option>
          ))}
        </select>
      </div>

      <div className="export-dialog__field">
        <label>Bitrate Mode</label>
        <div className="export-dialog__toggle-group">
          <button
            className={`export-dialog__toggle ${bitrateMode === 'crf' ? 'export-dialog__toggle--active' : ''}`}
            onClick={() => setBitrateMode('crf')}
          >
            CRF
          </button>
          <button
            className={`export-dialog__toggle ${bitrateMode === 'cbr' ? 'export-dialog__toggle--active' : ''}`}
            onClick={() => setBitrateMode('cbr')}
          >
            CBR
          </button>
        </div>
      </div>

      {bitrateMode === 'crf' ? (
        <div className="export-dialog__field">
          <label>CRF: {crf}</label>
          <input
            type="range"
            className="export-dialog__slider"
            min={0}
            max={51}
            value={crf}
            onChange={(e) => setCrf(parseInt(e.target.value, 10))}
          />
        </div>
      ) : (
        <div className="export-dialog__field">
          <label>Bitrate: {bitrate} Mbps</label>
          <input
            type="range"
            className="export-dialog__slider"
            min={1}
            max={50}
            value={bitrate}
            onChange={(e) => setBitrate(parseInt(e.target.value, 10))}
          />
        </div>
      )}

      {renderRegionFields()}

      <div className="export-dialog__field">
        <label>
          <input
            type="checkbox"
            checked={includeAudio}
            onChange={(e) => setIncludeAudio(e.target.checked)}
          />
          Include Audio
        </label>
      </div>
    </>
  )

  const renderGifTab = () => (
    <>
      <div className="export-dialog__field">
        <label>Max Resolution</label>
        <select
          className="export-dialog__select"
          value={gifMaxWidth}
          onChange={(e) => setGifMaxWidth(parseInt(e.target.value, 10))}
        >
          {GIF_WIDTHS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
      </div>

      <div className="export-dialog__field">
        <label>
          <input
            type="checkbox"
            checked={gifDithering}
            onChange={(e) => setGifDithering(e.target.checked)}
          />
          Dithering
        </label>
      </div>

      {renderRegionFields()}
    </>
  )

  const renderImageSequenceTab = () => (
    <>
      <div className="export-dialog__field">
        <label>Format</label>
        <select
          className="export-dialog__select"
          value={imageFormat}
          onChange={(e) => setImageFormat(e.target.value)}
        >
          {IMAGE_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {imageFormat === 'jpeg' && (
        <div className="export-dialog__field">
          <label>JPEG Quality: {jpegQuality}</label>
          <input
            type="range"
            className="export-dialog__slider"
            min={1}
            max={100}
            value={jpegQuality}
            onChange={(e) => setJpegQuality(parseInt(e.target.value, 10))}
          />
        </div>
      )}

      {renderRegionFields()}
    </>
  )

  const TAB_LABELS: Record<ExportTab, string> = {
    video: 'Video',
    gif: 'GIF',
    image_sequence: 'Image Sequence',
  }

  return (
    <div className="export-dialog__overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-dialog__header">
          <span>Export</span>
          <button className="export-dialog__close" onClick={onClose}>x</button>
        </div>

        <div className="export-dialog__tabs">
          {(['video', 'gif', 'image_sequence'] as ExportTab[]).map((tab) => (
            <button
              key={tab}
              className={`export-dialog__tab${activeTab === tab ? ' export-dialog__tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="export-dialog__body">
          {activeTab === 'video' && renderVideoTab()}
          {activeTab === 'gif' && renderGifTab()}
          {activeTab === 'image_sequence' && renderImageSequenceTab()}
        </div>

        <div className="export-dialog__footer">
          <button className="export-dialog__cancel-btn" onClick={onClose}>Cancel</button>
          <button className="export-dialog__export-btn" onClick={handleExport}>Export</button>
        </div>
      </div>
    </div>
  )
}
