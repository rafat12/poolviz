import React, { useEffect, useState, useMemo } from 'react'
import MemoryView from './MemoryView'

function hexToBigInt(hex) {
  const clean = hex.trim().toLowerCase();
  if (clean.startsWith('0x')) {
    return BigInt(clean);
  } else if (/^[0-9a-f]+$/.test(clean)) {
    return BigInt('0x' + clean);
  } else {
    console.error('Invalid address format. Use hex format like 0xffff800012345678 or ffff800012345678');
    
    return undefined;
  }
}

export default function App() {
  const [groups, setGroups] = useState(null) // { seg:[], vs:[], lfh:[] }
  const [ranges, setRanges] = useState(null) // { seg:range, vs:range, lfh:range }
  const [visconf, setVisconf] = useState({ tags: {} })
  const [loading, setLoading] = useState(false)
  const [filterState, setFilterState] = useState('all')
  const [filterTag, setFilterTag] = useState('all')
  const [searchAddr, setSearchAddr] = useState('')
  const [zoomSpeed, setZoomSpeed] = useState(100)
  const [syncSourceGroup, setSyncSourceGroup] = useState('')
  const [dragLocked, setDragLocked] = useState(false)
  const [worker, setWorker] = useState(null)
  const memoryViewRef = React.useRef(null)

  useEffect(() => {
    // Initialize worker
    const worker = new Worker(
      new URL('./parser.worker.js', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e) => {
      console.log('Worker message received:', e.data.cmd, e.data)
      
      if (e.data.cmd === 'ready') {
        setGroups(e.data.groups || null)
        setRanges(e.data.ranges || null)
        setVisconf(e.data.visconf || { tags: {} })
        setLoading(false)
      }
      
      if (e.data.cmd === 'error') {
        console.error('Worker error:', e.data.message)
        setLoading(false)
      }
    }
    worker.onerror = (err) => {
      console.error('Worker error event:', err)
      setLoading(false)
    }

    setWorker(worker)
    
    return () => worker.terminate()
  }, [])

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) 
      return

    console.log('File selected:', file.name, file.size, 'bytes')
    setLoading(true)
    setGroups(null)
    setRanges(null)
    setVisconf({ tags: {} })

    const reader = new FileReader()
    reader.onload = (event) => {
      console.log('File read complete, sending to worker...')
      if (worker) {
        worker.postMessage({ cmd: 'parse', data: event.target.result })
      }
    }
    reader.onerror = (err) => {
      console.error('File read error:', err)
      setLoading(false)
    }
    reader.readAsText(file)
  }

  const highlightAddr = useMemo(() => {
    if (!searchAddr.trim()) return null
    return searchAddr.trim().toLowerCase()
  }, [searchAddr])

  // Convert color to CSS hex string
  const toCssColor = (color) => {
    if (!color) return '#888888'
    if (typeof color === 'string') {
      if (color.startsWith('#') || color.startsWith('rgb')) return color
      if (color.startsWith('0x')) return '#' + color.slice(2)
      // Try to parse as hex string
      if (/^[0-9a-fA-F]{6}$/.test(color)) return '#' + color
    }
    if (typeof color === 'number') {
      // Convert decimal to hex
      return '#' + color.toString(16).padStart(6, '0')
    }
    return '#888888'
  }

  const stats = useMemo(() => {
    if (!groups) return null
    const all = [...(groups.seg || []), ...(groups.vs || []), ...(groups.lfh || [])]
    const allocated = all.filter(c => c.state === 'Allocated').length
    const free = all.filter(c => c.state === 'Free').length
    return { total: all.length, allocated, free }
  }, [groups])

  const uniqueTags = useMemo(() => {
    if (!groups) return []
    const all = [...(groups.seg || []), ...(groups.vs || []), ...(groups.lfh || [])]
    const tags = new Set()
    all.forEach(c => {
      if (c.tag) {
        // Only include tags with ASCII printable characters (32-126)
        const isAscii = [...c.tag].every(char => {
          const code = char.charCodeAt(0)
          return code >= 32 && code <= 126
        })
        if (isAscii) {
          tags.add(c.tag)
        }
      }
    })
    return Array.from(tags).sort()
  }, [groups])

  return (
    <div className="app-root">
      <header className="toolbar">
        <h1>PoolViz</h1>
        <div className="file-upload">
          <label htmlFor="file-input" className="file-label">
            📁 Load JSON
          </label>
          <input
            id="file-input"
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>
        {stats && (
          <div className="stats">
            <span>{stats.total} total</span>
            <span className="allocated">{stats.allocated} allocated</span>
            <span className="free">{stats.free} free</span>
          </div>
        )}
        {groups && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              onClick={() => memoryViewRef.current?.resetZoom()}
              style={{
                padding: '4px 12px',
                background: '#444',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
            <button 
              onClick={() => setDragLocked(!dragLocked)}
              style={{
                padding: '4px 12px',
                background: dragLocked ? '#2E86AB' : '#444',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
              title={dragLocked ? 'Drag moves all bars' : 'Drag moves single bar'}
            >
              {dragLocked ? '🔒' : '🔓'}
            </button>
            <select
              value={syncSourceGroup}
              onChange={(e) => setSyncSourceGroup(e.target.value)}
              style={{
                padding: '4px 8px',
                border: '1px solid #333',
                background: '#1a1a1a',
                color: '#eee',
                borderRadius: '3px',
                fontSize: '13px'
              }}
            >
              <option value="">Select group...</option>
              {Object.keys(groups).map(groupName => (
                <option key={groupName} value={groupName}>{groupName}</option>
              ))}
            </select>
            <button 
              onClick={() => {
                if (syncSourceGroup) {
                  memoryViewRef.current?.syncZoom(syncSourceGroup)
                }
              }}
              disabled={!syncSourceGroup}
              style={{
                padding: '4px 12px',
                background: '#444',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                fontSize: '13px',
                cursor: syncSourceGroup ? 'pointer' : 'not-allowed',
                opacity: syncSourceGroup ? 1 : 0.5
              }}
            >
              Sync All
            </button>
          </div>
        )}
        <div className="controls">
          <select value={filterState} onChange={(e) => setFilterState(e.target.value)}>
            <option value="all">All States</option>
            <option value="Allocated">Allocated</option>
            <option value="Free">Free</option>
          </select>
          <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
            <option value="all">All Tags</option>
            {uniqueTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search address (e.g., 0xffff800012345678)..."
            value={searchAddr}
            onChange={(e) => setSearchAddr(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && searchAddr.trim()) {
                const address = hexToBigInt(searchAddr);
                if (address !== undefined)
                  memoryViewRef.current?.searchAddress(address);
              }
            }}
          />
          <button
            onClick={() => {
              if (searchAddr.trim()) {
                const address = hexToBigInt(searchAddr);
                if (address !== undefined)
                  memoryViewRef.current?.searchAddress(address);
              }
            }}
            disabled={!searchAddr.trim()}
            style={{
              padding: '4px 12px',
              background: searchAddr.trim() ? '#444' : '#333',
              color: searchAddr.trim() ? '#fff' : '#666',
              border: 'none',
              borderRadius: '3px',
              fontSize: '13px',
              cursor: searchAddr.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Search
          </button>
        </div>
        {stats && (
          <div className="zoom-speed-control-toolbar">
            <label>Zoom:</label>
            <input 
              type="range" 
              min="1" 
              max="10000" 
              step="1" 
              value={zoomSpeed} 
              onChange={(e) => setZoomSpeed(parseFloat(e.target.value))}
            />
            <span>{zoomSpeed}x</span>
          </div>
        )}
        <div className="info">
          {loading ? 'Loading...' : ranges && ranges.seg ? `seg: ${ranges.seg.min.toString(16)}..${ranges.seg.max.toString(16)}` : 'No file loaded'}
        </div>
        {/* Legend: show tag colors from visconf */}
        <div className="legend">
          {visconf && visconf.tags && Object.keys(visconf.tags).length > 0 ? (
            Object.entries(visconf.tags).map(([tag, color]) => (
              <div key={tag} className="legend-item">
                <span className="legend-swatch" style={{ background: toCssColor(color) }} />
                <span className="legend-label">{tag}</span>
              </div>
            ))
          ) : (
            <div className="legend-empty">No tag colors</div>
          )}
        </div>
      </header>
      <main className="main">
        <MemoryView 
          ref={memoryViewRef}
          groups={groups} 
          ranges={ranges} 
          visconf={visconf} 
          loading={loading} 
          filterState={filterState} 
          filterTag={filterTag} 
          highlightAddr={highlightAddr} 
          zoomSpeed={zoomSpeed}
          syncSourceGroup={syncSourceGroup}
          dragLocked={dragLocked}
        />
      </main>
    </div>
  )
}
