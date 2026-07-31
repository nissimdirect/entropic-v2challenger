import type { ReactNode } from 'react'
import Icon from '../../assets/icon-kit'
import type { KitIconName } from '../../assets/icon-kit'
import type { Track as TrackType } from '../../../shared/types'

/**
 * UnifiedTrackHeader — W1.5b PK.B1 (openspec/changes/w15b-grid-track-paradigm).
 *
 * ONE presentational track-header shell for all five track types (video,
 * text, performance/MIDI, audio, inspector, master), replacing the
 * per-type visual forks the owner flagged: "why do the tracks that I've
 * added from the plus track button look different than the ones that I
 * get from [+ MIDI, + Inspector]? And why is that different from master?
 * should be the same pattern."
 *
 * Fixed slot order (RATIFIED, packets.md PK.B1 — law, not a suggestion):
 *   [arm][swatch][name][badge][blend][M][S][eye]
 * `twirl` (nested fx/automation disclosure) and `lock` (T3 track lock) are
 * NOT part of this 8-slot capability contract — they are pre-existing,
 * type-specific affordances (video/text/performance only) placed outside
 * the mandated sequence (twirl leads, lock trails just before eye) without
 * disturbing the relative order of the 8 named slots. `extraContent`
 * (audio's gain knob + meter) is likewise appended outside the sequence,
 * between solo and lock/eye — matching its pre-unification position.
 *
 * Deliberately PURE/presentational: every store read, handler, and piece of
 * derived state (rename flow, drag-reorder, compositing, context menu
 * items, arm state) stays owned by the four thin per-type wrappers
 * (Track.tsx's TrackHeader, AudioTrack.tsx's AudioTrackHeader,
 * InspectorTrack.tsx's InspectorTrackHeader, MasterTrack.tsx's
 * MasterTrackHeader) exactly as before — this component only lays out what
 * it's handed. That split is what let this refactor land as a pure visual
 * unification: every existing testid, class, and interaction the four
 * files already owned keeps working unchanged; only the shared row markup
 * moved here and got a single, consistent slot order.
 *
 * Track.tsx's LEGACY (FF_CREATRIX_LAYOUT off) header is NOT routed through
 * this component — it stays exactly as it was, verbatim, in Track.tsx
 * (w15a-owner-walk.test.tsx QF1 source-inspects that exact block; the flag
 * has been ON by default for 11+ weeks with no reported regression, so the
 * legacy path is frozen dead code, out of this packet's scope to touch).
 */

export interface UnifiedTrackHeaderCapabilities {
  arm: boolean
  blend: boolean
  mute: boolean
  solo: boolean
  visibility: boolean
  lock: boolean
  twirl: boolean
  drag: boolean
}

export interface UnifiedTrackHeaderProps {
  track: TrackType
  isSelected: boolean
  capabilities: UnifiedTrackHeaderCapabilities
  typeBadge: KitIconName
  typeBadgeLabel: string
  /** e.g. 'lean-track-header' for video/text/performance — omit for other types. */
  rootTestId?: string
  /** Type-specific modifier class(es) beyond the shared base, e.g. 'audio-track-header'. */
  rootClassNameExtra?: string
  /**
   * Master-only slot decorations, driven by WHICH WRAPPER is rendering —
   * never by `track.type` (w15a-owner-walk.test.tsx QF1 deliberately renders
   * MasterTrackHeader with a fixture track whose `.type` is 'video', to test
   * the component in isolation from real master-track data).
   */
  armTestId?: string
  nameClassNameExtra?: string
  swatchClassNameExtra?: string
  badgeClassNameExtra?: string
  isDragging?: boolean
  ownIdx?: number | null
  onPointerDown?: (e: React.PointerEvent) => void
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  isArmed?: boolean
  onArmToggle?: (e: React.MouseEvent) => void
  isRenaming?: boolean
  renameText?: string
  onRenameChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRenameKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onRenameBlur?: () => void
  renameInputRef?: React.RefObject<HTMLInputElement>
  onNameDoubleClick?: () => void
  onMute?: (e: React.MouseEvent) => void
  onSolo?: (e: React.MouseEvent) => void
  isLocked?: boolean
  onLockToggle?: (e: React.MouseEvent) => void
  isExpanded?: boolean
  onTwirlToggle?: (e: React.MouseEvent) => void
  blendLabel?: string
  opacityPct?: number
  onBchipClick?: (e: React.MouseEvent) => void
  extraContent?: ReactNode
  laneBadges?: ReactNode
  nestedContent?: ReactNode
  ctxMenu?: ReactNode
}

