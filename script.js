/**
 * MediaConvert Logic - Professional Multi-File Version
 * (c) 2026 Kinetic Logic Labs
 */

const ENGINES = {
    IMAGE: { title: "Images", ext: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'ico', 'heic', 'heif', 'tiff', 'svg', 'avif'], targets: ['png', 'jpg', 'webp', 'bmp', 'ico'], icon: 'fa-image', color: 'bg-blue-50 text-blue-500' },
    VIDEO: { title: "Videos", ext: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', '3gp', 'ogv', 'mpeg', 'ts'], targets: ['mp4', 'webm', 'gif'], icon: 'fa-video', color: 'bg-rose-50 text-rose-500' },
    AUDIO: { title: "Audio", ext: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'], targets: ['mp3', 'wav', 'ogg'], icon: 'fa-music', color: 'bg-purple-50 text-purple-500' },
    DATA: { title: "Data & Docs", ext: ['xlsx', 'csv', 'json', 'txt', 'md', 'pdf'], targets: ['pdf', 'xlsx', 'csv', 'json', 'txt'], icon: 'fa-file-code', color: 'bg-emerald-50 text-emerald-500' }
};

let ffmpeg = null;
let ffmpegLoaded = false;
const state = { queue: [] };

async function initFFmpeg() {
    if (ffmpegLoaded) return true;
    
    // Check for isolation
    if (typeof SharedArrayBuffer === 'undefined') {
        document.getElementById('securityWarning')?.classList.remove('hidden');
        return false;
    }

    try {
        if (!ffmpeg) {
            ffmpeg = FFmpeg.createFFmpeg({ log: true });
        }
        await ffmpeg.load();
        ffmpegLoaded = true;
        document.getElementById('securityWarning')?.classList.add('hidden');
        return true;
    } catch (e) {
        console.error("FFmpeg Load Error:", e);
        document.getElementById('securityWarning')?.classList.remove('hidden');
        return false;
    }
}

function setupApp() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const selectFilesBtn = document.getElementById('selectFilesBtn');
    const convertAllBtn = document.getElementById('convertAllBtn');
    const clearBtn = document.getElementById('clearBtn');

    if (selectFilesBtn) {
        selectFilesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }

    dropZone?.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') fileInput.click();
    });

    fileInput?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files);
            fileInput.value = ''; 
        }
    });

    dropZone?.addEventListener('dragover', (e) => e.preventDefault());
    dropZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    });

    if (clearBtn) clearBtn.onclick = () => { state.queue = []; render(); };
    if (convertAllBtn) convertAllBtn.onclick = async () => {
        for (let item of state.queue) {
            if (item.status === 'idle') await runConversion(item.id);
        }
    };
}

