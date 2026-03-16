import React, { useState, useCallback } from 'react';
import PadGrid from './PadGrid';
import MIDILearnOverlay from './MIDILearnOverlay';
import MIDISettings from './MIDISettings';
import { usePerformanceStore } from '../../stores/performance';
import { getBuffer, captureToAutomation, clearBuffer } from '../../utils/retro-capture';
import { useAutomationStore } from '../../stores/automation';
import { useTimelineStore } from '../../stores/timeline';

interface PerformancePanelProps {
  onEditPad: (padId: string) => void;
}

export default function PerformancePanel({ onEditPad }: PerformancePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const isPerformMode = usePerformanceStore((s) => s.isPerformMode);

  const handleToggle = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleCapture = useCallback(() => {
    const buf = getBuffer();
    if (buf.length === 0) return;

    const autoStore = useAutomationStore.getState();
    const armedTrackId = autoStore.armedTrackId;
    if (!armedTrackId) return;

    const timeline = useTimelineStore.getState();
    const fps = 30; // TODO: get from project settings

    const automationData = captureToAutomation(fps, timeline.playheadTime);

    for (const [paramPath, points] of Object.entries(automationData)) {
      // Find or create lane
      const lanes = autoStore.getLanesForTrack(armedTrackId);
      let lane = lanes.find((l) => l.paramPath === paramPath);
      if (!lane) {
        const [effectId, paramKey] = paramPath.split('.', 2);
        autoStore.addLane(armedTrackId, effectId, paramKey, '#f59e0b');
        const freshLanes = useAutomationStore.getState().getLanesForTrack(armedTrackId);
        lane = freshLanes.find((l) => l.paramPath === paramPath);
      }
      if (!lane) continue;

      // Merge points into existing lane
      const existing = lane.points;
      const merged = [...existing, ...points].sort((a, b) => a.time - b.time);
      autoStore.setPoints(armedTrackId, lane.id, merged);
    }

    clearBuffer();
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
        <div className="performance-panel__header-actions">
          <button
            className="performance-panel__capture-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleCapture();
            }}
            title="Capture recent pad events to automation"
          >
            CAPTURE
          </button>
          <button
            className="performance-panel__settings-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowSettings((prev) => !prev);
            }}
            title="MIDI Settings"
          >
            ⚙
          </button>
          <button className="performance-panel__toggle-btn" tabIndex={-1}>
            {isCollapsed ? '▶' : '▼'}
          </button>
        </div>
      </div>
      {!isCollapsed && (
        <div className="performance-panel__body">
          <PadGrid onEditPad={onEditPad} />
        </div>
      )}
      {showSettings && (
        <div className="performance-panel__settings">
          <MIDISettings />
        </div>
      )}
      <MIDILearnOverlay />
    </div>
  );
}
