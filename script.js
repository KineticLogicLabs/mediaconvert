/**
 * MediaConvert - Engine Room v2.1
 * (c) 2026 Kinetic Logic Labs
 */

import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js";

// --- CONFIGURATION ---
const ENGINES = {
    IMAGE: { title: "Images", ext: ['jpg', 'png', 'webp', 'heic'], targets: ['png', 'jpg', 'webp'], icon: 'fa-image', color: 'bg-blue-50 text-blue-500' },
    VIDEO: { title: "Videos", ext: ['mp4', 'mov', 'avi', 'webm', 'mkv'], targets: ['mp4', 'webm', 'gif'], icon: 'fa-video', color: 'bg-rose-50 text-rose-500' },
    AUDIO: { title: "Audio", ext: ['mp3', 'wav', 'm4a', 'flac'], targets: ['mp3', 'wav', 'aac'], icon: 'fa-music', color: 'bg-purple-50 text-purple-500' },
    DATA: { title: "Data", ext: ['txt', 'md', 'json'], targets: ['pdf', 'txt'], icon: 'fa-file-code', color: 'bg-emerald-50 text-emerald-500' }
};

const state = { queue: [] };

// --- UI FUNCTIONS ---
window.showFormatDetails = (catKey) => {
    const panel = document.getElementById('formatDetailPanel');
    const config = ENGINES[catKey];
    if(!config) return;

    document.getElementById('detailTitle').innerText = config.title;
    document.getElementById('inputFormats').innerHTML = config.ext.map(f => `<span class="px-2 py-1 bg-slate-100 rounded text-[9px] font-bold">.${f.toUpperCase()}</span>`).join('');
    document.getElementById('outputFormats').innerHTML = config.targets.map(f => `<span class="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[9px] font-bold">.${f.toUpperCase()}</span>`).join('');
    
    panel.classList.remove('hidden-zero-height');
    panel.classList.add('visible-height');
};

window.hideFormatDetails = () => {
    const panel = document.getElementById('formatDetailPanel');
    panel.classList.add('hidden-zero-height');
    panel.classList.remove('visible-height');
};

// --- CORE PROCESSING ---
window.runConversion = async (id) => {
    const item = state.queue.find(i => i.id === id);
    if (!item || item.status === 'working') return;

    item.status = 'working';
    render();

    try {
        let resultBlob;
        const target = item.outputFormat;

        if (item.category === 'VIDEO' || item.category === 'AUDIO') {
            // CONNECTING TO YOUR SPACE
            const app = await Client.connect("KineticLogicLabs/kinetic-convert-engine");
            const result = await app.predict("/predict", [item.file, target]);
            
            const response = await fetch(result.data[0].url);
            resultBlob = await response.blob();
        } else if (item.category === 'IMAGE') {
            resultBlob = await processImage(item.file, target);
        } else {
            resultBlob = item.file; // Fallback
        }

        item.result = resultBlob;
        item.status = 'done';
    } catch (err) {
        item.status = 'error';
        item.errorMsg = "Server waking up. Retry in 30s.";
        console.error(err);
    }
    render();
};

async function processImage(file, target) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.getElementById('conversionCanvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width; canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(b => resolve(b), `image/${target === 'jpg' ? 'jpeg' : target}`);
        };
        img.src = URL.createObjectURL(file);
    });
}

// --- QUEUE MANAGEMENT ---
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
            size: (file.size / 1024 / 1024).toFixed(2) + 'MB',
            category, targets,
            outputFormat: targets[0] || 'mp4',
            status: 'idle', result: null
        });
    });
    render();
}

window.remove = (id) => { state.queue = state.queue.filter(i => i.id !== id); render(); };
window.updateFormat = (id, val) => { const i = state.queue.find(x => x.id === id); if(i) i.outputFormat = val; };
window.download = (id) => {
    const item = state.queue.find(i => i.id === id);
    if (!item || !item.result) return;
    const url = URL.createObjectURL(item.result);
    const a = document.createElement('a');
    a.href = url;
    a.download = `converted_${item.name.split('.')[0]}.${item.outputFormat}`;
    a.click();
};

// --- RENDERER ---
function render() {
    const list = document.getElementById('fileList');
    const container = document.getElementById('queueContainer');
    const badge = document.getElementById('queueBadge');
    
    if (state.queue.length === 0) container.classList.add('hidden-zero-height');
    else container.classList.remove('hidden-zero-height');

    if(badge) badge.innerText = state.queue.length;
    list.innerHTML = '';

    state.queue.forEach(item => {
        const div = document.createElement('div');
        div.className = 'bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between gap-4';
        div.innerHTML = `
            <div class="flex items-center gap-3 truncate">
                <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 text-xs">
                    <i class="fas ${ENGINES[item.category]?.icon || 'fa-file'}"></i>
                </div>
                <div class="truncate">
                    <h4 class="font-bold text-xs text-slate-900 truncate">${item.name}</h4>
                    <span class="text-[9px] text-slate-400 font-bold uppercase">${item.size}</span>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <select onchange="window.updateFormat('${item.id}', this.value)" class="text-[10px] font-bold bg-slate-50 p-1 rounded-md border">
                    ${item.targets.map(t => `<option value="${t}" ${item.outputFormat === t ? 'selected' : ''}>.${t.toUpperCase()}</option>`).join('')}
                </select>
                <div class="w-20">${renderAction(item)}</div>
                <button onclick="window.remove('${item.id}')" class="text-slate-300 hover:text-red-500"><i class="fas fa-times-circle"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
}

function renderAction(item) {
    if (item.status === 'idle') return `<button onclick="window.runConversion('${item.id}')" class="w-full bg-slate-900 text-white text-[9px] py-1.5 rounded-lg font-bold uppercase">Convert</button>`;
    if (item.status === 'working') return `<div class="flex justify-center"><i class="fas fa-spinner fa-spin text-indigo-600"></i></div>`;
    if (item.status === 'done') return `<button onclick="window.download('${item.id}')" class="w-full bg-green-500 text-white text-[9px] py-1.5 rounded-lg font-bold uppercase">Save</button>`;
    return `<span class="text-red-500 text-[9px] font-bold">Error</span>`;
}

// --- SETUP ---
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    document.getElementById('selectFilesBtn').onclick = () => fileInput.click();
    document.getElementById('dropZone').onclick = (e) => { if(e.target.id === 'dropZone') fileInput.click(); };
    fileInput.onchange = (e) => { if(e.target.files.length) handleFiles(e.target.files); };
    document.getElementById('clearBtn').onclick = () => { state.queue = []; render(); };
    document.getElementById('convertAllBtn').onclick = async () => { for (let i of state.queue) await window.runConversion(i.id); };
});
