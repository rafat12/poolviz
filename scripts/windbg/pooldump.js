"use strict";

function initializeScript()
{
    return [
        new host.apiVersionSupport(1, 9),
        new host.functionAlias(__pooldump,     "pooldump"),

        new host.functionAlias(__pooldumplfh,  "pooldump_blocks_lfh"),
        new host.functionAlias(__pooldumpseg0, "pooldump_blocks_seg0"),
        new host.functionAlias(__pooldumpseg1, "pooldump_blocks_seg1"),
        new host.functionAlias(__pooldumpvs,   "pooldump_blocks_vs"),

        new host.functionAlias(__pooldumpsegment,  "pooldump_show_segmentheap"),
        new host.functionAlias(__pooldumppoolnode, "pooldump_show_poolnode"),
    ];
}

class __IteratorModel {
    constructor(collection, toString) {
        this.__collection = collection;

        if (toString)
            this.toString = () => toString(collection);
    };
    *[Symbol.iterator]() {
        for (var e of this.__collection) {
            yield e;
        }
    }
    Unwrap() {
        return this.__collection;
    }
    toString() {
        return `Total: ${this.__collection.length}`
    }
};
class __BitmapModel {
    constructor(quads, nbits) {
        this.__quads = quads;
        this.__nbits = nbits;
    }

    get Size() {
        return this.__nbits;
    }
    get TotalSizeInBits() {
        return this.__quads.length * 64;
    }
    get TotalSizeInBytes() {
        return this.__quads.length * 8;
    }
    get Quads() {
        return this.__quads;
    }
    
    Foreach(fn) {
        for (var bvQuadPos = 0; bvQuadPos < this.__quads.length; bvQuadPos++) {
            var bvQuad = this.__quads[bvQuadPos];

            for (var bvPos = 0; bvPos < 64; bvPos++) {
                let pos = bvQuadPos * 64 + bvPos;
                if (pos >= this.__nbits)
                    break;

                fn(pos, bvQuad.bitwiseShiftRight(bvPos).bitwiseAnd(1) );
            }
        }
    }
    DrawMap() {
        var view = ["<"] ;
        this.Foreach(
            function(pos, bit){
                if (bit == 1) {
                    view.push("X");
                } else {
                    view.push(".");
                }
            }
        );
        view.push(">");

        LogLn(view.join(""));
    }
    toString() {
        return `[Bitmap: ${this.Size} of bits]`;
    }
};
class __NamedValueModel {
    constructor(value, name) {
        this.__value = value;
        this.__name = name;
    }

    get Value() {
        return this.__value;
    }
    get Name() {
        return this.__name;
    }
    toString() {
        return `{ ${this.Name} }`
    }
};
class __CursorListModel {
    constructor(base, flink, blink) {
        this.__base = base;
        this.__flink = flink;
        this.__blink = blink;
    }
    get Flink() {
        return this.__flink;
    }
    get Blink() {
        return this.__blink;
    }
    get Base() {
        return this.__base;
    }
};
class __ListEntryModel {
    constructor(listHead, fnReadCursor, fnBuilder, toString) {
        this.__listHead = listHead;
        this.__fnReadCursor = fnReadCursor;
        this.__fnBuilder = fnBuilder;

        if (toString) {
            this.toString = toString;
        }
        this.__entries = []
        
        this.Reload()
    }
    *[Symbol.iterator]() {
        for (let e of this.__entries)
            yield e
    }
    static DoAction(listHead, fnReadCursor, fnBuilder, fnCallback) {
        var cursor = fnReadCursor(listHead);
        
        while (cursor.Flink != listHead) {
            cursor = fnReadCursor(cursor.Flink);
                    
            fnCallback(
                fnBuilder(cursor)     
            )
        }
    };
    Reload() {
        this.__entries = [];
        
        __ListEntryModel.DoAction(
            this.__listHead,
            this.__fnReadCursor,
            this.__fnBuilder,
            e => this.__entries.push(e)
        );
    }
    Unwrap() {
        return this.__entries;
    }
    toString() {
        return `${this.__listHead} [Type: _LIST_ENTRY]`;
    }
};
class __Buffer {
    constructor(address, size) {
        this.address = address;
        this.size = size;
        this.data = host.memory.readMemoryValues(address, size);
    }
    Read8(offset) {
        return this.data[offset];
    }
    Read16(offset) {
        return (this.data[offset + 1] << 8) | this.data[offset];
    }
    Read32(offset) {
        return (this.data[offset + 3] << 24) | (this.data[offset + 2] << 16) | (this.data[offset + 1] << 8) | this.data[offset];
    }
    Read64(offset) {
        return new Int64(this.Read32(offset), this.Read32(offset + 4));
    }
};
const ZeroI64 = host.parseInt64(0);

