/**
 * MediaConvert Logic - Professional Multi-File Version
 * (c) 2026 Kinetic Logic Labs - v3.0 Robust Edition
 */

// --- 1. GLOBAL UI HELPERS ---
let currentVisibleCategory = null;

window.showFormatDetails = function(catKey) {
    const panel = document.getElementById('formatDetailPanel');
    if (currentVisibleCategory === catKey) {
        window.hideFormatDetails();
        return;
    }

    const config = ENGINES[catKey];
    if(!config || !panel) return;

    document.getElementById('detailTitle').innerText = config.title;
    const icon = document.getElementById('detailIcon');
    icon.className = `w-12 h-12 rounded-xl flex items-center justify-center ${config.color}`;
    icon.innerHTML = `<i class="fas ${config.icon} text-xl"></i>`;
    
    document.getElementById('inputFormats').innerHTML = config.ext.map(f => `<span class="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500 uppercase">.${f}</span>`).join('');
    document.getElementById('outputFormats').innerHTML = config.targets.map(f => `<span class="px-3 py-1 bg-indigo-50 rounded-lg text-[10px] font-bold text-indigo-600 uppercase">.${f}</span>`).join('');
    
    panel.classList.remove('hidden-zero-height');
    panel.classList.add('visible-height');
    currentVisibleCategory = catKey;
};

window.hideFormatDetails = function() {
    const panel = document.getElementById('formatDetailPanel');
    if (panel) {
        panel.classList.add('hidden-zero-height');
        panel.classList.remove('visible-height');
    }
    currentVisibleCategory = null;
};

// --- 2. CONFIGURATION ---
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

// --- 3. PROCESSING ENGINES ---
async function initFFmpeg() {
    if (ffmpegLoaded) return true;
    if (ffmpegLoading) return new Promise(r => {
        const i = setInterval(() => { if(ffmpegLoaded){ clearInterval(i); r(true); }}, 100);
    });

    ffmpegLoading = true;
    
    // Check for Cross-Origin Isolation (Required for FFmpeg WASM)
    if (typeof SharedArrayBuffer === 'undefined') {
        ffmpegLoading = false;
        return false; 
    }

    try {
        const { createFFmpeg } = FFmpeg;
        ffmpeg = createFFmpeg({ 
            log: false,
            corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
        });
        await ffmpeg.load();
        ffmpegLoaded = true;
        ffmpegLoading = false;
        return true;
    } catch (e) {
        console.error("FFmpeg Load Fail:", e);
        ffmpegLoading = false;
        return false;
    }
}

async function runConversion(id) {
    const item = state.queue.find(i => i.id === id);
    if (!item) return;

    item.status = 'working';
    item.progress = 1;
    render();

    try {
        let blob;
        const target = item.outputFormat;

        if (item.category === 'VIDEO' || item.category === 'AUDIO') {
            const ready = await initFFmpeg();
            
            if (!ready) {
                // FALLBACK: If FFmpeg is blocked, only WAV works
                if (item.category === 'AUDIO' && target === 'wav') {
                    blob = await processAudioNative(item.file);
                } else {
                    document.getElementById('securityWarning').classList.remove('hidden-zero-height');
                    document.getElementById('securityWarning').classList.add('visible-height');
                    throw new Error("Secure context required for this format.");
                }
            } else {
                // Standard FFmpeg Path
                blob = await transcodeMedia(item, target);
            }
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
        item.errorMsg = err.message;
    }
    render();
}

async function transcodeMedia(item, target) {
    const inName = `in_${item.id}`;
    const outName = `out_${item.id}.${target}`;
    
    ffmpeg.setProgress(({ ratio }) => {
        item.progress = Math.max(1, Math.floor(ratio * 100));
        render();
    });

    ffmpeg.FS('writeFile', inName, await FFmpeg.fetchFile(item.file));
    
    const args = ['-i', inName];
    if (item.category === 'AUDIO') {
        // Strip video/cover art and pick first audio stream
        args.push('-vn', '-map', '0:a:0');
        const encoders = { 'mp3': 'libmp3lame', 'ogg': 'libvorbis', 'wav': 'pcm_s16le', 'aac': 'aac', 'm4a': 'aac', 'flac': 'flac' };
        args.push('-c:a', encoders[target] || 'copy');
    } else {
        args.push('-preset', 'ultrafast', '-c:v', 'libx264', '-crf', '28', '-c:a', 'aac');
    }
    args.push(outName);

    await ffmpeg.run(...args);
    
    const data = ffmpeg.FS('readFile', outName);
    ffmpeg.FS('unlink', inName);
    ffmpeg.FS('unlink', outName);
    
    const mimes = { 'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg', 'mp4': 'video/mp4', 'webm': 'video/webm' };
    return new Blob([data.buffer], { type: mimes[target] || 'application/octet-stream' });
}

// WAV Fallback for non-secure contexts
async function processAudioNative(file) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const numOfChan = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    let pos = 0;

    const setUint32 = (d) => { view.setUint32(pos, d, true); pos += 4; };
    const setUint16 = (d) => { view.setUint16(pos, d, true); pos += 2; };

    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66);
    setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(audioBuffer.sampleRate);
    setUint32(audioBuffer.sampleRate * 2 * numOfChan); setUint16(numOfChan * 2);
    setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);

    for (let i = 0; i < audioBuffer.length; i++) {
        for (let channel = 0; channel < numOfChan; channel++) {
            let sample = audioBuffer.getChannelData(channel)[i];
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            pos += 2;
        }
    }
    return new Blob([buffer], { type: 'audio/wav' });
}

