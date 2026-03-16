import { useEffect, useRef } from 'react'

type ListenerTarget = Document | Window

/**
 * Attach an event listener with automatic cleanup and stable closure.
 * The handler always sees the latest closure values via ref.
 *
 * Replaces raw document.addEventListener / window.addEventListener
 * in components that read mutable state (zoom, position, etc.)
 *
 * @param target - document or window
 * @param eventName - event name (e.g., 'mousemove', 'keydown')
 * @param handler - event handler (always sees latest closure values)
 * @param enabled - whether the listener is active (default true)
 * @param options - addEventListener options (capture, passive, etc.)
 */
export function useStableListener<K extends string>(
  target: ListenerTarget,
  eventName: K,
  handler: (event: Event) => void,
  enabled: boolean = true,
  options?: AddEventListenerOptions,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return

    const listener = (event: Event) => handlerRef.current(event)
    target.addEventListener(eventName, listener, options)
    return () => target.removeEventListener(eventName, listener, options)
  }, [target, eventName, enabled, options])
}
