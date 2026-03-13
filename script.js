/**
 * MediaConvert Logic - Professional Multi-File Version
 * (c) 2026 Kinetic Logic Labs
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

    const title = document.getElementById('detailTitle');
    const icon = document.getElementById('detailIcon');
    const inputs = document.getElementById('inputFormats');
    const outputs = document.getElementById('outputFormats');

    title.innerText = config.title;
    icon.className = `w-12 h-12 rounded-xl flex items-center justify-center ${config.color}`;
    icon.innerHTML = `<i class="fas ${config.icon} text-xl"></i>`;
    inputs.innerHTML = config.ext.map(f => `<span class="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500 uppercase">.${f}</span>`).join('');
    outputs.innerHTML = config.targets.map(f => `<span class="px-3 py-1 bg-indigo-50 rounded-lg text-[10px] font-bold text-indigo-600 uppercase">.${f}</span>`).join('');
    
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

// --- 2. CONFIGURATION (Expanded Formats) ---
const ENGINES = {
    IMAGE: { 
        title: "Images", 
        ext: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'ico', 'heic', 'heif', 'tiff', 'svg', 'avif', 'tga'], 
        targets: ['png', 'jpg', 'webp', 'bmp', 'ico', 'tiff'], 
        icon: 'fa-image', color: 'bg-blue-50 text-blue-500' 
    },
    VIDEO: { 
        title: "Videos", 
        ext: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', '3gp', 'ogv', 'mpeg', 'ts', 'm4v'], 
        targets: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'gif'], 
        icon: 'fa-video', color: 'bg-rose-50 text-rose-500' 
    },
    AUDIO: { 
        title: "Audio", 
        ext: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'aiff', 'opus', 'amr', 'm4r'], 
        targets: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'], 
        icon: 'fa-music', color: 'bg-purple-50 text-purple-500' 
    },
    DATA: { 
        title: "Data & Docs", 
        ext: ['xlsx', 'csv', 'json', 'txt', 'md', 'pdf', 'html', 'xml', 'yaml', 'ini'], 
        targets: ['pdf', 'xlsx', 'csv', 'json', 'txt', 'md', 'html'], 
        icon: 'fa-file-code', color: 'bg-emerald-50 text-emerald-500' 
    }
};

const state = { queue: [] };

// --- 3. THE "GUARANTEED" HUGGING FACE ENGINE ---

// Import the Gradio Client (Ensure this is in your index.html or at the top of script.js)
import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js";

async function runConversion(id) {
    const item = state.queue.find(i => i.id === id);
    if (!item) return;

    item.status = 'working';
    item.progress = 10; // Initial connection jump
    render();

    try {
        let resultBlob;
        const target = item.outputFormat;

        if (item.category === 'VIDEO' || item.category === 'AUDIO') {
            // CALL HUGGING FACE ENGINE
            resultBlob = await transcodeOnHuggingFace(item, target, (p) => {
                item.progress = Math.max(10, Math.floor(p * 100));
                render();
            });
        } else if (item.category === 'IMAGE') {
            resultBlob = await processImage(item.file, target);
        } else if (item.category === 'DATA') {
            resultBlob = await processData(item.file, target);
        }

        item.result = resultBlob;
        item.status = 'done';
        item.progress = 100;
    } catch (err) {
        item.status = 'error';
        item.errorMsg = "Engine Error: Ensure the HF Space is awake.";
        console.error(err);
    }
    render();
}

async function transcodeOnHuggingFace(item, target, onProgress) {
    // 1. Connect to your Space
    // Replace 'YOUR_USERNAME' with your actual Hugging Face username
    const app = await Client.connect("YOUR_USERNAME/kinetic-convert-engine");

    // 2. Call the conversion function
    // Pass [file, target_format] as defined in your app.py
    const result = await app.predict("/predict", [
        item.file, 
        target
    ]);

    // 3. Fetch the resulting file from the HF server
    const fileUrl = result.data[0].url;
    const response = await fetch(fileUrl);
    return await response.blob();
}

// --- KEEPING YOUR NATIVE LOGIC FOR IMAGES/DATA ---

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
            canvas.toBlob(b => b ? resolve(b) : reject("Processing Error"), mime, 0.9);
            URL.revokeObjectURL(img.src);
        };
        img.onerror = () => reject("Image Failed to Load");
        img.src = URL.createObjectURL(source);
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

// --- 4. APP SETUP & RENDERING ---
function setupApp() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const selectFilesBtn = document.getElementById('selectFilesBtn');
    const convertAllBtn = document.getElementById('convertAllBtn');
    const clearBtn = document.getElementById('clearBtn');

    selectFilesBtn?.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    dropZone?.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') fileInput.click(); });
    fileInput?.addEventListener('change', (e) => { if (e.target.files.length > 0) { handleFiles(e.target.files); fileInput.value = ''; } });
    dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('bg-indigo-50/20'); });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('bg-indigo-50/20'));
    dropZone?.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('bg-indigo-50/20'); handleFiles(e.dataTransfer.files); });

    if (clearBtn) clearBtn.onclick = () => { state.queue = []; render(); };
    if (convertAllBtn) convertAllBtn.onclick = async () => { for (let item of state.queue) { if (item.status === 'idle') await runConversion(item.id); } };
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

window.remove = (id) => { 
    state.queue = state.queue.filter(i => i.id !== id); 
    render(); 
};

window.updateFormat = (id, val) => { 
    const i = state.queue.find(x => x.id === id); 
    if(i) {
        i.outputFormat = val;
        i.status = 'idle'; i.result = null; i.progress = 0;
        render();
    }
};

window.download = (id) => {
    const item = state.queue.find(i => i.id === id);
    if (!item || !item.result) return;
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
    
    if (state.queue.length === 0) {
        container.classList.add('hidden-zero-height');
        container.classList.remove('visible-height');
    } else {
        container.classList.remove('hidden-zero-height');
        container.classList.add('visible-height');
    }

    if(badge) badge.innerText = state.queue.length;
    list.innerHTML = '';

    state.queue.forEach(item => {
        const div = document.createElement('div');
        div.className = 'bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300';
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
                    <select onchange="window.updateFormat('${item.id}', this.value)" class="text-xs font-bold bg-slate-50 p-1 rounded-lg border focus:outline-none">
                        ${item.targets.map(t => `<option value="${t}" ${item.outputFormat === t ? 'selected' : ''}>.${t.toUpperCase()}</option>`).join('')}
                    </select>
                    <div class="w-24">${renderAction(item)}</div>
                    <button onclick="window.remove('${item.id}')" class="text-slate-300 hover:text-red-500 transition-colors">
                        <i class="fas fa-times-circle text-lg"></i>
                    </button>
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
        `;
        list.appendChild(div);
    });
}

function renderAction(item) {
    if (item.status === 'idle') return `<button onclick="runConversion('${item.id}')" class="w-full bg-slate-900 text-white text-[10px] py-2 rounded-xl font-bold uppercase hover:bg-indigo-600 transition-all">Convert</button>`;
    if (item.status === 'working') return `<div class="flex justify-center"><div class="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div></div>`;
    if (item.status === 'done') return `<button onclick="window.download('${item.id}')" class="w-full bg-green-500 text-white text-[10px] py-2 rounded-xl font-bold uppercase hover:bg-green-600 transition-all">Save</button>`;
    return `<span class="text-red-500 text-[10px] font-bold">Error</span>`;
}

document.addEventListener('DOMContentLoaded', setupApp);