async function processImage(file, target) {
    const source = (file.name.match(/\.(heic|heif)$/i)) ? await heic2any({ blob: file, toType: "image/jpeg" }) : file;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.getElementById('conversionCanvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width; canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(b => resolve(b), `image/${target === 'jpg' ? 'jpeg' : target}`, 0.9);
        };
        img.src = URL.createObjectURL(Array.isArray(source) ? source[0] : source);
    });
}

async function processData(file, target) {
    if (target === 'pdf') {
        const { jsPDF } = window.jspdf;
        const text = await file.text();
        const doc = new jsPDF();
        doc.text(doc.splitTextToSize(text, 180), 10, 10);
        return doc.output('blob');
    }
    return file;
}

// --- 4. APP LOGIC ---
function handleFiles(files) {
    Array.from(files).forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        let category = 'UNKNOWN', targets = [];
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

window.remove = (id) => { state.queue = state.queue.filter(i => i.id !== id); render(); };
window.updateFormat = (id, val) => { 
    const item = state.queue.find(x => x.id === id); 
    if(item) { item.outputFormat = val; item.status = 'idle'; render(); } 
};

window.download = (id) => {
    const item = state.queue.find(i => i.id === id);
    if (!item?.result) return;
    const url = URL.createObjectURL(item.result);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.name.split('.')[0]}.${item.outputFormat}`;
    a.click();
    URL.revokeObjectURL(url);
};

function render() {
    const list = document.getElementById('fileList');
    const container = document.getElementById('queueContainer');
    const badge = document.getElementById('queueBadge');
    
    if (state.queue.length > 0) {
        container.classList.remove('hidden-zero-height');
        container.classList.add('visible-height');
    } else {
        container.classList.add('hidden-zero-height');
        container.classList.remove('visible-height');
    }

    if(badge) badge.innerText = state.queue.length;
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
            ${item.status === 'error' ? `<p class="text-[10px] text-red-500 font-bold uppercase tracking-tight">${item.errorMsg}</p>` : ''}
        </div>
    `).join('');
}

function renderAction(item) {
    if (item.status === 'idle') return `<button onclick="runConversion('${item.id}')" class="w-full bg-slate-900 text-white text-[10px] py-2 rounded-xl font-bold uppercase hover:bg-indigo-600">Convert</button>`;
    if (item.status === 'working') return `<div class="flex justify-center"><div class="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div></div>`;
    if (item.status === 'done') return `<button onclick="window.download('${item.id}')" class="w-full bg-green-500 text-white text-[10px] py-2 rounded-xl font-bold uppercase hover:bg-green-600">Save</button>`;
    return `<span class="text-red-500 text-[10px] font-bold">Error</span>`;
}

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const selectBtn = document.getElementById('selectFilesBtn');
    const dropZone = document.getElementById('dropZone');

    selectBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFiles(e.target.files);
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('bg-indigo-50/20'); };
    dropZone.ondrop = (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };
    document.getElementById('convertAllBtn').onclick = async () => {
        for(let item of state.queue) if(item.status === 'idle') await runConversion(item.id);
    };
    document.getElementById('clearBtn').onclick = () => { state.queue = []; render(); };
});