let LogLn = (x) => {
    host.diagnostics.debugLog(x);
    host.diagnostics.debugLog('\n');
};
let LogObj = (x) => LogLn(JSON.stringify(x));

let Filter = (seq, fn) => {
    var filtered = [];
    for (var e of seq) {
        if ( fn(e) ) {
            filtered.push(e);
        }
    }
    return filtered;
}

let Hex = (x) => x.toString(16);

let Read64 = (x) => host.memory.readMemoryValues(x, 1, 8)[0];
let Read8  = (x) => host.memory.readMemoryValues(x, 1, 1)[0];
let Read16 = (x) => host.memory.readMemoryValues(x, 1, 2)[0];
let Read32 = (x) => host.memory.readMemoryValues(x, 1, 4)[0];

let Util    = () => host.namespace.Debugger.Utility;
let Control = () => Util().Control;

let System = (x) => Control().ExecuteCommand(x);

let SizeOf  = (x, y)     => host.getModuleType(x, y).size;
let TypeOf  = (x, y)     => host.getModuleType(x, y)
let TypeAt  = (x, y, z)  => host.createTypedObject(z, TypeOf(x, y))
let TypePtr = (x, y, z)  => host.createPointerObject(z, x, y)

let SymbolAddress = (x, y) => host.getModuleSymbolAddress(x, y)

let CurProcess = () => host.namespace.Debugger.State.DebuggerVariables.curprocess;
let CurSession = () => host.namespace.Debugger.State.DebuggerVariables.cursession;
let CurThread  = () => host.namespace.Debugger.State.DebuggerVariables.curthread;

let ActiveProcessesList = () => Util().Collections.FromListEntry(
    TypeAt("nt", "_LIST_ENTRY", SymbolAddress("nt", "PsActiveProcessHead")),
    "nt!_EPROCESS",
    "ActiveProcessLinks"
);

let AddressType = (x) => x.bitwiseShiftRight(47) != ZeroI64;

let AddressModule = function(i64) {
    let process = CurProcess();
    if( !process || !process.Modules ) {
        return undefined;
    }
    var filtered = process.Modules.Where(
        x => i64.compareTo(x.BaseAddress) >= 0 && i64.compareTo(x.BaseAddress + x.Size) <=0)
    if (filtered.Count() == 0) {
        return undefined;
    }
    return filtered.First();
};

let Symbolize = function(i64) {
    var output = ""
    for (let line of Control().ExecuteCommand(`.printf "%y", ${Hex(i64)}`)) {
        output += line;
    }
    output = output.trim()

    if (output.indexOf("!") !== -1) {
        const i = output.indexOf(" (");
        if (i > 0)
            return output.slice(0, i).trim();
        
        return output;
    }

    let symbolizeKmAddres = function (kma) {
        let base = 0;
        let name = 0;
        
        var lines = [];
        
        for (let line of Control().ExecuteCommand(`lm a ${kma}`)) {
            lines.push(line);
        }

        if (lines.length == 2) {
            return "unknown!unknown";
        }

        let line = lines[2];
        let parts = line.trim().split(/\s+/);

        base = host.parseInt64(parts[0]);
        name = parts[2];

        return `${name}+${Hex(kma.subtract(base))}`;
    };
    let symbolizeUmAddress = function(uma) {
        let umaModule = AddressModule(uma);
        if (!umaModule) {
            return "unknown!unknown";
        }
        let parts = umaModule.Name.split("\\");
        let name = parts[parts.length - 1];

        return `${name}+${Hex(uma.subtract(umaModule.BaseAddress))}`; 
    };
    if (AddressType(i64)) {
        return symbolizeKmAddres(i64);
    } else {
        return symbolizeUmAddress(i64);
    }
};

let FindThreadByTid = function(processid, threadid) {
    if (threadid == undefined) {
        return undefined;
    }
    for (let proc of ActiveProcessesList()) {
        if (proc.UniqueProcessId.address != processid)
            continue;

        let threads = Util().Collections.FromListEntry(
            proc.ThreadListHead,
            "nt!_ETHREAD",
            "ThreadListEntry"
        );
        for (let th of threads) {
            if (Number(th.Cid.UniqueThread.address) === Number(threadid)) {
                return th;
            }
        }
    }
    return undefined;
};

