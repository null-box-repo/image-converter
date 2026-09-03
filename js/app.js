'use strict';
// .. Client-side logic for image converter

const $ = (id) => document.getElementById(id);

const dropzone = $('dropzone');
const fileInput = $('fileInput');
const previewWrap = $('previewWrap');
const preview = $('preview');
const fileName = $('fileName');
const fileSize = $('fileSize');
const formatsCard = $('formatsCard');
const formatList = $('formatList');
const formatSearch = $('formatSearch');
const qualityCard = $('qualityCard');
const quality = $('quality');
const qualityValue = $('qualityValue');
const saveCard = $('saveCard');
const saveDir = $('saveDir');
const convertBtn = $('convertBtn');
const btnLabel = convertBtn.querySelector('.btn-label');
const spinner = convertBtn.querySelector('.spinner');
const resultCard = $('resultCard');
const resultBox = $('resultBox');
const saveBtn = $('saveBtn');
const saveBtnLabel = $('saveBtnLabel');
const saveStatus = $('saveStatus');
const errorEl = $('error');
const themeToggle = $('themeToggle');

let formats = [];
let selectedFormat = null;
let currentFile = null;
let lastConvertedBlob = null;
let lastConvertedExt = '';
let isConverting = false;

const GROUP_LABELS = {
  image: 'Images',
  raw: 'Raw data',
  text: 'Text & data',
  video: 'Video',
  other: 'Other'
};

const TEXT_EXTS = ['txt', 'json', 'yaml', 'html', 'brf', 'clip', 'uil'];

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('theme', theme); } catch (e) {}
}
themeToggle.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(cur);
});

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}
function clearError() { errorEl.hidden = true; }

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function resetAll() {
  currentFile = null;
  selectedFormat = null;
  lastConvertedBlob = null;
  lastConvertedExt = '';
  previewWrap.hidden = true;
  formatsCard.hidden = true;
  qualityCard.hidden = true;
  saveCard.hidden = true;
  resultCard.hidden = true;
  convertBtn.hidden = false;
  convertBtn.disabled = true;
  fileInput.value = '';
  renderFormats(formatSearch.value);
}

fetch('/api/formats')
  .then((r) => r.json())
  .then((data) => {
    formats = (data.formats || []).map((f) => ({ name: f[0], ext: f[1], group: f[2] || 'other' }));
    renderFormats();
  })
  .catch(() => showError('Failed to load format list'));

function renderFormats(filter) {
  const q = (filter || '').trim().toLowerCase();
  const groups = {};
  for (const f of formats) {
    if (q && !f.name.toLowerCase().includes(q) && !(f.ext || '').includes(q)) continue;
    (groups[f.group] = groups[f.group] || []).push(f);
  }
  formatList.innerHTML = '';
  const keys = Object.keys(groups);
  if (!keys.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No matching formats';
    formatList.appendChild(empty);
    return;
  }
  keys.forEach((g, gi) => {
    const sec = document.createElement('div');
    sec.className = 'group';
    sec.style.animationDelay = (gi * 0.04) + 's';
    const h = document.createElement('h3');
    h.textContent = GROUP_LABELS[g] || g;
    sec.appendChild(h);
    const wrap = document.createElement('div');
    wrap.className = 'buttons';
    groups[g].forEach((f, fi) => {
      const b = document.createElement('button');
      b.className = 'fmt' + (selectedFormat === f.name ? ' active' : '');
      b.dataset.name = f.name;
      b.textContent = f.name.toLowerCase();
      b.title = f.name + ' -> .' + f.ext;
      b.style.animation = 'pop .3s ease both';
      b.style.animationDelay = (gi * 0.04 + fi * 0.008) + 's';
      b.onclick = () => selectFormat(f.name);
      wrap.appendChild(b);
    });
    sec.appendChild(wrap);
    formatList.appendChild(sec);
  });
}

function updateConvertBtn() {
  convertBtn.disabled = !(currentFile && selectedFormat);
}

function selectFormat(name) {
  if (selectedFormat === name) {
    selectedFormat = null;
  } else {
    selectedFormat = name;
  }
  document.querySelectorAll('.fmt').forEach((b) => {
    b.classList.toggle('active', b.dataset.name === selectedFormat);
  });
  updateConvertBtn();
}

