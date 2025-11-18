const UNINITIALIZED = BigInt(0);

const bigIntMax = (...args) => args.reduce((m, e) => e > m ? e : m);
const bigIntMin = (...args) => args.reduce((m, e) => e < m ? e : m);

const blockComparator = (a, b) => {
  const aa = BigInt(a.address)
  const bb = BigInt(b.address)

  if (aa < bb) 
    return -1
  
  if (aa > bb)
    return 1
  
  return 0
}

// Filter to keep only ASCII characters (0-127)
function filterAsciiOnly(str) {
  if (!str) return str
  return str.split('').filter(char => char.charCodeAt(0) <= 127).join('')
}

function processBlock(block, idx, range) {
  const addr    = BigInt("0x" + block.Address)
	const size    = Number(block.Size)
	const state   = block.ChunkState
	const context = block.ContextType
	const tag     = filterAsciiOnly(block.Tag)

  let end = addr + BigInt(size)

  if (range.min === UNINITIALIZED || addr < range.min) {
    range.min = addr;
  }
          
  if (end > range.max) {
    range.max = end;
  }

  return {
    id:      idx,
		address: addr,
    end:     end,
		size:    size,
		state:   state,
		context: context,
		tag:     tag
	}
}

function processData(json) {
		const rawTags   = json.vizconf.colors.tag || {}
		// Filter tag keys to contain only ASCII characters
		const viztags   = {}
		for (const [key, value] of Object.entries(rawTags)) {
			const asciiKey = filterAsciiOnly(key)
			if (asciiKey) viztags[asciiKey] = value
		}
		const vizblocks = json.vizblocks
		
		const vizgroups = {
      seg: [],
      vs:  [],
      lfh: []
    }
		
		let globalIdx = 0

    // Compute combined range from seg0 and seg1 blocks to use for all groups
		// This ensures all three maps (seg, vs, lfh) use the same address scale


		let segRange = {min: UNINITIALIZED, max: BigInt(0)};
    let vsRange  = {min: UNINITIALIZED, max: BigInt(0)};
    let lfhRange = {min: UNINITIALIZED, max: BigInt(0)};

    // Handle blocks saved from SegmentHeap backend. 
    // Seg0 and Seg1 will be treated as a single "seg" group.
		if (vizblocks.seg0 && vizblocks.seg0.blocks) {
			vizgroups.seg = vizblocks.seg0.blocks.map(
        (block) => processBlock(block, globalIdx++, segRange)
      );
    } 

    if (vizblocks.seg1 && vizblocks.seg1.blocks) {
      vizgroups.seg = vizgroups.seg.concat(
        vizblocks.seg1.blocks.map(
          (block) => processBlock(block, globalIdx++, segRange)
      )
    );
  }

		// Handle blocks saved from VS (variable sized) allocator
		if (vizblocks.vs && vizblocks.vs.blocks) {
			vizgroups.vs = vizblocks.vs.blocks.map((block) => processBlock(block, globalIdx++, vsRange));
		}

		// Handle blocks saved from LFH (low fragmentation heap) allocator
		if (vizblocks.lfh && vizblocks.lfh.blocks) {
			vizgroups.lfh = vizblocks.lfh.blocks.map((block) => processBlock(block, globalIdx++, lfhRange));
		}

    // Sort all groups by address
    vizgroups.seg.sort(blockComparator);
    vizgroups.vs.sort(blockComparator);
    vizgroups.lfh.sort(blockComparator);

		return { 
      groups: vizgroups, 
      ranges: {
        map: {
          min: bigIntMin(
            segRange.min, vsRange.min, lfhRange.min),
          max: bigIntMax(
            segRange.max, vsRange.max, lfhRange.max)
        },
        seg: {
          min: segRange.min,
          max: segRange.max,
        },
        vs: {
          min: vsRange.min,
          max: vsRange.max,
        },
        lfh: {
          min: lfhRange.min,
          max: lfhRange.max,
        }
      },
      visconf: { 
        tags: viztags 
      }
    }
	}


async function handleLoad(data) {
  try {
    let response = processData(
      data
    );
    
    return { cmd: 'ready', ...response }
  } catch (err) {
    return { cmd: 'error', message: String(err) }
  }
}


// parser.worker.js
self.addEventListener('message', async (e) => {
	const { cmd, data } = e.data
	
	console.log('Worker received command:', cmd)

	if (cmd === 'parse') {
    self.postMessage( await handleLoad(JSON.parse(data)) )
	} else {
    self.postMessage({ cmd: 'error', message: 'Unknown command: ' + cmd })
  } 
})
