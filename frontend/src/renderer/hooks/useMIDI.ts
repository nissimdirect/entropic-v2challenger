/**
 * useMIDI — Web MIDI API hook.
 * Handles device enumeration, hot-plug, and message routing to MIDI store.
 * Runs in Electron renderer — no preload/backend needed.
 */
import { useEffect, useRef } from 'react';
import { useMIDIStore } from '../stores/midi';
import { usePerformanceStore } from '../stores/performance';
import type { MIDIDevice } from '../../shared/types';
import { useProjectStore } from '../stores/project';

export function useMIDI(): void {
  const accessRef = useRef<MIDIAccess | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const rebindRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Check Web MIDI API support
    if (!navigator.requestMIDIAccess) {
      useMIDIStore.getState().setIsSupported(false);
      return;
    }

    useMIDIStore.getState().setIsSupported(true);

    let cancelled = false;

    navigator.requestMIDIAccess({ sysex: false }).then((access) => {
      if (cancelled) return;
      accessRef.current = access;

      // Enumerate devices
      const updateDevices = () => {
        const devices: MIDIDevice[] = [];
        access.inputs.forEach((input) => {
          devices.push({
            id: input.id,
            name: input.name ?? 'Unknown',
            manufacturer: input.manufacturer ?? 'Unknown',
            state: input.state,
          });
        });
        useMIDIStore.getState().setDevices(devices);

        // Auto-select first device if none selected
        const store = useMIDIStore.getState();
        if (!store.activeDeviceId && devices.length > 0) {
          useMIDIStore.getState().setActiveDevice(devices[0].id);
        }

        // If active device disconnected, panic and clear
        if (store.activeDeviceId) {
          const activeDevice = devices.find((d) => d.id === store.activeDeviceId);
          if (!activeDevice || activeDevice.state !== 'connected') {
            usePerformanceStore.getState().panicAll();
          }
        }
      };

      updateDevices();

      // Hot-plug: device connect/disconnect
      access.onstatechange = () => {
        if (cancelled) return;
        updateDevices();
        rebindListeners();
      };

      // Bind MIDI message listeners
      const messageHandler = (e: MIDIMessageEvent) => {
        if (!e.data || e.data.length < 2) return;
        const frameIndex = useProjectStore.getState().currentFrame;
        useMIDIStore.getState().handleMIDIMessage(e.data, frameIndex);
      };

      const rebindListeners = () => {
        // Remove old listeners
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }

        const boundInputs: MIDIInput[] = [];
        const activeId = useMIDIStore.getState().activeDeviceId;

        access.inputs.forEach((input) => {
          // If activeDeviceId set, only listen to that device
          // If null, listen to all
          if (activeId !== null && input.id !== activeId) return;
          if (input.state !== 'connected') return;

          input.onmidimessage = messageHandler;
          boundInputs.push(input);
        });

        cleanupRef.current = () => {
          for (const input of boundInputs) {
            input.onmidimessage = null;
          }
        };
      };

      rebindListeners();
      rebindRef.current = rebindListeners;

      // Subscribe to activeDeviceId changes — rebind listeners when user switches device
      const unsubscribe = useMIDIStore.subscribe(
        (state, prev) => {
          if (state.activeDeviceId !== prev.activeDeviceId) {
            rebindListeners();
          }
        },
      );

      // Store unsubscribe for cleanup
      const originalCleanup = cleanupRef.current;
      cleanupRef.current = () => {
        originalCleanup?.();
        unsubscribe();
      };
    }).catch((err) => {
      if (cancelled) return;
      console.warn('[MIDI] requestMIDIAccess failed:', err);
      useMIDIStore.getState().setIsSupported(false);
    });

    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (accessRef.current) {
        accessRef.current.onstatechange = null;
        accessRef.current = null;
      }
      rebindRef.current = null;
    };
  }, []);
}