let FileSystem = function() {
    return host.namespace.Debugger.Utility.FileSystem;
};
let OpenNewFile = function(filepath) {
    let fs = FileSystem();
    if (fs.FileExists(filepath))
        fs.DeleteFile(filepath)
    
    return fs.CreateFile(filepath)
};
let SaveJson = function(filepath, obj) {
    let fs = FileSystem();
    let file = OpenNewFile(filepath);
    let writer = fs.CreateTextWriter(file);
    writer.WriteLine(JSON.stringify(obj));
    file.Close();
};

const SegmentIndexNonPagedPool    = 0;
const SegementIndexNonPagedPoolNx = 1;
const SegementIndexPagedPool      = 2;

const LfhContextSizeRangeStart = 0;
const LfhContextSizeRangeEnd   = 0x200;
const VsContextSizeRangeStart  = 0x200;
const VsContextSizeRangeEnd    = 0x20000;
const SegContextSizeRange0Start = 0x20000;
const SegContextSizeRange0End   = 0x7f000;
const SegContextSizeRange1Start = 0x7f000;
const SegContextSizeRange1End   = 0x7f0000;

const LfhContextType   = 0;
const VsContextType    = 1;
const Seg0ContextType  = 2;
const Seg1ContextType  = 3;
const LargeContextType = 4;

const LfhGranularity = 16;

const LfhSubSegementTypeAvailable = 0;
const LfhSubSegementTypeFull = 1;

const ChunkStateAllocated = 0;
const ChunkStateFree = 1;

const AllocatedNamedValueModel = new __NamedValueModel(ChunkStateAllocated, "Allocated")
const FreeNamedValueModel      = new __NamedValueModel(ChunkStateFree,      "Free")
const UnknwnNamedValueModel    = new __NamedValueModel(-1,                  "Unknown")

const LfhContextNamedValueModel = new __NamedValueModel(LfhContextType, "kLFH")
const VsContextNamedValueModel  = new __NamedValueModel(VsContextType, "kVS")

const Seg0ContextNamedValueModel = new __NamedValueModel(Seg0ContextType, `kSeg0`)
const Seg1ContextNamedValueModel = new __NamedValueModel(Seg1ContextType, `kSeg1`)

let StateNamedValueModel = function(state) {
    switch(state) {
        case 1:  return AllocatedNamedValueModel;
        case 0:  return FreeNamedValueModel;
        default: return UnknwnNamedValueModel;
    };
}

let SystemPoolGlobals = () => TypeAt(
    "nt", "_RTLP_HP_HEAP_GLOBALS", SymbolAddress("nt", "RtlpHpHeapGlobals")
);
let SystemPool = () => TypeAt(
    "nt", "_EX_POOL_HEAP_MANAGER_STATE", SymbolAddress("nt", "ExPoolState"));
let SegmentHeap = (x, y, z) => y < x.NumberOfPools ? x.PoolNode[y].Heaps[z] : undefined;
let SystemPoolSegmentHeap = (y, z) => SegmentHeap(SystemPool(), y, z);

let LfhKey = () => SystemPoolGlobals().LfhKey;
let HeapKey = () => SystemPoolGlobals().HeapKey;

let SegContextBySize = (heap, size) => 
    (size > SegContextSizeRange0Start && size <= SegContextSizeRange0End) ? heap.SegContexts[0] : 
        (size > SegContextSizeRange1Start && size <= SegContextSizeRange1End) ? heap.SegContexts[1] : undefined;

let ContextTypeBySize = function(size) {
    if (size <= LfhContextSizeRangeEnd) {
        return LfhContextType;
    }
    if (size > VsContextSizeRangeStart && size <= VsContextSizeRangeEnd) {
        return VsContextType;
    }
    if (size > SegContextSizeRange0Start && size <= SegContextSizeRange0End) {
        return Seg0ContextType;
    }
    if (size > SegContextSizeRange1Start && size <= SegContextSizeRange1End) {
        return Seg1ContextType;
    }
    if (size > SegContextSizeRange1End) {
        return LargeContextType;
    }
    return -1;
};
let ContextByType = function(heap, contextType) {
    switch(contextType) {
        case LfhContextType:
            return heap.LfhContext;
        case VsContextType:
            return heap.VsContext;
        case Seg0ContextType:
            return heap.SegContexts[0];
        case Seg1ContextType:
            return heap.SegContexts[1];
        default:
            return undefined;
    }
}
let ContextBySize = (heap, size) => ContextByType(heap, ContextTypeBySize(size));

class PoolNode {
    constructor(node, index) {
        this.__node = node;
        this.__index  = index;
    }
    get Node() {
        return this.__node;
    };
    get Index() {
        return this.__index;
    }
    toString() {
        return `[Type: _EX_HEAP_POOL_NODE] (Index: ${this.__index})`
    }
};

