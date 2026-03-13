/**
 * MediaConvert Logic - Professional Cloud Version
 * (c) 2026 Kinetic Logic Labs
 */

import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js";

// --- 1. CONFIGURATION ---
const ENGINES = {
    IMAGE: { title: "Images", ext: ['jpg', 'jpeg', 'png', 'webp', 'heic'], targets: ['png', 'jpg', 'webp'], icon: 'fa-image', color: 'bg-blue-50 text-blue-500' },
    VIDEO: { title: "Videos", ext: ['mp4', 'mov', 'avi', 'webm', 'mkv'], targets: ['mp4', 'webm', 'gif'], icon: 'fa-video', color: 'bg-rose-50 text-rose-500' },
    AUDIO: { title: "Audio", ext: ['mp3', 'wav', 'm4a', 'flac'], targets: ['mp3', 'wav', 'aac'], icon: 'fa-music', color: 'bg-purple-50 text-purple-500' },
    DATA: { title: "Data", ext: ['txt', 'md', 'json', 'pdf'], targets: ['pdf', 'txt'], icon: 'fa-file-code', color: 'bg-emerald-50 text-emerald-500' }
};

const state = { queue: [] };

// --- 2. THE BRIDGE (Mapping functions to HTML buttons) ---
window.showFormatDetails = (catKey) => {
    const panel = document.getElementById('formatDetailPanel');
    const config = ENGINES[catKey];
    if(!config) return;
    document.getElementById('detailTitle').innerText = config.title;
    document.getElementById('inputFormats').innerHTML = config.ext.map(f => `<span class="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-bold uppercase">.${f}</span>`).join('');
    document.getElementById('outputFormats').innerHTML = config.targets.map(f => `<span class="px-3 py-1 bg-indigo-50 rounded-lg text-[10px] font-bold text-indigo-600 uppercase">.${f}</span>`).join('');
    panel.classList.remove('hidden-zero-height');
    panel.classList.add('visible-height');
};

window.hideFormatDetails = () => {
    document.getElementById('formatDetailPanel').classList.add('hidden-zero-height');
};

window.updateFormat = (id, val) => {
    const item = state.queue.find(x => x.id === id);
    if(item) { item.outputFormat = val; render(); }
};

window.remove = (id) => {
    state.queue = state.queue.filter(i => i.id !== id);
    render();
};

// --- 3. THE CONVERSION ENGINE ---
window.runConversion = async function(id) {
    const item = state.queue.find(i => i.id === id);
    if (!item || item.status === 'working') return;

    item.status = 'working';
    item.progress = 20; // Show initial movement
    render();

    try {
        let resultBlob;

        if (item.category === 'VIDEO' || item.category === 'AUDIO') {
            // CONNECTING TO YOUR HUGGING FACE SPACE
            const app = await Client.connect("KineticLogicLabs/kinetic-convert-engine");
            
            // Send [File, TargetFormat] to your app.py
            const result = await app.predict("/predict", [
                item.file, 
                item.outputFormat
            ]);

            // Fetch the converted file back from the server
            const response = await fetch(result.data[0].url);
            resultBlob = await response.blob();
        } else if (item.category === 'IMAGE') {
            resultBlob = await processImage(item.file, item.outputFormat);
        } else {
            resultBlob = item.file; // Basic fallback for data
        }

        item.result = resultBlob;
        item.status = 'done';
        item.progress = 100;
    } catch (err) {
        item.status = 'error';
        item.errorMsg = "Engine waking up. Please wait 30s and try again.";
        console.error("HF Error:", err);
        // Show the warning panel if it's a connection issue
        document.getElementById('securityWarning').classList.remove('hidden-zero-height');
    }
    render();
};

window.download = (id) => {
    const item = state.queue.find(i => i.id === id);
    if (!item || !item.result) return;
    const url = URL.createObjectURL(item.result);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KineticLogic_${item.name.split('.')[0]}.${item.outputFormat}`;
    a.click();
    URL.revokeObjectURL(url);
};

// --- 4. INTERNAL PROCESSING (Images) ---
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

// --- 5. SYSTEM SETUP ---
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
            outputFormat: targets[0] || 'mp4',
            status: 'idle', progress: 0, result: null
        });
    });
    render();
}

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
        div.className = 'bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col gap-4';
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
                </div>
            ` : ''}
            ${item.status === 'error' ? `<p class="text-[10px] text-red-500 font-bold uppercase">${item.errorMsg}</p>` : ''}
        `;
        list.appendChild(div);
    });
}

function renderAction(item) {
    if (item.status === 'idle') return `<button onclick="window.runConversion('${item.id}')" class="w-full bg-slate-900 text-white text-[10px] py-2 rounded-xl font-bold uppercase">Convert</button>`;
    if (item.status === 'working') return `<div class="flex justify-center"><i class="fas fa-spinner fa-spin text-indigo-600"></i></div>`;
    if (item.status === 'done') return `<button onclick="window.download('${item.id}')" class="w-full bg-green-500 text-white text-[10px] py-2 rounded-xl font-bold uppercase">Save</button>`;
    return `<span class="text-red-500 text-[10px] font-bold">Error</span>`;
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    document.getElementById('selectFilesBtn').onclick = () => fileInput.click();
    document.getElementById('dropZone').onclick = (e) => { if(e.target.id === 'dropZone') fileInput.click(); };
    fileInput.onchange = (e) => { if(e.target.files.length) handleFiles(e.target.files); };
    document.getElementById('clearBtn').onclick = () => { state.queue = []; render(); };
    document.getElementById('convertAllBtn').onclick = async () => { 
        for (let item of state.queue) { if (item.status === 'idle') await window.runConversion(item.id); } 
    };
});