export default function UnifiedTrackHeader({
  track,
  isSelected,
  capabilities: caps,
  typeBadge,
  typeBadgeLabel,
  rootTestId,
  rootClassNameExtra,
  armTestId,
  nameClassNameExtra,
  swatchClassNameExtra,
  badgeClassNameExtra,
  isDragging,
  ownIdx,
  onPointerDown,
  onClick,
  onContextMenu,
  onDragOver,
  onDrop,
  isArmed,
  onArmToggle,
  isRenaming,
  renameText,
  onRenameChange,
  onRenameKeyDown,
  onRenameBlur,
  renameInputRef,
  onNameDoubleClick,
  onMute,
  onSolo,
  isLocked,
  onLockToggle,
  isExpanded,
  onTwirlToggle,
  blendLabel,
  opacityPct,
  onBchipClick,
  extraContent,
  laneBadges,
  nestedContent,
  ctxMenu,
}: UnifiedTrackHeaderProps) {
  const rootClasses = [
    'track-header',
    'track-header--lean',
    rootClassNameExtra ?? '',
    isSelected ? 'track-header--selected' : '',
    isDragging ? 'track-header--dragging' : '',
  ].filter(Boolean).join(' ')

  // Master keeps its own name-slot class (w15a-owner-walk.test.tsx QF1 checks
  // `.master-track-header__name` truthy + positioned after the arm button).
  const nameClasses = [
    'track-header__name',
    nameClassNameExtra ?? '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div
        className={rootClasses}
        data-track-idx={ownIdx ?? undefined}
        data-track-type={track.type}
        data-testid={rootTestId}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onPointerDown={caps.drag ? onPointerDown : undefined}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="track-header__lean-row">
          {caps.twirl && (
            <button
              className="track-header__twirl"
              data-testid="track-twirl"
              aria-label={isExpanded ? 'Collapse track' : 'Expand track'}
              aria-expanded={isExpanded}
              onClick={onTwirlToggle}
            >
              <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={12} />
            </button>
          )}
          {caps.arm && (
            <button
              className={`track-header__auto-btn${isArmed ? ' track-header__auto-btn--active' : ''}`}
              data-testid={armTestId}
              data-slot="arm"
              onClick={onArmToggle}
              title={isArmed ? 'Disarm automation' : 'Arm for automation recording'}
              aria-label={isArmed ? 'Disarm automation recording' : 'Arm for automation recording'}
            >
              <Icon name="circle" size={10} filled={isArmed} />
            </button>
          )}
          <span
            className={`track-header__cc${swatchClassNameExtra ? ` ${swatchClassNameExtra}` : ''}`}
            data-slot="swatch"
            style={{ background: track.color }}
          />
          <div
            className="track-header__info--lean"
            data-slot="name"
            onDoubleClick={isRenaming || !onNameDoubleClick ? undefined : onNameDoubleClick}
          >
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="track-header__rename-input"
                type="text"
                value={renameText}
                onChange={onRenameChange}
                onKeyDown={onRenameKeyDown}
                onBlur={onRenameBlur}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className={nameClasses} data-testid="lean-track-name">
                {track.name}
              </div>
            )}
          </div>
          <span
            className={`track-header__type-badge${badgeClassNameExtra ? ` ${badgeClassNameExtra}` : ''}`}
            data-slot="badge"
            title={typeBadgeLabel}
            aria-label={typeBadgeLabel}
          >
            <Icon name={typeBadge} size={12} />
          </span>
          {caps.blend && (
            <button
              className="track-header__bchip"
              data-testid="track-bchip"
              data-slot="blend"
              // Adjudication fix (W1.5b PK.B1, 2026-07-31): "Normal 100%" was
              // wide enough to push the eye slot past the headers column's
              // right edge on every blend-capable track — measured overflow
              // ~23px on a live Text track (headers column ~262px). Opacity
              // moves to title/aria-label (the LayerPanel already owns
              // opacity editing); the visible chip is mode-only.
              title={`Blend ${blendLabel}, opacity ${opacityPct}% — open LAYER panel`}
              aria-label={`Blend ${blendLabel}, opacity ${opacityPct}% — open LAYER panel`}
              onClick={onBchipClick}
            >
              {blendLabel}
            </button>
          )}
          {caps.mute && (
            <button
              className={`track-header__btn${track.isMuted ? ' track-header__btn--active' : ''}`}
              data-slot="mute"
              onClick={onMute}
              title="Mute"
            >
              M
            </button>
          )}
          {caps.solo && (
            <button
              className={`track-header__btn${track.isSoloed ? ' track-header__btn--active' : ''}`}
              data-slot="solo"
              onClick={onSolo}
              title="Solo"
            >
              S
            </button>
          )}
          {extraContent}
          {caps.lock && (
            <button
              className={`track-header__btn${isLocked ? ' track-header__btn--active' : ''}`}
              onClick={onLockToggle}
              data-testid="track-lock-btn"
              title={isLocked ? 'Unlock track' : 'Lock track'}
              aria-label={isLocked ? 'Unlock track' : 'Lock track'}
              aria-pressed={isLocked}
            >
              <Icon name={isLocked ? 'lock' : 'unlock'} size={13} />
            </button>
          )}
          {caps.visibility && (
            <button
              className={`track-header__eye${track.isMuted ? ' track-header__eye--off' : ''}`}
              data-testid="track-eye"
              data-slot="eye"
              aria-label={track.isMuted ? 'Show layer' : 'Hide layer'}
              aria-pressed={!track.isMuted}
              title={track.isMuted ? 'Layer hidden (muted)' : 'Layer visible'}
              onClick={onMute}
            >
              <Icon name={track.isMuted ? 'eye-off' : 'eye'} size={14} />
            </button>
          )}
        </div>
        {laneBadges}
        {nestedContent}
      </div>
      {ctxMenu}
    </>
  )
}