class ChunkTag {
    constructor(itag, stag) {
        this.__itag = itag;
        this.__stag = stag;
    }
    get Tag() {
        return this.__stag;
    }
    get Source() {
        return this.__itag;
    }
    toString() {
        return `{ ${this.__stag} }`
    }
};

let Ztag = new ChunkTag(0xfafafafa, "Ztag");
let Ntag = new ChunkTag(0xfefefefe, "NULL");

let PoolTagAsString = function(address) {
    let header = TypeAt("nt", "_POOL_HEADER", address)
    let itag = header.PoolTag;
    var codes = []
    for (var i = 0; i < 4; i++) {
        codes.push( (itag >> (i * 8)) & 0xff )
    }
    if (itag == 0) {
        return Ntag;
    }
    return new ChunkTag(
        itag, String.fromCharCode(...codes));
};

class Chunk {
    constructor(address, size, userAddress, context, contextType, chunkState, tag) {
        this.__address = address;
        this.__userAddress = userAddress;
        this.__size = size;
        this.__context = context;
        this.__contextType = contextType;
        this.__chunkState = chunkState;
        
        this.__tag = tag;
        if (!this.__tag) 
            this.__tag = Ztag;
    }

    get Address() {
        return this.__address;
    }
    get UserAddress() {
        return this.__userAddress;
    }
    get Size() {
        return this.__size;
    }
    get Context() {
        return this.__context;
    }
    get ContextType() {
        return this.__contextType;
    }
    get ChunkState() {
        return this.__chunkState;
    }
    get Tag() {
        return this.__tag;
    }
    toString() {
        return `[Type: Chunk] State: ${this.ChunkState.Name} Address: ${this.Address} Size: ${this.Size} Tag: ${this.Tag}`;
    }
    toJson() {
        return {
            "Address":     Hex(this.Address),
            "Size":        this.Size,
            "ContextType": this.ContextType.Name,
            "ChunkState":  this.ChunkState.Name,
            "Tag":         this.Tag.Tag,
            "UserAddress": Hex(this.UserAddress)
        }
    }
};


let LfhSubSegments = (x) => Util().Collections.FromListEntry(x, "nt!_HEAP_LFH_SUBSEGMENT", "ListEntry");
let LfhSubSegmentsByType = function(bucket, subSegementType) {
    switch(subSegementType) {
        case LfhSubSegementTypeAvailable:
            return LfhSubSegments( bucket.State.AvailableSubsegmentList );
        case LfhSubSegementTypeFull:
            return LfhSubSegments( bucket.State.FullSubsegmentList );
        default:
            return undefined;
    }
};

class LfhSubSegment {
    constructor(subsegment, fnTransform) {
        this.__subsegment = subsegment;
        this.__key = LfhKey().bitwiseXor(this.__subsegment.address.bitwiseShiftRight(12));
        this.__encodedData = this.__key.bitwiseXor(this.__subsegment.BlockOffsets.EncodedData);

        this.__blocks = []
        this.__quads = []

        this.__fnTransform = fnTransform;

        this.Reload();
    }
    get SubSegment() {
        return this.__subsegment;
    }
    get BlockSize() {
        return this.__encodedData.bitwiseAnd(0xffff).convertToNumber();
    }
    get FirstBlockOffset() {
        return this.__encodedData.bitwiseShiftRight(16).bitwiseAnd(0xffff);
    }
    get Blocks() {
        return new __IteratorModel(
            this.__blocks
        )
    }
    get Bitmap() {
        return new __BitmapModel(
            this.__quads,
            this.BitmapSize
        );
    }
    get BitmapSize() {
        return this.__subsegment.BlockCount;
    }

    Reload() {
        this.__quads  = [];
        this.__blocks = [];

        let nquads = (this.__subsegment.BlockCount / 64) | 0;
        if (nquads == 0) {
            nquads = 1;
        }
        for (var i = 0; i < nquads; i++) {
            this.__quads.push(
                    this.__subsegment.BlockBitmap[i]
            );
        }

        let startAddress = this.__subsegment.address.add(this.FirstBlockOffset)

        this.Bitmap.Foreach
            ((pos, bit) => {
                let chunkAddress = startAddress.add(pos * this.BlockSize);
                let userAddress  = chunkAddress.add(16)
                
                let chunk = new Chunk(
                    chunkAddress,
                    this.BlockSize,
                    userAddress,
                    this.__subsegment,
                    LfhContextNamedValueModel,
                    StateNamedValueModel(bit.convertToNumber()),
                    PoolTagAsString(chunkAddress)
                )
                if (this.__fnTransform) {
                    chunk = this.__fnTransform(chunk)
                }
                this.__blocks.push(
                   chunk
                )
            }
        );
    }
    toString() {
        return `[Type: _HEAP_LFH_SUBSEGMENT]`
    }
}

