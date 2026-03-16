import React from 'react';
import type { Pad, PadRuntimeState } from '../../../shared/types';
import { codeToLabel } from '../../../shared/constants';

const CHOKE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

interface PadCellProps {
  pad: Pad;
  runtimeState: PadRuntimeState | undefined;
  onTrigger: (padId: string) => void;
  onRelease: (padId: string) => void;
  onEdit: (padId: string) => void;
}

export default function PadCell({ pad, runtimeState, onTrigger, onRelease, onEdit }: PadCellProps) {
  const phase = runtimeState?.phase ?? 'idle';
  const value = runtimeState?.currentValue ?? 0;

  const isActive = phase === 'attack' || phase === 'decay' || phase === 'sustain';
  const isReleasing = phase === 'release';
  const hasMapping = pad.mappings.length > 0;

  let className = 'pad-cell';
  if (isActive) className += ' pad-cell--active';
  else if (isReleasing) className += ' pad-cell--releasing';
  else if (hasMapping) className += ' pad-cell--armed';

  const opacity = isActive || isReleasing ? 0.3 + 0.7 * value : undefined;

  return (
    <div
      className={className}
      style={opacity !== undefined ? { opacity } : undefined}
      role="button"
      aria-pressed={isActive || isReleasing}
      aria-label={`${pad.label} ${pad.keyBinding ? codeToLabel(pad.keyBinding) : 'unbound'}`}
      onMouseDown={() => onTrigger(pad.id)}
      onMouseUp={() => onRelease(pad.id)}
      onDoubleClick={() => onEdit(pad.id)}
    >
      <span className="pad-cell__key">
        {pad.keyBinding ? codeToLabel(pad.keyBinding) : '—'}
      </span>
      <span className="pad-cell__label">{pad.label}</span>
      {pad.chokeGroup !== null && (
        <span
          className="pad-cell__choke-dot"
          style={{ background: CHOKE_COLORS[(pad.chokeGroup - 1) % CHOKE_COLORS.length] }}
        />
      )}
      {pad.midiNote !== null && pad.midiNote !== undefined && (
        <span className="pad-cell__midi-dot" />
      )}
    </div>
  );
}
