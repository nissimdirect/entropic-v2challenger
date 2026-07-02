import React from 'react';
import PadCell from './PadCell';
import { usePerformanceStore } from '../../stores/performance';
import { useProjectStore } from '../../stores/project';

interface PadGridProps {
  onEditPad: (padId: string) => void;
}

export default function PadGrid({ onEditPad }: PadGridProps) {
  const drumRack = usePerformanceStore((s) => s.drumRack);
  const padStates = usePerformanceStore((s) => s.padStates);
  // P5a.3: modal-flag approach retired — PadGrid only renders inside PerformancePanel
  // which itself is gated on track-selection in App.tsx. Always armed here.
  const triggerPad = usePerformanceStore((s) => s.triggerPad);
  const releasePad = usePerformanceStore((s) => s.releasePad);
  const currentFrame = useProjectStore((s) => s.currentFrame);

  const hasMappings = drumRack.pads.some((p) => p.modRoutes.length > 0);

  return (
    <div className="pad-grid">
      {drumRack.pads.map((pad) => (
        <PadCell
          key={pad.id}
          pad={pad}
          runtimeState={padStates[pad.id]}
          onTrigger={(id) => triggerPad(id, currentFrame)}
          onRelease={(id) => releasePad(id, currentFrame)}
          onEdit={onEditPad}
        />
      ))}
      {!hasMappings && (
        <div className="pad-grid__hint">
          No pad modRoutes configured — double-click a pad to add one
        </div>
      )}
    </div>
  );
}