class LfhBucket {
    constructor(bucket, fnTransform) {
        this.__bucket = bucket;
        this.__sizeRangeStart = bucket.State.BucketIndex * LfhGranularity;
        
        this.__subsegments = {};
        this.__fnTransform = fnTransform;

        this.Reload();
    }

    get Bucket() {
        return this.__bucket;
    };
    get Index() {
        return this.__bucket.State.BucketIndex;
    }
    get SizeRangeStart() {
        return this.__sizeRangeStart;
    }
    get SizeRangeEnd() {
        return this.__sizeRangeStart + LfhGranularity;
    }
    get SubSegmentsAvailable() {
        return new __IteratorModel(
            this.__subsegments[LfhSubSegementTypeAvailable],
            function(collection) {
                return `Total: ${collection.length} [Type: _HEAP_LFH_SUBSEGMENT]`;
            }
        );
    }
    get SubSegmentsFull() {
        return new __IteratorModel(
            this.__subsegments[LfhSubSegementTypeFull],
            function(collection) {
                return `Total: ${collection.length} [Type: _HEAP_LFH_SUBSEGMENT]`;
            }
        );
    }
    Reload() {
        this.__subsegments[LfhSubSegementTypeAvailable] = [];
        this.__subsegments[LfhSubSegementTypeFull]      = [];

        for (let subsegment of LfhSubSegmentsByType(this.__bucket, LfhSubSegementTypeFull)) {
            this.__subsegments[LfhSubSegementTypeFull].push(new LfhSubSegment(subsegment, this.__fnTransform))
        }
        for (let subsegment of LfhSubSegmentsByType(this.__bucket, LfhSubSegementTypeAvailable)) {
            this.__subsegments[LfhSubSegementTypeAvailable].push(new LfhSubSegment(subsegment, this.__fnTransform))
        }
    }
    toString() {
        return `[Type: _HEAP_LFH_BUCKET] (Index: ${this.Index})`
    }
};

class SegPageRangeDesc {
    constructor(desc, pageAddress, pageSize) {
        this.__desc = desc;
        this.__pageAddress = pageAddress;
        this.__pageSize = pageSize;
    }
    get Desc() {
        return this.__desc;
    }
    get PageAddress() {
        return this.__pageAddress
    }
    get PageSize() {
        return this.__pageSize
    }
    get PageState() {
        return StateNamedValueModel(this.__desc.RangeFlags & 1)
    }
    get HasLFH() {
        return (this.__desc.RangeFlags & 0x0C) == 0x08;
    }
    get HasVS() {
        return (this.__desc.RangeFlags & 0x0C) == 0x0C;
    }
    get IsBlockStart() {
        return (this.__desc.RangeFlags & 0x02) == 0x02;
    }
    get UnitSize() {
        return this.__desc.UnitSize
    }
    get BlockSize() {
        return this.PageSize * this.UnitSize
    }
    toString() {
        return `[Type: _HEAP_PAGE_RANGE_DESCRIPTOR]`
    }
}

class SegSegment {
    constructor(subsegment, segcontext, contextType, fnBlockTransform) {
        this.__subsegment = subsegment;
        this.__segcontext = segcontext

        this.__contextType = contextType;
        this.__pageSize = (1 << this.__segcontext.PagesPerUnitShift) * 0x1000

        this.__descArray = []
        this.__blocks    = []

        this.__fnBlockTransform = fnBlockTransform

        this.Reload();
    }
    get SubSegment() {
        return this.__subsegment;
    }
    get DescArray() {
        return new __IteratorModel(this.__descArray);
    }
    get Blocks() {
        return new __IteratorModel(this.__blocks);
    }
    Reload() {
        this.__descArray = []
        this.__blocks    = []

        for (var i = this.__segcontext.FirstDescriptorIndex; i < 256; i++) {
            let desc = this.__subsegment.DescArray[i];

            let pageAddress = this.__subsegment.address.add(i  * this.__pageSize );
            let descModel = new SegPageRangeDesc(
                desc,
                pageAddress,
                this.__pageSize
            );
            this.__descArray.push( descModel );
            
            if (descModel.IsBlockStart) {
                let chunk = new Chunk(
                    descModel.PageAddress,
                    descModel.BlockSize, 
                    descModel.PageAddress,
                    descModel, 
                    this.__contextType, 
                    descModel.PageState
                )
                if (this.__fnBlockTransform) {
                    chunk = this.__fnBlockTransform(chunk)
                }
                
                this.__blocks.push(   
                    chunk
                )
            }
        }

    }
    toString() {
        return `[Type: _HEAP_PAGE_SEGMENT]`
    }
}

