/**
 * RelinkDialog — shown on project load when referenced media files are missing.
 *
 * UE.5: missing-media dialog. For each missing asset the user can:
 *   - Locate…  open a native file picker, relink to the new path
 *   - Skip      leave the clip flagged missing (badge shown in timeline)
 *
 * Conventions: follows CrashRecoveryDialog.tsx pattern (isOpen prop, BEM classes,
 * no context / no hooks beyond useState).
 */
import { useState, useRef } from 'react'
import { useModalBehavior } from '../../hooks/useModalBehavior'

export interface MissingAsset {
  /** The asset id from the project's assets map. */
  assetId: string
  /** Human-readable name (usually the filename). */
  name: string
  /** The stale (unresolvable) path stored in the project. */
  oldPath: string
  /** Asset type — used to filter the native open dialog. */
  kind: 'video' | 'image' | 'audio'
}

interface RelinkDialogProps {
  isOpen: boolean
  missingAssets: MissingAsset[]
  /**
   * Called when the user clicks "Locate…" and picks a new path.
   * The dialog expects the caller to resolve the path validation asynchronously;
   * if the caller rejects (wrong codec / denied), the entry stays unresolved.
   */
  onLocate: (assetId: string, newPath: string) => void
  /**
   * Called when the user clicks "Skip" on an entry — leaves clip flagged missing.
   */
  onSkip: (assetId: string) => void
  /**
   * Called when the user clicks "Done" (all entries resolved or skipped).
   */
  onClose: () => void
  /** Callback to open a native file picker and return the chosen path. */
  onShowOpenDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
}

const FILTERS_BY_KIND: Record<string, { name: string; extensions: string[] }[]> = {
  video: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'mxf', 'ts'] }],
  image: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'tiff', 'tif', 'webp', 'bmp', 'heic', 'heif'] }],
  audio: [{ name: 'Audio Files', extensions: ['wav', 'mp3', 'm4a', 'aif', 'aiff', 'ogg', 'flac'] }],
}

export default function RelinkDialog({
  isOpen,
  missingAssets,
  onLocate,
  onSkip,
  onClose,
  onShowOpenDialog,
}: RelinkDialogProps) {
  /** Track which assetIds have been resolved or skipped this session. */
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [locating, setLocating] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useModalBehavior(dialogRef, onClose)

  if (!isOpen) return null

  const pending = missingAssets.filter((a) => !resolved.has(a.assetId) && !skipped.has(a.assetId))
  const allDone = resolved.size + skipped.size >= missingAssets.length

  async function handleLocate(asset: MissingAsset) {
    setLocating(asset.assetId)
    try {
      const filters = FILTERS_BY_KIND[asset.kind] ?? [{ name: 'All Files', extensions: ['*'] }]
      const newPath = await onShowOpenDialog(filters)
      if (newPath) {
        onLocate(asset.assetId, newPath)
        setResolved((prev) => new Set([...prev, asset.assetId]))
      }
    } finally {
      setLocating(null)
    }
  }

  function handleSkip(assetId: string) {
    onSkip(assetId)
    setSkipped((prev) => new Set([...prev, assetId]))
  }

  return (
    <div className="relink-dialog__overlay">
      <div
        ref={dialogRef}
        className="relink-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="relink-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relink-dialog__header">
          <span id="relink-dialog-title">Media Files Missing</span>
        </div>
        <div className="relink-dialog__body">
          <p className="relink-dialog__text">
            {missingAssets.length === 1
              ? 'One media file could not be found. Locate the file or skip to leave it flagged.'
              : `${missingAssets.length} media files could not be found. Locate each file or skip to leave clips flagged.`}
          </p>
          <ul className="relink-dialog__list">
            {missingAssets.map((asset) => {
              const isResolved = resolved.has(asset.assetId)
              const isSkipped = skipped.has(asset.assetId)
              const isBusy = locating === asset.assetId
              return (
                <li
                  key={asset.assetId}
                  className={[
                    'relink-dialog__entry',
                    isResolved ? 'relink-dialog__entry--resolved' : '',
                    isSkipped ? 'relink-dialog__entry--skipped' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="relink-dialog__entry-name" title={asset.oldPath}>
                    {asset.name}
                  </span>
                  <span className="relink-dialog__entry-status">
                    {isResolved && 'Relinked'}
                    {isSkipped && 'Skipped'}
                    {!isResolved && !isSkipped && (
                      <>
                        <button
                          className="relink-dialog__btn relink-dialog__btn--locate"
                          onClick={() => handleLocate(asset)}
                          disabled={isBusy}
                        >
                          {isBusy ? 'Opening…' : 'Locate…'}
                        </button>
                        <button
                          className="relink-dialog__btn relink-dialog__btn--skip"
                          onClick={() => handleSkip(asset.assetId)}
                          disabled={isBusy}
                        >
                          Skip
                        </button>
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="relink-dialog__footer">
          <button
            className="relink-dialog__btn relink-dialog__btn--done"
            onClick={onClose}
          >
            {allDone || pending.length === 0 ? 'Done' : `Continue (${pending.length} remaining)`}
          </button>
        </div>
      </div>
    </div>
  )
}
