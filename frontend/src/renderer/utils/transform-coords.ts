/**
 * Coordinate conversion utilities for the transform bounding box overlay.
 *
 * Three coordinate spaces:
 *   DOM:       Top-left of PreviewCanvas container, CSS pixels (mouse events)
 *   Canvas:    Top-left of the HTML5 canvas element, canvas pixels
 *   Transform: Center of canvas (0,0 = center), media pixels (ClipTransform x,y)
 *
 * The preview canvas is fitted inside its container via object-fit: contain logic.
 * The overlay SVG sits on top of the container and uses DOM coordinates.
 */

export interface CanvasLayout {
  /** Container element offset on screen */
  containerRect: DOMRect
  /** Canvas rendered width in CSS pixels (after contain-fit) */
  canvasDisplayWidth: number
  /** Canvas rendered height in CSS pixels (after contain-fit) */
  canvasDisplayHeight: number
  /** Offset of canvas within container (centering padding) */
  canvasOffsetX: number
  canvasOffsetY: number
  /** Project canvas resolution in media pixels */
  canvasWidth: number
  canvasHeight: number
}

/** Compute layout info from a container element and project resolution. */
export function computeCanvasLayout(
  containerEl: HTMLElement,
  _mediaWidth: number,
  _mediaHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): CanvasLayout {
  const containerRect = containerEl.getBoundingClientRect()
  const containerW = containerRect.width
  const containerH = containerRect.height

  // Contain-fit: scale media to fit container (never upscale beyond 1x)
  const displayScale = Math.min(containerW / canvasWidth, containerH / canvasHeight, 1)
  const canvasDisplayWidth = canvasWidth * displayScale
  const canvasDisplayHeight = canvasHeight * displayScale

  // Center within container
  const canvasOffsetX = (containerW - canvasDisplayWidth) / 2
  const canvasOffsetY = (containerH - canvasDisplayHeight) / 2

  return {
    containerRect,
    canvasDisplayWidth,
    canvasDisplayHeight,
    canvasOffsetX,
    canvasOffsetY,
    canvasWidth,
    canvasHeight,
  }
}

/** Convert DOM mouse position to transform coordinates (center-origin, media pixels). */
export function domToTransform(
  mouseX: number,
  mouseY: number,
  layout: CanvasLayout,
): { x: number; y: number } {
  // Position relative to canvas display area
  const relX = mouseX - layout.containerRect.left - layout.canvasOffsetX
  const relY = mouseY - layout.containerRect.top - layout.canvasOffsetY

  // Scale from display pixels to media pixels
  const scaleX = layout.canvasWidth / layout.canvasDisplayWidth
  const scaleY = layout.canvasHeight / layout.canvasDisplayHeight

  // Convert to center-origin
  const x = relX * scaleX - layout.canvasWidth / 2
  const y = relY * scaleY - layout.canvasHeight / 2

  return { x, y }
}

/** Convert transform coordinates to DOM position (for overlay rendering). */
export function transformToDom(
  tx: number,
  ty: number,
  layout: CanvasLayout,
): { x: number; y: number } {
  // From center-origin to top-left origin (media pixels)
  const mediaX = tx + layout.canvasWidth / 2
  const mediaY = ty + layout.canvasHeight / 2

  // Scale from media pixels to display pixels
  const scaleX = layout.canvasDisplayWidth / layout.canvasWidth
  const scaleY = layout.canvasDisplayHeight / layout.canvasHeight

  // Offset within container
  const x = mediaX * scaleX + layout.canvasOffsetX
  const y = mediaY * scaleY + layout.canvasOffsetY

  return { x, y }
}

/** Convert a size in media pixels to display pixels. */
export function mediaToDisplaySize(
  mediaW: number,
  mediaH: number,
  layout: CanvasLayout,
): { w: number; h: number } {
  const scaleX = layout.canvasDisplayWidth / layout.canvasWidth
  const scaleY = layout.canvasDisplayHeight / layout.canvasHeight
  return { w: mediaW * scaleX, h: mediaH * scaleY }
}

/** Convert a size in display pixels to media pixels. */
export function displayToMediaSize(
  displayW: number,
  displayH: number,
  layout: CanvasLayout,
): { w: number; h: number } {
  const scaleX = layout.canvasWidth / layout.canvasDisplayWidth
  const scaleY = layout.canvasHeight / layout.canvasDisplayHeight
  return { w: displayW * scaleX, h: displayH * scaleY }
}
