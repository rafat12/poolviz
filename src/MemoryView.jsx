import React, { useEffect, useRef, useState } from 'react'
import * as PIXI from 'pixi.js'
import { 
  PADDING, 
  BAR_SPACING, 
  clamp, 
  clampBigInt, 
  colorForState, 
  vizmapPointToAddress, 
  evClientPositionToCanvasPosition 
} from './helpers'

function vizviewFindGroupNameInPosition(vizview, x, y) {
  const groupNames = Object.keys(vizview.vizmaps)
  
  for (const groupName of groupNames) {
    const vizmap = vizview.vizmaps[groupName]
    if (y >= vizmap.y && y <= vizmap.y + vizmap.h) {
      return groupName
    }
  }
  
  return null
};
function vizviewFindBlockAtPosition(vizview, x, y) {
  const groupName = vizviewFindGroupNameInPosition(vizview, x, y)
  if (!groupName) return []
  
  const vizmap = vizview.vizmaps[groupName]
  const address = vizmapPointToAddress(x, vizmap, vizview.vizcontainer.width)
  if (!address) return []
  
  const groupBlocks = vizview.groups[groupName]
  
  // Binary search to find first block that might contain the address
  let left = 0
  let right = groupBlocks.length - 1
  let firstCandidate = -1
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (groupBlocks[mid].address <= address) {
      firstCandidate = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  
  if (firstCandidate === -1) return []
  
  // Check blocks around the found position (address might be in multiple overlapping blocks)
  const blocks = []
  for (let i = Math.max(0, firstCandidate - 10); i < Math.min(groupBlocks.length, firstCandidate + 10); i++) {
    const block = groupBlocks[i]
    if (address >= block.address && address < block.end) {
      blocks.push({ ...block, groupName })
    }
    // Stop if we've gone past the address
    if (block.address > address) break
  }
  
  return blocks
};
function vizviewDrawRects(vizview, rects, color) {
  // Extract RGB components
  const r = (color >> 16) & 0xFF;
  const g = (color >> 8) & 0xFF;
  const b = color & 0xFF;
  
  // Darken by 30%
  const darkerR = Math.floor(r * 0.7);
  const darkerG = Math.floor(g * 0.7);
  const darkerB = Math.floor(b * 0.7);
  
  const darkerColor = (darkerR << 16) | (darkerG << 8) | darkerB;
  
  vizview.gfx.setFillStyle({ color });
  vizview.gfx.setStrokeStyle({ color: darkerColor, width: 2 });
  for (let i = 0; i < rects.length; i++) {
    vizview.gfx.rect(rects[i].x, rects[i].y, rects[i].w, rects[i].h);
  }
  vizview.gfx.fill();
  vizview.gfx.stroke();
}
function vizviewDraw(vizview) {
  // vars for performance tracking
  const perfStartTime = performance.now()
  let perfTotalMerged = 0
  let perfTotalBlocks = 0
  let perfBlocksSkippedByVisibility = 0

  const batches = new Map()  
  const groupNames = Object.keys(vizview.groups)
  const drawWidth = vizview.vizcontainer.drawWidth

  for (let groupIndex = 0; groupIndex < groupNames.length; groupIndex++) {
    const groupName   = groupNames[groupIndex]
    const groupBlocks = vizview.groups[groupName]
    const vizmap      = vizview.vizmaps[groupName]
    
    perfTotalBlocks += groupBlocks.length

    // Bitmap: screenX -> { priority, worldY, worldH, color, blockId }
    // blockBoundaries: Set of screen X positions where blocks end
    const bitmap = new Map()
    const blockBoundaries = new Set()
    
    // Filter and convert blocks to chunks based on current zoom level
    // vizmap: { min, max, nbytes, y, h }
    //  - min is a visible address at the left edge of the bar
    //  - max is a visible address at the right edge of the bar
    //  - nbytes = max - min
    
    // Binary search to find first potentially visible block
    let startIdx = 0
    let endIdx = groupBlocks.length
    
    // Find first block that might be visible (block.end > vizmap.min)
    let left = 0
    let right = groupBlocks.length - 1
    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      if (groupBlocks[mid].end <= vizmap.min) {
        left = mid + 1
      } else {
        startIdx = mid
        right = mid - 1
      }
    }
    
    // Find last block that might be visible (block.address < vizmap.max)
    left = startIdx
    right = groupBlocks.length - 1
    endIdx = startIdx
    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      if (groupBlocks[mid].address < vizmap.max) {
        endIdx = mid + 1
        left = mid + 1
      } else {
        right = mid - 1
      }
    }
    
    perfBlocksSkippedByVisibility += groupBlocks.length - (endIdx - startIdx)
    
    // Only iterate through potentially visible blocks
    for (let i = startIdx; i < endIdx; i++) {
      const block = groupBlocks[i]
      
      if (block.address >= vizmap.max || block.end <= vizmap.min) {
        continue
      }
      
      // Apply state filter
      if (vizview.filterState !== 'all' && block.state !== vizview.filterState) {
        continue
      }
      
      const offset = Number(block.address - vizmap.min)
      const size   = Number(block.size)
      const x = PADDING + (offset / vizmap.nbytes) * drawWidth
        
      let w = Math.max(1, (size / vizmap.nbytes) * drawWidth)
      // Clamp to drawing bounds
      const endX = x + w
      if (endX > PADDING + drawWidth) {
        w = (PADDING + drawWidth) - x
      }

      // Convert to integer screen pixels for bitmap
      const screenXStart = Math.floor(x)
      const screenXEnd = Math.max(screenXStart + 1, Math.ceil(x + w))
      
      // Mark block boundary at the end position
      blockBoundaries.add(screenXEnd)
      
      const currentPriority = block.state === 'Allocated' ? 1 : 0
      let color = colorForState(block.state)
      
      // Highlight blocks with selected tag
      if (vizview.selectedTag && block.tag === vizview.selectedTag) {
        color = 0xFFD700  // Gold color for highlighted blocks
      }
      
      // Mark pixels with current priority (if higher or equal)
      for (let px = screenXStart; px < screenXEnd; px++) {
        const existing = bitmap.get(px)
        if (!existing || currentPriority >= existing.priority) {
          bitmap.set(px, { 
            priority: currentPriority,
            worldY: vizmap.y,
            worldH: vizmap.h,
            color: color
          })
        }
      }
    }
    
    if (bitmap.size === 0) 
      continue
    
    // Now convert the bitmap into rectangles
    
    const sortedPixels = Array.from(bitmap.keys()).sort((a, b) => a - b)
    
    let runStart = sortedPixels[0]
    let runPriority = bitmap.get(runStart).priority
    let runColor    = bitmap.get(runStart).color
    
    for (let i = 1; i <= sortedPixels.length; i++) {
      const currentX = i < sortedPixels.length ? sortedPixels[i] : null
      const prevX = sortedPixels[i - 1]
      const prevData = bitmap.get(prevX)
      
      // Check if run continues (consecutive pixels with same priority and color)
      // Break run if we hit a block boundary
      const runContinues = currentX !== null && 
                          currentX === prevX + 1 && 
                          bitmap.get(currentX).priority === runPriority &&
                          bitmap.get(currentX).color === runColor &&
                          !blockBoundaries.has(currentX)
      
      if (!runContinues) {
        // End of run - create rectangle
        const runEnd = prevX + 1
        
        if (!batches.has(runColor)) {
          batches.set(runColor, [])
        }
        
        const rect = {
          x: runStart,
          y: prevData.worldY,
          w: runEnd - runStart,
          h: prevData.worldH
        }
        
        batches.get(runColor).push(rect)
        
        // Start new run
        if (currentX !== null) {
          runStart = currentX
          const currentData = bitmap.get(currentX)
          runPriority = currentData.priority
          runColor = currentData.color
        }
      }
    }
  }
  
  // Draw batched by color
  const sortedBatches = Array.from(batches.entries()).sort((a, b) => {
    // Draw higher color values first so lower values appear on top
    return b[0] - a[0]
  });
  
  vizview.gfx.clear();

  let minX = Infinity
  let maxX = -Infinity
  
  for (const [color, rects] of sortedBatches) {
    perfTotalMerged += rects.length
    for (const rect of rects) {
      minX = Math.min(minX, rect.x)
      maxX = Math.max(maxX, rect.x + rect.w)
    }
    vizviewDrawRects(vizview, rects, color);
  }
  
  // Performance stat output
  const perfEndTime = performance.now()
  const perfDuration = (perfEndTime - perfStartTime).toFixed(2)
  
  console.log(`drawChunks(): blocks=${perfTotalBlocks} drawn=${perfTotalMerged} skipped=${perfBlocksSkippedByVisibility} time=${perfDuration}ms`)
  
  return {
    totalBlocks: perfTotalBlocks,
    drawn: perfTotalMerged,
    skipped: perfBlocksSkippedByVisibility,
    time: perfDuration
  }
};
function vizviewInit(gfx, vizview) {
  const groups = vizview.groups
  const ranges = vizview.ranges
  
  const groupNames = Object.keys(groups);

  for (let groupIndex = 0; groupIndex < groupNames.length; groupIndex++) {
    const groupName   = groupNames[groupIndex]
    const groupBlocks = groups[groupName]

    if (groupBlocks.length === 0) 
      continue
    
    const barH = (vizview.vizcontainer.drawHeight - (BAR_SPACING * (groupNames.length - 1))) / groupNames.length
    const barY = PADDING + groupIndex * (barH + BAR_SPACING)
    
    // initialy each map visualizes full memory range
    vizview.vizmaps[groupName] = {
      min: ranges.map.min,
      max: ranges.map.max,
      nbytes: Number(ranges.map.max - ranges.map.min),
      y: barY,
      h: barH
    }
    // initialy level of detail is 1 (full detail)
    vizview.vizlod[groupName] = 1
  }
  
  vizview.gfx = gfx
};

