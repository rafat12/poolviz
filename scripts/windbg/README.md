# WinDbg Pool Dump Script

This is a JavaScript PoC of WinDbg extension for dumping Windows Segment Heap pool allocations from kernel-mode debugging sessions. 

## Overview

`pooldump.js` provides commands to extract detailed memory allocation information from Windows Segment Heap pools (NonPagedPool, NonPagedPoolNx, PagedPool). The script analyzes heap structures including LFH (Low-Fragmentation Heap), VS (Variable Size), and Segment contexts, producing JSON output compatible with PoolViz.

> ATTENTION! This script is not very fast. For example, creating a full-state dump of a freshly loaded machine takes approximately one minute.

## Available commands

### `pooldump` - Full Pool Dump

```
!pooldump(<SegmentIndex>, <PoolNodeIndex>, <Flags>, <OutputPath>)
```
- `SegmentIndex` - Pool type (0: NonPagedPool, 1: NonPagedPoolNx, 2: PagedPool)
- `PoolNodeIndex` - Pool node index (use command without args to see available nodes)
- `Flags` - Bitmask to exclude contexts (1: Skip Seg0, 2: Skip Seg1, 4: Skip LFH, 8: Skip VS)
- `OutputPath` - Full path to output JSON file (e.g., `c:\dumps\pool.json`)

**Examples:**
```
!pooldump 0 0 0 c:\temp\nonpaged.json     # Dump all NonPagedPool contexts
!pooldump 2 0 12 c:\temp\paged.json       # Dump PagedPool, skip LFH and VS (flags: 4|8=12)
!pooldump                                 # Show number of available pool nodes
```

Additional commands are mainly dedicated for debugging purposes you may explore them for your own.

## Output Format

The JSON output follows this structure:

```json
{
  "vizconf": {
    "colors": {
      "state": {
        "Allocated": 0x2E86AB,
        "Free": 0xCCCCCC,
        "default": 0x888888
      },
      "tag": {}
    }
  },
  "vizblocks": {
    "seg0": {
      "blocks": [
        {
          "Address": "ffff8000abcd0000",
          "Size": 131072,
          "ContextType": "kSeg0",
          "ChunkState": "Allocated",
          "Tag": "File",
          "UserAddress": "ffff8000abcd0010"
        }
      ]
    },
    "seg1": { "blocks": [...] },
    "lfh": { "blocks": [...] },
    "vs": { "blocks": [...] }
  }
}
```

## License

AS IS