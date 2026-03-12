/**
 * MediaConvert Logic - Professional Multi-File Version
 * (c) 2026 Kinetic Logic Labs
 */

// --- 1. GLOBAL UI FUNCTIONS ---
window.showFormatDetails = function(catKey) {
    const config = ENGINES[catKey];
    if(!config) return;
    const panel = document.getElementById('formatDetailPanel');
    const title = document.getElementById('detailTitle');
    const icon = document.getElementById('detailIcon');
    const inputs = document.getElementById('inputFormats');
    const outputs = document.getElementById('outputFormats');
    if (!panel) return;

    title.innerText = config.title;
    icon.className = `w-12 h-12 rounded-xl flex items-center justify-center ${config.color}`;
    icon.innerHTML = `<i class="fas ${config.icon} text-xl"></i>`;
    inputs.innerHTML = config.ext.map(f => `<span class="format-pill">.${f}</span>`).join('');
    outputs.innerHTML = config.targets.map(f => `<span class="format-pill bg-indigo-50 border-indigo-100 text-indigo-600">.${f}</span>`).join('');
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'end' });
};

window.hideFormatDetails = function() {
    document.getElementById('formatDetailPanel')?.classList.add('hidden');
};

// --- 2. CONFIGURATION ---
const ENGINES = {
    IMAGE: { title: "Images", ext: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'ico', 'heic', 'heif', 'tiff', 'svg', 'avif'], targets: ['png', 'jpg', 'webp', 'bmp', 'ico'], icon: 'fa-image', color: 'bg-blue-50 text-blue-500' },
    VIDEO: { title: "Videos", ext: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', '3gp', 'ogv', 'mpeg', 'ts'], targets: ['mp4', 'webm', 'gif', 'avi', 'mov'], icon: 'fa-video', color: 'bg-rose-50 text-rose-500' },
    AUDIO: { title: "Audio", ext: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'aiff', 'opus', 'amr', 'm4r'], targets: ['mp3', 'wav', 'ogg', 'aac', 'flac'], icon: 'fa-music', color: 'bg-purple-50 text-purple-500' },
    DATA: { title: "Data & Docs", ext: ['xlsx', 'xls', 'csv', 'json', 'txt', 'md', 'xml', 'html', 'sql', 'log', 'yaml', 'ini', 'pdf'], targets: ['pdf', 'xlsx', 'csv', 'json', 'txt', 'md', 'html'], icon: 'fa-file-code', color: 'bg-emerald-50 text-emerald-500' }
};

// --- 3. STATE & ENGINES ---
let ffmpeg = null;
let ffmpegLoaded = false;
let ffmpegIncompatible = false;
const state = { queue: [] };

async function initFFmpeg() {
    if (typeof SharedArrayBuffer === 'undefined') {
        ffmpegIncompatible = true;
        document.getElementById('securityWarning')?.classList.remove('hidden');
        return;
    }
    if (typeof FFmpeg !== 'undefined') {
        try {
            ffmpeg = FFmpeg.createFFmpeg({ log: false });
            await ffmpeg.load();
            ffmpegLoaded = true;
            console.log("MediaConvert: FFmpeg Engine Ready.");
        } catch (e) { console.warn("FFmpeg failed to load.", e); }
    }
}

// --- 4. CORE APP LOGIC ---
function setupApp() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const selectFilesBtn = document.getElementById('selectFilesBtn');
    const convertAllBtn = document.getElementById('convertAllBtn');
    const clearBtn = document.getElementById('clearBtn');

    if (!dropZone || !fileInput) return;

    // Direct button listener (Highest reliability)
    if (selectFilesBtn) {
        selectFilesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
    }

    // Drop zone background listener
    dropZone.addEventListener('click', (e) => {
        if (e.target !== selectFilesBtn) fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files);
            fileInput.value = ''; 
        }
    });

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-indigo-500', 'bg-indigo-50/50');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
        if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    });

    if (clearBtn) clearBtn.onclick = (e) => { e.stopPropagation(); state.queue = []; render(); };
    if (convertAllBtn) convertAllBtn.onclick = async (e) => {
        e.stopPropagation();
        for (let item of state.queue) {
            if (item.status === 'idle') await runConversion(item.id);
        }
    };
}

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
            if (ffmpegIncompatible) throw new Error("Security Restriction: SharedArrayBuffer required.");
            if (!ffmpegLoaded) throw new Error("Media engine not ready.");
            blob = await transcodeMedia(item, target, (p) => {
                item.progress = Math.max(5, Math.floor(p * 100));
                render();
            });
        } else if (item.category === 'IMAGE') { blob = await processImage(item.file, target); }
        else if (item.category === 'DATA') { blob = await processData(item.file, target); }
        item.result = blob; item.status = 'done'; item.progress = 100;
    } catch (err) {
        item.status = 'error'; item.errorMsg = err.message;
    }
    render();
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
            canvas.toBlob(b => b ? resolve(b) : reject("Fail"), mime, 0.9);
            URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(source);
    });
}