const MemoryView = React.forwardRef(function MemoryView({ groups, ranges, loading, zoomSpeed = 10, filterTag, filterState, syncSourceGroup, dragLocked }, ref) {
  const containerRef = useRef(null)
  const zoomSpeedRef = useRef(zoomSpeed)
  const dragLockedRef = useRef(dragLocked)
  const [tooltip, setTooltip] = useState(null)
  const [renderStats, setRenderStats] = useState(null)
  const [statsMinimized, setStatsMinimized] = useState(false)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef(null)
  const vizviewRef   = useRef({
    // hold size of the container where draw is happening
    vizcontainer:    {width: 0, height: 0, drawWidth: 0, drawHeight: 0},
    // hold state of each map (bar)
    // what memory range it vizualizes at current level of detail
    vizmaps:       {},
    // hold current level of detail per map (bar)
    // 1 = full detail, 2 = half detail, etc.
    vizlod:          {},
    gfx:             null,
    groups:          null,
    ranges:          null,
    selectedTag:     null,
    filterState:     'all',
  })
  
  const [, forceUpdate] = useState({})
  
  // Update refs when props change
  zoomSpeedRef.current = zoomSpeed
  dragLockedRef.current = dragLocked
  const selectedTag = filterTag && filterTag !== 'all' ? filterTag : null
  vizviewRef.current.selectedTag = selectedTag
  vizviewRef.current.filterState = filterState || 'all'

  // Expose methods to parent via ref
  React.useImperativeHandle(ref, () => ({
    resetZoom: ()            => vizviewResetZoom(vizviewRef.current),
    syncZoom: (sourceGroup)  => vizviewSyncZoom(vizviewRef.current, sourceGroup),
    searchAddress: (address) => vizviewSearchAddress(vizviewRef.current, address)
  }))

  // Re-draw when filterTag changes
  useEffect(() => {
    if (vizviewRef.current.gfx && groups && ranges) {
      const stats = vizviewDraw(vizviewRef.current)
      setRenderStats(stats)
    }
  }, [filterTag, filterState, groups, ranges])

  function vizviewUpdateMapLod(vizview, groupName, x, y, direction) {
    vizview.vizlod[groupName] = Math.max(1, vizview.vizlod[groupName] + direction * zoomSpeedRef.current)
    
    let vizmap = vizview.vizmaps[groupName]
    
    // Calculate new visible byte range
    const totalBytes = Number(vizview.ranges.map.max - vizview.ranges.map.min)
    
    const newVisibleBytes = totalBytes / vizview.vizlod[groupName]
    
    // Get mouse position as a ratio (0 to 1) across the drawing width
    const drawWidth = vizview.vizcontainer.drawWidth
    const offsetInBar = x - PADDING
    const mouseRatio = Math.max(0, Math.min(1, offsetInBar / drawWidth))
    
    // Calculate new center position (keep mouse position stable)
    const currentCenterAddr = vizmap.min + BigInt(Math.floor(vizmap.nbytes * mouseRatio))
    
    // Calculate new min/max centered on mouse position
    const newMin = currentCenterAddr - BigInt(Math.floor(newVisibleBytes * mouseRatio))
    const newMax = newMin + BigInt(Math.floor(newVisibleBytes))
    
    vizmap.min = newMin
    vizmap.max = newMax
    vizmap.nbytes = Number(newMax - newMin)
    
    console.debug(`level of detail for group '${groupName}' changed to${vizview.vizlod[groupName]}, visible bytes: ${vizmap.nbytes} min: ${vizmap.min.toString(16)} max: ${vizmap.max.toString(16)}`)

    // If sync source is set and we're zooming that group, apply to all groups
    if (syncSourceGroup === groupName) {
      const groupNames = Object.keys(vizview.vizmaps)
      for (const otherGroupName of groupNames) {
        if (otherGroupName !== groupName) {
          vizview.vizlod[otherGroupName] = vizview.vizlod[groupName]
          vizview.vizmaps[otherGroupName].min = vizmap.min
          vizview.vizmaps[otherGroupName].max = vizmap.max
          vizview.vizmaps[otherGroupName].nbytes = vizmap.nbytes
        }
      }
    }

    const stats = vizviewDraw(vizview)
    setRenderStats(stats)
  };
  function vizviewResetZoom(vizview) {
    const groupNames = Object.keys(vizview.vizmaps)
    
    for (const groupName of groupNames) {
      vizview.vizlod[groupName] = 1
      const vizmap = vizview.vizmaps[groupName]
      vizmap.min = vizview.ranges.map.min
      vizmap.max = vizview.ranges.map.max
      vizmap.nbytes = Number(vizview.ranges.map.max - vizview.ranges.map.min)
    }
    
    const stats = vizviewDraw(vizview)
    setRenderStats(stats)
  };
  function vizviewSyncZoom(vizview, sourceGroupName) {
    const groupNames = Object.keys(vizview.vizmaps)
    if (groupNames.length === 0 || !sourceGroupName || !vizview.vizmaps[sourceGroupName]) return
    
    // Copy the zoom level and visible range from the source group to all others
    const sourceMap = vizview.vizmaps[sourceGroupName]
    const sourceLod = vizview.vizlod[sourceGroupName]
    
    for (const groupName of groupNames) {
      vizview.vizlod[groupName] = sourceLod
      vizview.vizmaps[groupName].min = sourceMap.min
      vizview.vizmaps[groupName].max = sourceMap.max
      vizview.vizmaps[groupName].nbytes = sourceMap.nbytes
    }
    
    const stats = vizviewDraw(vizview)
    setRenderStats(stats)
  };
  function vizviewSearchAddress(vizview, address) {
    // Parse address (supports hex with or without 0x prefix)

    const rangeMin = vizview.ranges.map.min;
    const rangeMax = vizview.ranges.map.max;
    
    if (address < rangeMin || address >= rangeMax) {
      console.warn(`Address ${address.toString(16)} is outside the valid range: 0x${rangeMin.toString(16)} - 0x${rangeMax.toString(16)}`);
      return;
    }
    
    // Set view window to 2000 bytes on each side (4000 bytes total)
    const windowSize = 8000n;
    let newMin = address - 4000n;
    let newMax = address + 4000n;
    
    // Clamp to valid range
    if (newMin < rangeMin) {
      newMin = rangeMin;
      newMax = newMin + windowSize;
    }
    if (newMax > rangeMax) {
      newMax = rangeMax;
      newMin = newMax - windowSize;
    }
    
    // Apply to all groups
    const groupNames = Object.keys(vizview.vizmaps);
    const totalBytes = Number(rangeMax - rangeMin);
    
    for (const groupName of groupNames) {
      const vizmap = vizview.vizmaps[groupName];
      vizmap.min = newMin;
      vizmap.max = newMax;
      vizmap.nbytes = Number(newMax - newMin);
      
      // Update LOD to reflect the zoom level
      vizview.vizlod[groupName] = totalBytes / vizmap.nbytes;
    }
    
    const stats = vizviewDraw(vizview);
    setRenderStats(stats);
    
    console.log(`Centered on address 0x${address.toString(16)}, showing range 0x${newMin.toString(16)} - 0x${newMax.toString(16)}`);
  };
  function vizviewDragMaps(vizview, sourceGroupName, sourcePositions, sourceX, currentX, ) {
    // Calculate drag distance
    const deltaX = sourceX - currentX
    const vizmap = vizview.vizmaps[sourceGroupName]
          
    // Convert pixel delta to address delta (use the dragged bar's scale)
    const drawWidth = vizview.vizcontainer.drawWidth
    const pixelRatio = vizmap.nbytes / drawWidth
    const addressDelta = BigInt(Math.floor(deltaX * pixelRatio))

    const rangeMin = vizview.ranges.map.min
    const rangeMax = vizview.ranges.map.max
          
    // Update all groups that have initial positions stored
    for (const [groupName, groupSourcePosition] of Object.entries(sourcePositions)) {
      const groupMap = vizview.vizmaps[groupName]
            
      // Calculate new min/max for this group
      let newMin = groupSourcePosition.min + addressDelta
      let newMax = groupSourcePosition.max + addressDelta
      
      const rangeSize = newMax - newMin
            
      // Clamp to valid range
      newMin = clampBigInt(newMin, rangeMin, rangeMax - rangeSize)
      newMax = newMin + rangeSize
            
      // Update the view
      groupMap.min = newMin
      groupMap.max = newMax
      groupMap.nbytes = Number(newMax - newMin)
    }
          
    const stats = vizviewDraw(vizview)
    setRenderStats(stats)
  };

  useEffect(() => {
    if (!containerRef.current || !groups || !ranges) 
      return
    
    let app, gfx
    
    ;(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
      
      const containerWidth = containerRef.current.clientWidth
      const containerHeight = containerRef.current.clientHeight
      
      // Mutate vizviewRef in place to keep same object reference
      vizviewRef.current.vizcontainer = { 
        width:      containerWidth, 
        height:     containerHeight,
        drawWidth:  containerWidth - (PADDING * 2),
        drawHeight: containerHeight - (PADDING * 2)
      }
      vizviewRef.current.groups = groups
      vizviewRef.current.ranges = ranges
      vizviewRef.current.vizmaps = {}
      vizviewRef.current.vizlod = {}
      
      app = new PIXI.Application()
      
      await app.init({
        view:        document.querySelector("canvas"),
        background:  0x0b0b0b,
        width:       containerWidth,
        height:      containerHeight,
        antialias:   false,
        resolution:  1,
        autoDensity: false
      })
      
      containerRef.current.appendChild(app.canvas)
      
      gfx = new PIXI.Graphics()
      gfx.interactive = true;
      gfx.hitArea = new PIXI.Rectangle(0, 0, containerWidth, containerHeight);
      
      app.stage.addChild(gfx)

      vizviewInit(gfx, vizviewRef.current);
      const stats = vizviewDraw(vizviewRef.current)
      setRenderStats(stats)
      
      // Handle window resize
      const handleResize = () => {
        const newWidth = containerRef.current.clientWidth
        const newHeight = containerRef.current.clientHeight
        
        // Update canvas size
        app.renderer.resize(newWidth, newHeight)
        
        // Update vizview container dimensions
        vizviewRef.current.vizcontainer = {
          width: newWidth,
          height: newHeight,
          drawWidth: newWidth - (PADDING * 2),
          drawHeight: newHeight - (PADDING * 2)
        }
        
        // Update hit area
        gfx.hitArea = new PIXI.Rectangle(0, 0, newWidth, newHeight)
        
        // Update bar positions without resetting LOD
        const groupNames = Object.keys(vizviewRef.current.groups)
        const drawHeight = newHeight - (PADDING * 2)
        const barH = (drawHeight - (BAR_SPACING * (groupNames.length - 1))) / groupNames.length
        
        for (let groupIndex = 0; groupIndex < groupNames.length; groupIndex++) {
          const groupName = groupNames[groupIndex]
          const barY = PADDING + groupIndex * (barH + BAR_SPACING)
          
          if (vizviewRef.current.vizmaps[groupName]) {
            vizviewRef.current.vizmaps[groupName].y = barY
            vizviewRef.current.vizmaps[groupName].h = barH
          }
        }
        
        // Redraw with preserved zoom levels
        const stats = vizviewDraw(vizviewRef.current)
        setRenderStats(stats)
      }
      
      window.addEventListener('resize', handleResize)
      
      gfx.onwheel = (ev) => {
        const { x: canvasX, y: canvasY } = evClientPositionToCanvasPosition(ev, app.canvas)

        const groupName = vizviewFindGroupNameInPosition(
          vizviewRef.current, canvasX, canvasY);
        
        if (!groupName) return;
      
        vizviewUpdateMapLod(vizviewRef.current, groupName, canvasX, canvasY, ev.deltaY > 0 ? -1 : 1);
      }
      
      gfx.onmousedown = (ev) => {
        const { x: canvasX, y: canvasY } = evClientPositionToCanvasPosition(ev, app.canvas)
        
        const groupName = vizviewFindGroupNameInPosition(vizviewRef.current, canvasX, canvasY)
        if (!groupName) 
          return
        
        isDraggingRef.current = true
        
        // Store initial positions for all groups if locked, or just the dragged one
        let initialPositions = {}
        if (dragLockedRef.current) {
          const groupNames = Object.keys(vizviewRef.current.vizmaps)
          for (const gName of groupNames) {
            initialPositions[gName] = {
              min: vizviewRef.current.vizmaps[gName].min,
              max: vizviewRef.current.vizmaps[gName].max
            }
          }
        } else {
          initialPositions[groupName] = {
            min: vizviewRef.current.vizmaps[groupName].min,
            max: vizviewRef.current.vizmaps[groupName].max
          }
        }
        
        dragStartRef.current = {
          x: canvasX,
          groupName: groupName,
          initialPositions: initialPositions
        }
      }
      
      gfx.onmousemove = (ev) => {
        const { x: canvasX, y: canvasY } = evClientPositionToCanvasPosition(ev, app.canvas)
        
        if (isDraggingRef.current && dragStartRef.current) {
          vizviewDragMaps(
            vizviewRef.current,
            dragStartRef.current.groupName,
            dragStartRef.current.initialPositions,
            dragStartRef.current.x,
            canvasX
          )
        } else {
          // Tooltip logic (only when not dragging)
          const blocks = vizviewFindBlockAtPosition(vizviewRef.current, canvasX, canvasY)
          
          if (blocks.length > 0) {
            setTooltip({
              x: ev.clientX,
              y: ev.clientY,
              blocks
            })
          } else {
            setTooltip(null)
          }
        }
      }
      
      gfx.onmouseup = () => {
        isDraggingRef.current = false
        dragStartRef.current = null
      }
      
      gfx.onmouseout = () => {
        setTooltip(null)
        isDraggingRef.current = false
        dragStartRef.current = null
      }

      return () => {
        window.removeEventListener('resize', handleResize)
        if (app) 
          app.destroy(true)
      }
    })()
  }, [groups, ranges])

  return (
    <div className="memory-view-root">
      {renderStats && vizviewRef.current.vizmaps && (
        <div className="render-stats">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: statsMinimized ? 0 : '4px' }}>
            <strong>Performance: {renderStats.time}ms</strong>
            <button
              onClick={() => setStatsMinimized(!statsMinimized)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9aa0a6',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '0 4px'
              }}
            >
              {statsMinimized ? '▼' : '▲'}
            </button>
          </div>
          {!statsMinimized && (
            <>
              <div>Blocks: {renderStats.totalBlocks.toLocaleString()} | Drawn: {renderStats.drawn} | Skipped: {renderStats.skipped.toLocaleString()}</div>
              <div style={{ marginTop: '8px', borderTop: '1px solid #444', paddingTop: '6px' }}>
                {Object.keys(vizviewRef.current.vizmaps).map(groupName => {
                  const vizmap = vizviewRef.current.vizmaps[groupName]
                  const lod = vizviewRef.current.vizlod[groupName]
                  return (
                    <div key={groupName} style={{ marginTop: '4px' }}>
                      <strong>{groupName}:</strong> LOD {lod.toFixed(1)}x<br />
                      <span style={{ fontSize: '10px' }}>
                        {vizmap.nbytes.toLocaleString()} bytes<br />
                        0x{vizmap.min.toString(16)} - 0x{vizmap.max.toString(16)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
      <div ref={containerRef} className="canvas-container" />
      {loading && <div className="overlay">Loading...</div>}
      {tooltip && tooltip.blocks && tooltip.blocks.length > 0 && (
        <div 
          className="tooltip" 
          style={{ 
            left: tooltip.x + 10, 
            top: tooltip.y + 10 
          }}
        >
          <div><strong>{tooltip.blocks[0].groupName}</strong> - {tooltip.blocks.length} block{tooltip.blocks.length > 1 ? 's' : ''}</div>
          <div>Address: 0x{tooltip.blocks[0].address.toString(16)}</div>
          <div>Size: {tooltip.blocks[0].size} bytes</div>
          <div>State: {tooltip.blocks[0].state}</div>
          {tooltip.blocks[0].tag && <div>Tag: {tooltip.blocks[0].tag}</div>}
          {tooltip.blocks.length > 1 && (
            <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #444', fontSize: '11px', color: '#9aa0a6' }}>
              +{tooltip.blocks.length - 1} more block{tooltip.blocks.length > 2 ? 's' : ''} at this address
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default MemoryView