function handleFiles(files) {
    let hasVideoAudio = false;
    Array.from(files).forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        let category = 'UNKNOWN';
        let targets = [];
        for (const [key, val] of Object.entries(ENGINES)) {
            if (val.ext.includes(ext)) { 
                category = key; 
                targets = val.targets; 
                if (key === 'VIDEO' || key === 'AUDIO') hasVideoAudio = true;
                break; 
            }
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

    // Only check for FFmpeg if we actually have video/audio in queue
    if (hasVideoAudio && typeof SharedArrayBuffer === 'undefined') {
        document.getElementById('securityWarning')?.classList.remove('hidden');
    }

    render();
}

async function runConversion(id) {
    const item = state.queue.find(i => i.id === id);
    if (!item) return;

    item.status = 'working';
    item.progress = 5;
    render();

    try {
        let blob;
        const target = item.outputFormat;

        if (item.category === 'VIDEO' || item.category === 'AUDIO') {
            const ready = await initFFmpeg();
            if (!ready) throw new Error("Media Engine Blocked. Refresh required.");
            
            blob = await transcodeMedia(item, target, (p) => {
                item.progress = Math.max(5, Math.floor(p * 100));
                render();
            });
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

async function transcodeMedia(item, target, onProgress) {
    const inName = `in_${item.id}_${item.name}`;
    const outName = `out_${item.id}.${target}`;
    ffmpeg.setProgress(({ ratio }) => onProgress(ratio));
    ffmpeg.FS('writeFile', inName, await FFmpeg.fetchFile(item.file));
    await ffmpeg.run('-i', inName, outName);
    const data = ffmpeg.FS('readFile', outName);
    ffmpeg.FS('unlink', inName);
    ffmpeg.FS('unlink', outName);
    const mimes = { 'mp4': 'video/mp4', 'webm': 'video/webm', 'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'gif': 'image/gif' };
    return new Blob([data.buffer], { type: mimes[target] || 'application/octet-stream' });
}

async function processImage(file, target) {
    const ext = file.name.split('.').pop().toLowerCase();
    let source = file;
    if (ext === 'heic' || ext === 'heif') {
        const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 });
        source = Array.isArray(converted) ? converted[0] : converted;
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.getElementById('conversionCanvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width; canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const mime = `image/${target === 'jpg' ? 'jpeg' : target}`;
            canvas.toBlob(b => b ? resolve(b) : reject("Buffer Error"), mime, 0.9);
            URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(source);
    });
}

async function processData(file, target) {
    const { jsPDF } = window.jspdf;
    if (['pdf', 'txt'].includes(target)) {
        const text = await file.text();
        if (target === 'pdf') {
            const doc = new jsPDF();
            const lines = doc.splitTextToSize(text, 180);
            doc.text(lines, 10, 10);
            return doc.output('blob');
        }
        return new Blob([text], { type: 'text/plain' });
    }
    return file; // Fallback
}

window.remove = (id) => { state.queue = state.queue.filter(i => i.id !== id); render(); };
window.updateFormat = (id, val) => { const i = state.queue.find(x => x.id === id); if(i) i.outputFormat = val; };
window.download = (id) => {
    const item = state.queue.find(i => i.id === id);
    const url = URL.createObjectURL(item.result);
    const a = document.createElement('a');
    a.href = url;
    const base = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    a.download = `${base}.${item.outputFormat}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 200);
};

function render() {
    const list = document.getElementById('fileList');
    const container = document.getElementById('queueContainer');
    const badge = document.getElementById('queueBadge');
    if (!list || !container) return;
    container.classList.toggle('hidden', state.queue.length === 0);
    if(badge) badge.innerText = state.queue.length;
    list.innerHTML = '';
    state.queue.forEach(item => {
        const div = document.createElement('div');
        div.className = 'bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col gap-4';
        const options = item.targets.map(t => `<option value="${t}" ${item.outputFormat === t ? 'selected' : ''}>.${t.toUpperCase()}</option>`).join('');
        div.innerHTML = `
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
                    <select onchange="updateFormat('${item.id}', this.value)" class="text-xs font-bold bg-slate-50 p-1 rounded-lg border">
                        ${options}
                    </select>
                    <div class="w-24">${renderAction(item)}</div>
                    <button onclick="remove('${item.id}')" class="text-slate-300 hover:text-red-500"><i class="fas fa-times"></i></button>
                </div>
            </div>
            ${item.status === 'working' ? `<div class="w-full bg-slate-100 h-1 rounded-full overflow-hidden"><div class="h-full bg-indigo-600" style="width: ${item.progress}%"></div></div>` : ''}
            ${item.status === 'error' ? `<p class="text-[10px] text-red-500 font-bold uppercase">${item.errorMsg}</p>` : ''}
        `;
        list.appendChild(div);
    });
}

function renderAction(item) {
    if (item.status === 'idle') return `<button onclick="runConversion('${item.id}')" class="w-full bg-slate-900 text-white text-[10px] py-2 rounded-xl font-bold uppercase">Convert</button>`;
    if (item.status === 'working') return `<div class="loader mx-auto"></div>`;
    if (item.status === 'done') return `<button onclick="download('${item.id}')" class="w-full bg-green-500 text-white text-[10px] py-2 rounded-xl font-bold uppercase">Save</button>`;
    return `<span class="text-red-500 text-[10px] font-bold">Error</span>`;
}

bootstrap();
function bootstrap() { setupApp(); }
