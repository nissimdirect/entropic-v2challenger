/**
 * Hook bridging the I3 menu to the backend inspector.inline_actions registry.
 *
 * P3.6 (Tier-3): dispatches to ZMQ backend (inline_actions.py, cherry-picked
 * from PR #143 bc0ea0b) via IPC commands:
 *   - inline_actions_list  → lists eligible actions for a context
 *   - inline_actions_invoke → invokes an action and returns payload
 *
 * Falls back to the Tier-1 stub action set on IPC unavailability.
 * Toast surfaced on backend dispatch failure (error reply / timeout).
 *
 * ActionContextKind mirrors backend enum: effect | param | lane | operator | pad.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useToastStore } from '../../stores/toast'
import type { InlineAction } from './InlineActionMenu'

export type ActionContextKind = 'effect' | 'param' | 'lane' | 'operator' | 'pad'

export interface InlineActionContext {
  kind: ActionContextKind
  nodeId: string
  /** Required when kind === 'param' */
  paramPath?: string
  /** Required when invoking show_in_inspector_track */
  trackId?: string
}

interface BackendActionItem {
  id: string
  label: string
  shortcut: string
}

interface UseInlineActionsResult {
  actions: InlineAction[]
  loading: boolean
  /** Invoke a backend action by id, returns backend payload (or null on error). */
  invokeAction: (actionId: string) => Promise<Record<string, unknown> | null>
}

/** IPC bridge: list eligible actions from backend registry. */
async function fetchActionsFromBackend(ctx: InlineActionContext): Promise<BackendActionItem[]> {
  if (!window.entropic) return []
  const res = await window.entropic.sendCommand({
    cmd: 'inline_actions_list',
    kind: ctx.kind,
    node_id: ctx.nodeId,
    param_path: ctx.paramPath ?? null,
    track_id: ctx.trackId ?? null,
  })
  if (!res.ok) return []
  return (res.actions as BackendActionItem[]) ?? []
}

/** IPC bridge: invoke a single action. */
async function invokeActionOnBackend(
  actionId: string,
  ctx: InlineActionContext,
): Promise<{ ok: boolean; message: string; payload: Record<string, unknown> }> {
  if (!window.entropic) {
    return { ok: false, message: 'IPC unavailable', payload: {} }
  }
  const res = await window.entropic.sendCommand({
    cmd: 'inline_actions_invoke',
    action_id: actionId,
    kind: ctx.kind,
    node_id: ctx.nodeId,
    param_path: ctx.paramPath ?? null,
    track_id: ctx.trackId ?? null,
  })
  return {
    ok: Boolean(res.ok),
    message: String(res.message ?? ''),
    payload: (res.payload as Record<string, unknown>) ?? {},
  }
}

/** Tier-1 stub: static action set used when backend is unavailable. */
function stubActions(paramId: string): InlineAction[] {
  return [
    {
      id: `${paramId}:stub-reveal`,
      label: 'Reveal in routing canvas',
      category: 'tools',
      shortcut: 'Cmd+Shift+I',
      onSelect: () => {},
    },
  ]
}

/**
 * Fetches and manages inline actions for a given context.
 *
 * @param ctx         - The item the user right-clicked.
 * @param onInvoked   - Optional callback receiving the backend result payload.
 */
export function useInlineActions(
  ctx: InlineActionContext,
  onInvoked?: (actionId: string, payload: Record<string, unknown>) => void,
): UseInlineActionsResult {
  const addToast = useToastStore((s) => s.addToast)
  const [backendItems, setBackendItems] = useState<BackendActionItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchActionsFromBackend(ctx).then((items) => {
      if (!cancelled) {
        setBackendItems(items)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
    // Re-fetch when context identity changes (nodeId or kind change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.kind, ctx.nodeId, ctx.paramPath ?? '', ctx.trackId ?? ''])

  const invokeAction = useCallback(
    async (actionId: string): Promise<Record<string, unknown> | null> => {
      const result = await invokeActionOnBackend(actionId, ctxRef.current)
      if (!result.ok) {
        addToast({
          level: 'error',
          message: result.message || `Action failed: ${actionId}`,
          source: 'inline-action-invoke',
        })
        return null
      }
      onInvoked?.(actionId, result.payload)
      return result.payload
    },
    [addToast, onInvoked],
  )

  const actions = useMemo<InlineAction[]>(() => {
    if (!backendItems) {
      // IPC not yet resolved: show stub
      return stubActions(ctx.nodeId)
    }
    if (backendItems.length === 0) {
      return []
    }
    return backendItems.map((item) => ({
      id: item.id,
      label: item.label,
      category: 'tools' as const,
      shortcut: item.shortcut || undefined,
      onSelect: () => void invokeAction(item.id),
    }))
  }, [backendItems, ctx.nodeId, invokeAction])

  return { actions, loading, invokeAction }
}
