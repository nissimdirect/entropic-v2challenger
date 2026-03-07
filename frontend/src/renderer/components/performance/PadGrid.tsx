import React from 'react';
import PadCell from './PadCell';
import { usePerformanceStore } from '../../stores/performance';

interface PadGridProps {
  onEditPad: (padId: string) => void;
}

export default function PadGrid({ onEditPad }: PadGridProps) {
  const drumRack = usePerformanceStore((s) => s.drumRack);
  const padStates = usePerformanceStore((s) => s.padStates);
  const isPerformMode = usePerformanceStore((s) => s.isPerformMode);
  const triggerPad = usePerformanceStore((s) => s.triggerPad);
  const releasePad = usePerformanceStore((s) => s.releasePad);

  const hasMappings = drumRack.pads.some((p) => p.mappings.length > 0);

  return (
    <div className="pad-grid">
      {drumRack.pads.map((pad) => (
        <PadCell
          key={pad.id}
          pad={pad}
          runtimeState={padStates[pad.id]}
          onTrigger={(id) => triggerPad(id, 0)}
          onRelease={(id) => releasePad(id, 0)}
          onEdit={onEditPad}
        />
      ))}
      {isPerformMode && !hasMappings && (
        <div className="pad-grid__hint">
          No pad mappings configured — double-click a pad to add one
        </div>
      )}
    </div>
  );
}
