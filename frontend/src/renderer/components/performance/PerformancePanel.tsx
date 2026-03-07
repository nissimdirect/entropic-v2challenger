import React, { useState, useCallback } from 'react';
import PadGrid from './PadGrid';
import { usePerformanceStore } from '../../stores/performance';

interface PerformancePanelProps {
  onEditPad: (padId: string) => void;
}

export default function PerformancePanel({ onEditPad }: PerformancePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const isPerformMode = usePerformanceStore((s) => s.isPerformMode);

  const handleToggle = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  return (
    <div className="performance-panel">
      <div className="performance-panel__header" onClick={handleToggle}>
        <span className="performance-panel__title">
          <span
            className={`performance-panel__indicator${isPerformMode ? ' performance-panel__indicator--active' : ''}`}
          />
          PERFORM
        </span>
        <button className="performance-panel__toggle-btn" tabIndex={-1}>
          {isCollapsed ? '▶' : '▼'}
        </button>
      </div>
      {!isCollapsed && (
        <div className="performance-panel__body">
          <PadGrid onEditPad={onEditPad} />
        </div>
      )}
    </div>
  );
}
