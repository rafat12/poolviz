export const PADDING = 40
export const BAR_SPACING = 8

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function clampBigInt(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function colorForState(state) {
  switch (state) {
    case 'Allocated': return 0x2E86AB
    case 'Free': return 0xCCCCCC
    default: return 0x888888
  }
}
export function vizmapPointToAddress(x, vizmap, containerWidth) {
  const drawWidth = containerWidth - (PADDING * 2)
  const offsetInBar = x - PADDING
  
  if (offsetInBar < 0 || offsetInBar > drawWidth) {
    return null
  }
  
  const minAddress = vizmap.min
  const maxAddress = vizmap.max
  const totalBytes = vizmap.nbytes
  
  const addressOffset = (offsetInBar / drawWidth) * totalBytes
  const address = minAddress + BigInt(Math.floor(addressOffset))
  
  return address
}
export function evClientPositionToCanvasPosition(ev, canvas) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ev.clientX - rect.left,
    y: ev.clientY - rect.top
  }
}