class VsChunk {
    constructor(vsChunk) {
        this.__vsChunk = vsChunk;   
        
        let key = HeapKey()
        
        this.__decodedSizes = this.__vsChunk.Sizes.HeaderBits
            .bitwiseXor(key).bitwiseXor(this.__vsChunk.address)
    }
    get VsChunk() {
        return this.__vsChunk
    }
    get UnsafeSize() {
        return this.__decodedSizes
            .bitwiseAnd(0xffffffff).bitwiseShiftRight(16).bitwiseShiftLeft(4)
            .convertToNumber();
    }
    get UnsafePrevSize() {
        return this.__decodedSizes
            .bitwiseShiftRight(32).bitwiseAnd(0xffff).bitwiseShiftLeft(4)
            .convertToNumber();
    }
    get Allocated() {
        return this.__decodedSizes
            .bitwiseShiftRight(32).bitwiseShiftRight(16).bitwiseAnd(0xff)
            .convertToNumber();
    }
    toString() {
        return `[Type: _HEAP_VS_CHUNK_HEADER]`;
    }
}

class VsSubSegment {
    constructor(subsegment, vsContext, vsSlot, fnTransform) {
        this.__subsegment = subsegment;
        this.__vsContext  = vsContext
        this.__vsSlot     = vsSlot;
        this.__blocks = []

        this.__fnTransform = fnTransform;

        this.Reload()
    }
    get VsContext() {
        return this.__vsContext;
    }
    get VsSlot() {
        return this.__vsSlot;
    }
    get SubSegment() {
        return this.__subsegment;
    }
    get Blocks() {
        return new __IteratorModel(this.__blocks);
    }
    Reload() {
        this.__blocks = []
        
         let pageAlignmentEnabled = (this.__vsContext.Config.Flags.PageAlignLargeAllocs & 0x1) == 0x1

        let begin = this.__subsegment.address.add(0x30);
        let end   = begin.add(this.__subsegment.Size << 4);
        
        let key = HeapKey();
        var iter = begin;
        while ( iter.compareTo(end) < 0 ) {
            var vsChunk = TypeAt("nt", "_HEAP_VS_CHUNK_HEADER", iter);
            var vsChunkModel = new VsChunk(vsChunk);
            
            var poolAddress = iter.add(16);
            if (pageAlignmentEnabled && (iter.add(32).bitwiseAnd(0x0fff) == ZeroI64 ) ) {
                poolAddress = iter.add(32)
            }
            
            var tag = Ztag;
            if (vsChunkModel.Allocated == 1){
                tag = PoolTagAsString(poolAddress);
            }
            let chunk = new Chunk(
                iter,
                vsChunkModel.UnsafeSize,
                poolAddress.add(16),
                this.__subsegment,
                VsContextNamedValueModel,
                StateNamedValueModel(vsChunkModel.Allocated),
                tag
            );
            if (this.__fnTransform) {
                chunk = this.__fnTransform(chunk)
            }
            this.__blocks.push(
                chunk   
            );

            iter = iter.add(vsChunkModel.UnsafeSize)
        }
    }
    toString() {
        return `[Type: _HEAP_VS_SUBSEGMENT]`;
    }
}

class VsContext {
    constructor(vsContext, fnTransform) {
        this.__vsContext = vsContext;
        this.__slots = []
        this.__subsegments = []
        
        this.__fnTransform = fnTransform;

        this.Reload();
    }
    get VsContext() {
        return this.__vsContext;
    }
    get AffinitySlots() {
        return new __IteratorModel(this.__slots)
    }
    get SubSegments() {
        return new __IteratorModel(this.__subsegments);
    }
    Reload() {
        this.__slots = []
        this.__subsegments = []

        let indexSlot = Read16(
            this.__vsContext.address.add(
                (this.__vsContext.SlotMapRef << 6)
            )
        );
        let slot = TypeAt(
            "nt", "_HEAP_VS_AFFINITY_SLOT",
            this.__vsContext.address.add(indexSlot << 6)
        )
        this.__slots.push(
            slot
        )
        __ListEntryModel.DoAction(
            slot.SubsegmentList.address,
            (base) => new __CursorListModel(
                base, 
                Read64(base).bitwiseXor(base),
                Read64(base.add(8)).bitwiseXor(base),
            ),
            (cursor) => {
                return new VsSubSegment(
                    TypeAt("nt", "_HEAP_VS_SUBSEGMENT", cursor.Base), this.__vsContext, slot, this.__fnTransform)
            }, 
            (e) => {
                this.__subsegments.push(e);
            }
        )
    }
    toString() {
        return `[Type: _HEAP_VS_CONTEXT]`
    }
}