async function transcodeMedia(item, target, onProgress) {
    const inName = `in_${item.id}_${item.name}`;
    const outName = `out_${item.id}.${target}`;
    ffmpeg.setProgress(({ ratio }) => onProgress(ratio));
    ffmpeg.FS('writeFile', inName, await FFmpeg.fetchFile(item.file));
    await ffmpeg.run('-i', inName, outName);
    const data = ffmpeg.FS('readFile', outName);
    ffmpeg.FS('unlink', inName); ffmpeg.FS('unlink', outName);
    const mimes = { 'mp4': 'video/mp4', 'webm': 'video/webm', 'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'gif': 'image/gif' };
    return new Blob([data.buffer], { type: mimes[target] || 'application/octet-stream' });
}

async function processData(file, target) {
    const { jsPDF } = window.jspdf;
    if (['pdf', 'md', 'txt', 'html'].includes(target)) {
        const text = await file.text();
        if (target === 'pdf') {
            const doc = new jsPDF();
            const lines = doc.splitTextToSize(text, 180);
            doc.text(lines, 10, 10);
            return doc.output('blob');
        }
        return new Blob([text], { type: 'text/plain' });
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                const first = wb.Sheets[wb.SheetNames[0]];
                if (target === 'xlsx') resolve(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
                else if (target === 'csv') resolve(new Blob([XLSX.utils.sheet_to_csv(first)], { type: 'text/csv' }));
                else if (target === 'json') resolve(new Blob([JSON.stringify(XLSX.utils.sheet_to_json(first), null, 2)], { type: 'application/json' }));
                else resolve(file);
            } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
    });
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
        div.className = 'bg-white border border-slate-200 p-5 rounded-[1.5rem] shadow-sm flex flex-col gap-4 group transition-all hover:shadow-xl';
        const options = item.targets.map(t => `<option value="${t}" ${item.outputFormat === t ? 'selected' : ''}>.${t.toUpperCase()}</option>`).join('');
        div.innerHTML = `
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div class="flex items-center gap-4 flex-1 truncate">
                    <div class="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-indigo-600">
                        <i class="fas ${ENGINES[item.category]?.icon || 'fa-file'} text-xl"></i>
                    </div>
                    <div class="truncate">
                        <h4 class="font-black text-sm text-slate-900 truncate">${item.name}</h4>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="category-tag cat-${item.category.toLowerCase()}">${item.category}</span>
                            <span class="text-[10px] font-black text-slate-300 uppercase">${item.size}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-200">
                        <select onchange="updateFormat('${item.id}', this.value)" class="bg-transparent text-xs font-black focus:outline-none">
                            ${options || '<option>N/A</option>'}
                        </select>
                    </div>
                    <div class="w-28">${renderAction(item)}</div>
                    <button onclick="remove('${item.id}')" class="text-slate-200 hover:text-red-500"><i class="fas fa-times-circle text-lg"></i></button>
                </div>
            </div>
            ${item.status === 'working' ? `<div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div class="h-full bg-indigo-600" style="width: ${item.progress}%"></div></div>` : ''}
        `;
        list.appendChild(div);
    });
}

function renderAction(item) {
    if (item.status === 'idle') return `<button onclick="runConversion('${item.id}')" class="w-full bg-slate-900 text-white text-[10px] py-2.5 rounded-xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all">Convert</button>`;
    if (item.status === 'working') return `<div class="loader mx-auto"></div>`;
    if (item.status === 'done') return `<button onclick="download('${item.id}')" class="w-full bg-green-500 text-white text-[10px] py-2.5 rounded-xl font-black uppercase tracking-widest hover:bg-green-600 flex items-center justify-center gap-2"><i class="fas fa-download"></i> Save</button>`;
    return `<span class="text-red-500 text-[10px] font-black uppercase">Failed</span>`;
}

function bootstrap() { setupApp(); initFFmpeg(); }
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', bootstrap); } else { bootstrap(); }
