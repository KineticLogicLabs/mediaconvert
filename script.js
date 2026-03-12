/**
 * MediaConvert Logic - Professional Multi-File Version
 * (c) 2026 Kinetic Logic Labs - v2.0 Optimized
 */

// --- 1. GLOBAL UI & CONFIG ---
let currentVisibleCategory = null;
const ENGINES = {
    IMAGE: { title: "Images", ext: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'ico', 'heic', 'heif', 'tiff', 'svg', 'avif'], targets: ['png', 'jpg', 'webp', 'bmp', 'ico', 'tiff'], icon: 'fa-image', color: 'bg-blue-50 text-blue-500' },
    VIDEO: { title: "Videos", ext: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', '3gp', 'ogv', 'mpeg', 'ts'], targets: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'gif'], icon: 'fa-video', color: 'bg-rose-50 text-rose-500' },
    AUDIO: { title: "Audio", ext: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'aiff', 'opus'], targets: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'], icon: 'fa-music', color: 'bg-purple-50 text-purple-500' },
    DATA: { title: "Data & Docs", ext: ['xlsx', 'csv', 'json', 'txt', 'md', 'pdf', 'html', 'xml'], targets: ['pdf', 'xlsx', 'csv', 'json', 'txt', 'md', 'html'], icon: 'fa-file-code', color: 'bg-emerald-50 text-emerald-500' }
};

let ffmpeg = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;
const state = { queue: [] };

// --- 2. ENGINE INITIALIZATION ---
async function initFFmpeg() {
    if (ffmpegLoaded) return true;
    if (ffmpegLoading) return new Promise(resolve => {
        const check = setInterval(() => { if (ffmpegLoaded) { clearInterval(check); resolve(true); } }, 100);
    });

    ffmpegLoading = true;
    if (typeof SharedArrayBuffer === 'undefined') {
        ffmpegLoading = false;
        showSecurityWarning(true);
        return false;
    }

    try {
        ffmpeg = FFmpeg.createFFmpeg({ 
            log: false, 
            corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js' 
        });
        await ffmpeg.load();
        ffmpegLoaded = true;
        ffmpegLoading = false;
        return true;
    } catch (e) {
        console.error("FFmpeg Init Error:", e);
        ffmpegLoading = false;
        return false;
    }
}

// --- 3. CORE PROCESSING ---
async function runConversion(id) {
    const item = state.queue.find(i => i.id === id);
    if (!item || item.status === 'working') return;

    item.status = 'working';
    item.progress = 1;
    render();

    try {
        const target = item.outputFormat;
        let blob;

        if (item.category === 'VIDEO' || item.category === 'AUDIO') {
            const ready = await initFFmpeg();
            if (!ready) throw new Error("FFmpeg could not initialize. Check COOP/COEP headers.");
            blob = await processMediaFFmpeg(item, target);
        } else if (item.category === 'IMAGE') {
            blob = await processImage(item.file, target);
        } else if (item.category === 'DATA') {
            blob = await processData(item.file, target);
        }

        item.result = blob;
        item.status = 'done';
        item.progress = 100;
    } catch (err) {
        item.status = 'error';
        item.errorMsg = err.message || "Conversion failed";
    }
    render();
}

async function processMediaFFmpeg(item, target) {
    const inName = `input_${item.id}`;
    const outName = `output_${item.id}.${target}`;
    
    // Write file to FFmpeg Virtual FS
    ffmpeg.FS('writeFile', inName, await FFmpeg.fetchFile(item.file));
    
    // Set Progress Hook
    ffmpeg.setProgress(({ ratio }) => {
        item.progress = Math.max(1, Math.min(99, Math.floor(ratio * 100)));
        render();
    });

    const args = ['-i', inName];

    if (item.category === 'AUDIO') {
        // -vn: Remove video/album art streams (critical for stability)
        // -map 0:a:0: Force only the first audio stream
        args.push('-vn', '-map', '0:a:0');
        
        const audioCodecs = {
            'mp3': ['-c:a', 'libmp3lame', '-q:a', '2'],
            'wav': ['-c:a', 'pcm_s16le'],
            'ogg': ['-c:a', 'libvorbis', '-q:a', '4'],
            'aac': ['-c:a', 'aac'],
            'm4a': ['-c:a', 'aac'],
            'flac': ['-c:a', 'flac']
        };
        args.push(...(audioCodecs[target] || ['-c:a', 'copy']));
    } else {
        // Video Logic
        args.push('-preset', 'ultrafast', '-c:v', 'libx264', '-crf', '28', '-c:a', 'aac');
    }

    args.push(outName);
    await ffmpeg.run(...args);

    const data = ffmpeg.FS('readFile', outName);
    
    // Cleanup FS
    ffmpeg.FS('unlink', inName);
    ffmpeg.FS('unlink', outName);

    const mimeMap = { 
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg', 
        'aac': 'audio/aac', 'm4a': 'audio/mp4', 'flac': 'audio/flac',
        'mp4': 'video/mp4', 'webm': 'video/webm'
    };

    return new Blob([data.buffer], { type: mimeMap[target] || 'application/octet-stream' });
}