let SegSubSegments = (x) => Util().Collections.FromListEntry(x, "nt!_HEAP_PAGE_SEGMENT", "ListEntry");

let LfhBlocks = (segment, fnTransform) => {
    var blocks = [];
    for (let bucket of segment.LfhContext.Buckets) {
        if (bucket.address.bitwiseAnd(0x01) != ZeroI64) {
            continue;
        }
        let bucketModel = new LfhBucket(bucket, fnTransform);
        for (let subsegment of bucketModel.SubSegmentsAvailable) {
            for (let block of subsegment.Blocks.Unwrap()) {
                blocks.push(block);
            }
        }
    }
    return blocks;
};
let SegBlocks = (segment, segIndex, fnTransform) => {
    var blocks = [];
    for(let subsegment of SegSubSegments(segment.SegContexts[segIndex].SegmentListHead )) {
        let subsegmentModel = new SegSegment(
            subsegment, 
            segment.SegContexts[segIndex], 
            segIndex == 0 ? Seg0ContextNamedValueModel : Seg1ContextNamedValueModel,
            fnTransform
        );
        for (let block of subsegmentModel.Blocks.Unwrap()) {
            blocks.push(block);
        }
    }
    return blocks;
};
let VsBlocks = (segment, fnTransform) => {
    var blocks = [];
    for (let subsegment of new VsContext(segment.VsContext, fnTransform).SubSegments.Unwrap()) {
        for (let block of subsegment.Blocks.Unwrap()) {
            blocks.push(block);
        }
    }
    return blocks;
}

const ColorAllocated = 0x2E86AB
const ColorFree      = 0xCCCCCC
const ColorDefault   = 0x888888