formatSearch.addEventListener('input', () => renderFormats(formatSearch.value));

quality.addEventListener('input', () => {
  qualityValue.textContent = quality.value + '%';
});

function handleFile(file) {
  if (!file) return;
  currentFile = file;
  clearError();
  fileName.textContent = file.name;
  fileSize.textContent = fmtSize(file.size);
  previewWrap.hidden = false;
  formatsCard.hidden = false;
  qualityCard.hidden = false;
  saveCard.hidden = false;
  resultCard.hidden = true;
  saveBtn.hidden = true;
  saveStatus.hidden = true;
  lastConvertedBlob = null;
  selectedFormat = null;
  renderFormats(formatSearch.value);
  updateConvertBtn();
  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.onload = () => URL.revokeObjectURL(url);
}

previewWrap.addEventListener('click', () => {
  if (!previewWrap.hidden) resetAll();
});

$('browseBtn').addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('over');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

convertBtn.addEventListener('click', async () => {
  if (!currentFile || !selectedFormat) return;
  clearError();
  saveStatus.hidden = true;
  convertBtn.disabled = true;
  isConverting = true;
  btnLabel.textContent = 'Converting...';
  spinner.hidden = false;
  try {
    const res = await fetch('/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': currentFile.type || 'application/octet-stream',
        'X-Format': selectedFormat,
        'X-Quality': String(quality.value),
        'X-Filename': encodeURIComponent(currentFile.name)
      },
      body: currentFile
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || 'Conversion failed');
    }
    const blob = await res.blob();
    const ext = (formats.find((f) => f.name === selectedFormat) || {}).ext || '';
    lastConvertedBlob = blob;
    lastConvertedExt = ext;
    const url = URL.createObjectURL(blob);
    resultBox.innerHTML = '';
    if (blob.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = url;
      resultBox.appendChild(img);
    } else if (TEXT_EXTS.includes(ext)) {
      const pre = document.createElement('pre');
      pre.className = 'text-result';
      pre.textContent = await blob.text();
      resultBox.appendChild(pre);
    }
    saveBtn.hidden = false;
    saveBtnLabel.textContent = 'Save (' + fmtSize(blob.size) + ')';
    resultCard.hidden = false;
  } catch (e) {
    showError(e.message);
  } finally {
    isConverting = false;
    convertBtn.disabled = false;
    btnLabel.textContent = 'Convert';
    spinner.hidden = true;
  }
});

saveBtn.addEventListener('click', async () => {
  if (!lastConvertedBlob) return;
  saveBtn.disabled = true;
  saveStatus.hidden = true;
  try {
    const dir = saveDir.value;
    const baseName = currentFile ? currentFile.name.replace(/\.[^.]+$/, '') : 'converted';
    const outName = baseName + '.' + lastConvertedExt;
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: {
        'Content-Type': lastConvertedBlob.type || 'application/octet-stream',
        'X-Save-Dir': dir,
        'X-Filename': encodeURIComponent(outName)
      },
      body: lastConvertedBlob
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Save failed');
    saveStatus.textContent = 'Saved: ' + data.path;
    saveStatus.className = 'save-status ok';
    saveStatus.hidden = false;
  } catch (e) {
    saveStatus.textContent = 'Error: ' + e.message;
    saveStatus.className = 'save-status err';
    saveStatus.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
});

const refreshModal = $('refreshModal');
const modalCancel = $('modalCancel');
const modalRefresh = $('modalRefresh');
let pendingRefresh = false;

window.addEventListener('beforeunload', (e) => {
  if (!isConverting) return;
  e.preventDefault();
  e.returnValue = '';
  refreshModal.hidden = false;
  pendingRefresh = true;
});

modalCancel.addEventListener('click', () => {
  refreshModal.hidden = true;
  pendingRefresh = false;
});

modalRefresh.addEventListener('click', () => {
  refreshModal.hidden = true;
  pendingRefresh = false;
  window.location.reload();
});

refreshModal.addEventListener('click', (e) => {
  if (e.target === refreshModal) {
    refreshModal.hidden = true;
    pendingRefresh = false;
  }
});