// --- 4. IMAGE & DATA FALLBACKS ---
async function processImage(file, target) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const type = target === 'jpg' ? 'image/jpeg' : `image/${target}`;
            canvas.toBlob(b => b ? resolve(b) : reject("Canvas error"), type, 0.9);
        };
        img.onerror = () => reject("Load failed");
        img.src = URL.createObjectURL(file);
    });
}

async function processData(file, target) {
    // Basic data passthrough or PDF generation
    if (target === 'pdf') {
        const { jsPDF } = window.jspdf;
        const text = await file.text();
        const doc = new jsPDF();
        doc.text(doc.splitTextToSize(text, 180), 10, 10);
        return doc.output('blob');
    }
    return file;
}

// --- 5. UI CONTROLLERS ---
function handleFiles(files) {
    Array.from(files).forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        let category = 'UNKNOWN';
        let targets = [];
        
        for (const [key, val] of Object.entries(ENGINES)) {
            if (val.ext.includes(ext)) { category = key; targets = val.targets; break; }
        }

        state.queue.push({
            id: Math.random().toString(36).substr(2, 9),
            file, name: file.name,
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            category, targets,
            outputFormat: targets[0] || '',
            status: 'idle', progress: 0, result: null
        });
    });
    render();
}

// --- 6. RENDER ENGINE ---
function render() {
    const list = document.getElementById('fileList');
    const container = document.getElementById('queueContainer');
    if (!list || !container) return;

    container.classList.toggle('visible-height', state.queue.length > 0);
    container.classList.toggle('hidden-zero-height', state.queue.length === 0);

    list.innerHTML = state.queue.map(item => `
        <div class="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col gap-4">
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-4 truncate">
                    <div class="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                        <i class="fas ${ENGINES[item.category]?.icon || 'fa-file'}"></i>
                    </div>
                    <div class="truncate">
                        <h4 class="font-bold text-sm text-slate-900 truncate">${item.name}</h4>
                        <span class="text-[10px] text-slate-400 uppercase font-black">${item.size}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <select onchange="window.updateFormat('${item.id}', this.value)" class="text-xs font-bold bg-slate-50 p-1 rounded-lg border">
                        ${item.targets.map(t => `<option value="${t}" ${item.outputFormat === t ? 'selected' : ''}>.${t.toUpperCase()}</option>`).join('')}
                    </select>
                    <div class="w-24">${renderAction(item)}</div>
                    <button onclick="window.remove('${item.id}')" class="text-slate-300 hover:text-red-500"><i class="fas fa-times-circle text-lg"></i></button>
                </div>
            </div>
            ${item.status === 'working' ? `
                <div class="flex items-center gap-3">
                    <div class="flex-grow bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div class="h-full bg-indigo-600 transition-all duration-300" style="width: ${item.progress}%"></div>
                    </div>
                    <span class="text-[10px] font-black text-indigo-600 w-8 text-right">${item.progress}%</span>
                </div>
            ` : ''}
            ${item.status === 'error' ? `<p class="text-[10px] text-red-500 font-bold uppercase">${item.errorMsg}</p>` : ''}
        </div>
    `).join('');
}

function renderAction(item) {
    if (item.status === 'idle') return `<button onclick="runConversion('${item.id}')" class="w-full bg-slate-900 text-white text-[10px] py-2 rounded-xl font-bold uppercase hover:bg-indigo-600">Convert</button>`;
    if (item.status === 'working') return `<div class="flex justify-center"><div class="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div></div>`;
    if (item.status === 'done') return `<button onclick="window.download('${item.id}')" class="w-full bg-green-500 text-white text-[10px] py-2 rounded-xl font-bold uppercase hover:bg-green-600">Save</button>`;
    return `<span class="text-red-500 text-[10px] font-bold">Error</span>`;
}

// --- 7. HELPER FUNCTIONS ---
window.updateFormat = (id, val) => { const i = state.queue.find(x => x.id === id); if(i) { i.outputFormat = val; i.status = 'idle'; render(); } };
window.remove = (id) => { state.queue = state.queue.filter(i => i.id !== id); render(); };
window.download = (id) => {
    const item = state.queue.find(i => i.id === id);
    if (!item?.result) return;
    const url = URL.createObjectURL(item.result);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.name.split('.')[0]}.${item.outputFormat}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 200);
};

function showSecurityWarning(show) {
    const warningEl = document.getElementById('securityWarning');
    warningEl?.classList.toggle('visible-height', show);
    warningEl?.classList.toggle('hidden-zero-height', !show);
}

// --- 8. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    
    document.getElementById('selectFilesBtn')?.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', (e) => handleFiles(e.target.files));
    
    dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('bg-indigo-50/20'); });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('bg-indigo-50/20'));
    dropZone?.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
});