function __pooldump(segmentIndex, poolNodeIndex, flags, filepath) {
    let systemPool = SystemPool();
    if (poolNodeIndex === undefined) {
        LogLn(`NumberOfPools = ${systemPool.NumberOfPools}`);
        return;
    }
    if (poolNodeIndex > systemPool.NumberOfPools) {
        LogLn(`Pool Node Index is too big. Value rang is (0, ${systemPool.NumberOfPools})`);
        return;
    }
    if (filepath === undefined) {
        LogLn("Output filepath is not specified. Usage !dump_pool <SegmentType> <PoolNodeIndex> <flags> <output filepath>");
        return;
    }
    
    var blocks0Json   = [];
    var blocks1Json   = [];
    var blocksLfhJson = [];
    var blocksVsJson  = [];
    
    let start = Date.now();

    LogLn("[stage 1/5] dump Seg0 blocks")
    if ((flags & 1) != 1) {
        blocks0Json = SegBlocks(
            SegmentHeap(systemPool, poolNodeIndex, segmentIndex), 0, x => x.toJson());
    }
    LogLn("[stage 2/5] dump Seg1 blocks")
    if ((flags & 2) != 2) {
        blocks1Json = SegBlocks(
            SegmentHeap(systemPool, poolNodeIndex, segmentIndex), 1, x => x.toJson())
    }
    LogLn("[stage 3/5] dump LFH blocks")
    if ((flags & 4) != 4) {
        blocksLfhJson = LfhBlocks(
            SegmentHeap(systemPool, poolNodeIndex, segmentIndex), x => x.toJson()
        )
    }
    LogLn("[stage 4/5] dump VS blocks")
    if ((flags & 8) != 8) {
        blocksVsJson = VsBlocks(
            SegmentHeap(systemPool, poolNodeIndex, segmentIndex), x => x.toJson()
        )
    }
    LogLn("[stage 5/5] save file")
    SaveJson(filepath, {
        "vizconf": {
            "colors": {
                "state": {
                    "Allocated": ColorAllocated,
                    "Free":      ColorFree,
                    "default":   ColorDefault
                }, 
                "tag": {

                }
            }
        },
        "vizblocks":  {
            "seg0": {
                "blocks": blocks0Json
            },
            "seg1": {
                "blocks": blocks1Json
            },
            "lfh": {
                "blocks": blocksLfhJson
            },
            "vs": { 
                "blocks": blocksVsJson
            }
        }
    })
    let end = Date.now();

    LogLn(`Blocks dump saved. Bye! Elapsed time: ${end - start} ms`);
}
function __pooldumplfh(segmentIndex, poolNodeIndex) {
    if ( segmentIndex < 0 ) {
        LogLn("SegmentType is unknnown. usage !dump_pool_lfh <SegmentType (NonPagedPool, NonPagedPoolNx, PagedPool)>")
        return;
    }
    let systemPool = SystemPool();
    if (poolNodeIndex === undefined) {
        LogLn(`NumberOfPools = ${systemPool.NumberOfPools}`);
        return;
    }
    if (poolNodeIndex > systemPool.NumberOfPools) {
        LogLn(`Pool Node Index is too big. Value rang is (0, ${systemPool.NumberOfPools})`);
        return;
    }
    return LfhBlocks(
        SegmentHeap(systemPool, poolNodeIndex, segmentIndex)
    );
};
function __pooldumpvs(segmentIndex, poolNodeIndex) {
    let systemPool = SystemPool();
    if (poolNodeIndex === undefined) {
        LogLn(`NumberOfPools = ${systemPool.NumberOfPools}`);
        return;
    }
    if (poolNodeIndex > systemPool.NumberOfPools) {
        LogLn(`Pool Node Index is too big. Value rang is (0, ${systemPool.NumberOfPools})`);
        return;
    }
    return VsBlocks(SegmentHeap(systemPool, poolNodeIndex, segmentIndex))
}
function __pooldumpseg0(segmentIndex, poolNodeIndex) {
    let systemPool = SystemPool();
    if (poolNodeIndex === undefined) {
        LogLn(`NumberOfPools = ${systemPool.NumberOfPools}`);
        return;
    }
    if (poolNodeIndex > systemPool.NumberOfPools) {
        LogLn(`Pool Node Index is too big. Value rang is (0, ${systemPool.NumberOfPools})`);
        return;
    }
    let segment = SegmentHeap(systemPool, poolNodeIndex, segmentIndex);
    return Array.from(
        SegSubSegments(segment.SegContexts[0].SegmentListHead ) 
    )
    .map( 
        x => new SegSegment(
            x, 
            segment.SegContexts[0], 
            new __NamedValueModel(Seg0ContextType, `kSeg0`)
        )
    )
}
function __pooldumpseg1(segmentIndex, poolNodeIndex) {
    let systemPool = SystemPool();
    if (poolNodeIndex === undefined) {
        LogLn(`NumberOfPools = ${systemPool.NumberOfPools}`);
        return;
    }
    if (poolNodeIndex > systemPool.NumberOfPools) {
        LogLn(`Pool Node Index is too big. Value rang is (0, ${systemPool.NumberOfPools})`);
        return;
    }
    let segment = SegmentHeap(systemPool, poolNodeIndex, segmentIndex)
    
    return Array.from(
        SegSubSegments(segment.SegContexts[1].SegmentListHead ) 
    )
    .map( 
        x => new SegSegment(
            x, 
            segment.SegContexts[1], 
            new __NamedValueModel(Seg0ContextType, `kSeg1`)
        )
    )
}
function __pooldumpsegment(segmentIndex, poolNodeIndex) {
    if (segmentIndex < 0) {
        LogLn("SegmentType is unknnown. usage !pooldump_show_segmentheap <SegmentIndex> <PoolNodeIndex>")
        return;
    }

    let pool = SystemPool();
    if (poolNodeIndex === undefined) {
        LogLn(`NumberOfPools = ${pool.NumberOfPools}`);
        return;
    }
    if (poolNodeIndex > pool.NumberOfPools) {
        LogLn(`Pool Node Index is too big. Max value is ${pool.NumberOfPools}`);
        return;
    }

    return SegmentHeap(pool, poolNodeIndex, segmentIndex);
};
function __pooldumppoolnode(poolnodeindex) {
    if (segmentIndex < 0) {
        LogLn("SegmentType is unknnown. usage !pooldump_show_segmentheap <SegmentIndex> <PoolNodeIndex>")
        return;
    }

    let pool = SystemPool();
    if (poolNodeIndex === undefined) {
        LogLn(`NumberOfPools = ${pool.NumberOfPools}`);
        return;
    }
    if (poolNodeIndex > pool.NumberOfPools) {
        LogLn(`Pool Node Index is too big. Max value is ${pool.NumberOfPools}`);
        return;
    }

    return pool.PoolNode[poolnodeindex];
};