/**
 * useFonts — enumerate system fonts from the backend.
 * Caches the result for the session (fonts don't change).
 * Deduplicates concurrent requests via shared promise.
 */
import { useState, useEffect } from 'react'

export interface SystemFont {
  name: string
  path: string
  style: string
}

let cachedFonts: SystemFont[] | null = null
let loadingPromise: Promise<void> | null = null

export function useFonts(): { fonts: SystemFont[]; isLoading: boolean } {
  const [fonts, setFonts] = useState<SystemFont[]>(cachedFonts ?? [])
  const [isLoading, setIsLoading] = useState(cachedFonts === null)

  useEffect(() => {
    if (cachedFonts !== null) return

    let cancelled = false

    if (!loadingPromise) {
      loadingPromise = (async () => {
        if (!window.entropic) return
        const res = await window.entropic.sendCommand({ cmd: 'list_fonts' })
        if (res.ok && Array.isArray(res.fonts)) {
          cachedFonts = res.fonts as SystemFont[]
        }
      })()
    }

    loadingPromise
      .then(() => {
        if (!cancelled) {
          setFonts(cachedFonts ?? [])
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [])

  return { fonts, isLoading }
}
