/* ==========================================================================
   OptiByte Central Orchestrator & Controller (app.js)
   ========================================================================== */

import { countTokens, registerOnLoad } from './tokenizer.js';
import { compressText, calculateSemanticFidelity } from './compressor.js';

const BACKEND_URL = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
let isBackendActive = false;
let hasMarkItDown = false;

// DOM Elements Selection
const fileUploaderCard = document.getElementById('file-uploader-card');
const uploaderEmptyState = document.getElementById('uploader-empty-state');
const uploaderActiveState = document.getElementById('uploader-active-state');
const originalCard = document.getElementById('original-card');
const fileInput = document.getElementById('file-input');
const changeFileBtn = document.getElementById('change-file-btn');

// Workspace Empty State elements
const workspaceEmptyState = document.getElementById('workspace-empty-state');
const editorWorkspace = document.getElementById('editor-workspace');
const emptyUploadBtn = document.getElementById('empty-upload-btn');
const emptyPasteBtn = document.getElementById('empty-paste-btn');
const globalDragOverlay = document.getElementById('global-drag-overlay');

const currentFilename = document.getElementById('current-filename');
const currentFilesize = document.getElementById('current-filesize');

const squeezeSlider = document.getElementById('squeeze-level');
const labelLvl1 = document.getElementById('label-lvl1');
const labelLvl2 = document.getElementById('label-lvl2');
const labelLvl3 = document.getElementById('label-lvl3');
const labelLvl4 = document.getElementById('label-lvl4');

// Tuning Rule Toggles
const ruleToggles = {
    whitespace: document.getElementById('toggle-whitespace'),
    tables: document.getElementById('toggle-tables'),
    codeMode: document.getElementById('toggle-code-mode'),
    contractions: document.getElementById('toggle-contractions'),
    math: document.getElementById('toggle-math'),
    scoping: document.getElementById('toggle-scoping'),
    lz77: document.getElementById('toggle-lz77'),
    synonyms: document.getElementById('toggle-synonyms'),
    telegraphic: document.getElementById('toggle-telegraphic'),
    disemvowel: document.getElementById('toggle-disemvowel'),
    decoder: document.getElementById('toggle-decoder')
};
const resetRulesBtn = document.getElementById('reset-rules-btn');

// Editors
const originalTextarea = document.getElementById('original-textarea');
const squeezedTextarea = document.getElementById('squeezed-textarea');

// Gauges & Analytics Metrics
const gaugeFill = document.getElementById('gauge-fill');
const savingsPercentText = document.getElementById('savings-percent');
const statOriginalTokens = document.getElementById('stat-original-tokens');
const statSqueezedTokens = document.getElementById('stat-squeezed-tokens');

const calcChatExpansion = document.getElementById('calc-chat-expansion');
const calcCostReduction = document.getElementById('calc-cost-reduction');

const origCharCount = document.getElementById('orig-char-count');
const origWordCount = document.getElementById('orig-word-count');
const squeezedCharCount = document.getElementById('squeezed-char-count');
const squeezedWordCount = document.getElementById('squeezed-word-count');

// KPI Strip elements
const kpiSavings   = document.getElementById('kpi-savings');
const kpiExpansion = document.getElementById('kpi-expansion');
const kpiCost      = document.getElementById('kpi-cost');
const kpiChars     = document.getElementById('kpi-chars');

// Exports
const copyBtn = document.getElementById('copy-btn');
const copyBtnText = document.getElementById('copy-btn-text');
const copyPromptBtn = document.getElementById('copy-prompt-btn');
const copyPromptBtnText = document.getElementById('copy-prompt-btn-text');
const downloadBtn = document.getElementById('download-btn');

// Loader Overlay
const loadingOverlay = document.getElementById('loading-overlay');
const loaderTitle = document.getElementById('loader-title');
const loaderSubtitle = document.getElementById('loader-subtitle');
const loaderProgress = document.getElementById('loader-progress');

// Toast container
const toastContainer = document.getElementById('toast-container');

// Feedback Elements
const feedbackToggleBtn = document.getElementById('feedback-toggle-btn');
const feedbackModal = document.getElementById('feedback-modal');
const closeFeedbackBtn = document.getElementById('close-feedback-btn');
const modalOverlay = document.getElementById('modal-overlay');
const feedbackForm = document.getElementById('feedback-form');
const ratingBtns = document.querySelectorAll('.rating-btn');
let selectedRating = 0;

// Application Global State
let rawContent = "";
let uploadedFileName = "pasted_text.txt";
let uploadedFileSize = "0 KB";
let debounceTimeout = null;

// ==========================================================================
// Initialization & Listeners Setup
// ==========================================================================
function initializeApp() {
    setupUploadHandlers();
    setupSliderHandlers();
    setupEditorHandlers();
    setupExportHandlers();
    setupParallaxEffect();
    startTypewriterEffect();
    setupKeyboardShortcuts();
    setupThemeHandler();
    setupHistoryHandler();
    setupWindowPasteHandler();
    setupFeedbackHandler();
    setupClientErrorLogger();
    
    // Sync slider rules and checkboxes on initial load
    syncSliderUI(parseInt(squeezeSlider.value));
    
    // Register tokenizer loaded callback to recalculate tokens exactly
    registerOnLoad(() => {
        if (rawContent) {
            updateWorkspace(rawContent);
        }
    });

    // Check backend health status on startup
    checkBackendHealth();
    initGoogleAnalytics();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Check if local Node/Express backend running Microsoft MarkItDown is online
async function checkBackendHealth() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/health`);
        if (res.ok) {
            const data = await res.json();
            isBackendActive = true;
            if (data.hasMarkItDown) {
                hasMarkItDown = true;
                showToast('success', '✦', 'Full Power Mode', 'All file formats are supported & ready!');
                
                // Update empty state uploader label formats
                const formatText = document.getElementById('workspace-empty-state').querySelector('.empty-state-formats');
                if (formatText) {
                    formatText.textContent = "Supports PDF, XLSX, PPTX, HTML, DOCX, TXT, MD, CSV, JSON";
                }
                const dragFormats = document.querySelector('.drag-overlay-formats');
                if (dragFormats) {
                    dragFormats.textContent = "PDF, XLSX, PPTX, HTML, DOCX, TXT, MD, CSV, JSON";
                }
            } else {
                showToast('warning', '⚠', 'Limited Mode', 'Advanced file parsing (PDF, Excel, PowerPoint) is unavailable.');
            }
        }
    } catch (err) {
        console.log('OptiByte: Local backend server offline. Operating in pure offline client-side mode (DOCX, TXT, MD).');
    }
}

// Initialize Google Analytics dynamically from server configuration
async function initGoogleAnalytics() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/config`);
        if (response.ok) {
            const data = await response.json();
            const trackingId = data.gaTrackingId;
            if (trackingId && trackingId !== 'G-XXXXXXXXXX') {
                // Dynamically import Gtag script tag
                const script = document.createElement('script');
                script.async = true;
                script.src = `https://www.googletagmanager.com/gtag/js?id=${trackingId}`;
                document.head.appendChild(script);

                window.gtag('config', trackingId);
                console.log('OptiByte: Google Analytics initialized dynamically.');
            }
        }
    } catch (err) {
        console.warn('OptiByte: Dynamic Google Analytics initialization failed.', err);
    }
}

// Track uploaded files to Google Analytics
function trackUploadEvent(filename, extension, sizeInKB, parser) {
    if (typeof window.gtag === 'function') {
        window.gtag('event', 'upload_file', {
            'file_name': filename,
            'file_extension': extension,
            'file_size_kb': parseFloat(sizeInKB),
            'parser': parser
        });
    }
}

// ==========================================================================
// Upload Screen Event Handlers
// ==========================================================================
function setupUploadHandlers() {
    // Click uploader card to trigger file browser if it is empty
    fileUploaderCard.addEventListener('click', (e) => {
        if (e.target.closest('#change-file-btn')) return;
        
        if (fileUploaderCard.classList.contains('empty')) {
            fileInput.click();
        }
    });

    // File Input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });

    // Drag & Drop visual markers on uploader card and original editor card
    ['dragenter', 'dragover'].forEach(eventName => {
        fileUploaderCard.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (fileUploaderCard.classList.contains('empty')) {
                fileUploaderCard.classList.add('dragover');
            }
        }, false);

        originalCard.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            originalCard.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        fileUploaderCard.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileUploaderCard.classList.remove('dragover');
        }, false);

        originalCard.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            originalCard.classList.remove('dragover');
        }, false);
    });

    // File Drop capture
    fileUploaderCard.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleUploadedFile(files[0]);
        }
    });

    originalCard.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleUploadedFile(files[0]);
        }
    });

    // Change File / Reset Workspace Button
    changeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUploaderState();
    });

    // Empty State Upload Button trigger
    emptyUploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // Empty State Paste Button trigger
    emptyPasteBtn.addEventListener('click', () => {
        editorWorkspace.classList.add('has-content');
        setTimeout(() => {
            originalTextarea.focus();
        }, 50);
    });

    // Drag & Drop handlers for central empty-state uploader card
    ['dragenter', 'dragover'].forEach(eventName => {
        workspaceEmptyState.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            workspaceEmptyState.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        workspaceEmptyState.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            workspaceEmptyState.classList.remove('dragover');
        }, false);
    });

    workspaceEmptyState.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleUploadedFile(files[0]);
        }
    });

    // Global drag overlay (fades in when file is dragged anywhere over the window)
    let dragCounter = 0;
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) {
            globalDragOverlay.classList.add('active');
        }
    });

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    window.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter === 0) {
            globalDragOverlay.classList.remove('active');
        }
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        globalDragOverlay.classList.remove('active');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleUploadedFile(files[0]);
        }
    });
}

function resetUploaderState() {
    rawContent = "";
    originalTextarea.value = "";
    squeezedTextarea.value = "";
    fileInput.value = "";
    
    fileUploaderCard.classList.add('empty');
    uploaderEmptyState.style.display = 'flex';
    uploaderActiveState.style.display = 'none';
    
    currentFilename.textContent = "document_name.docx";
    currentFilesize.textContent = "2.4 MB";
    
    // Reset file icon color classes
    const activeFileIconWrap = uploaderActiveState.querySelector('.file-icon-wrap');
    if (activeFileIconWrap) {
        activeFileIconWrap.classList.remove('file-docx', 'file-md', 'file-txt', 'file-pdf', 'file-xlsx', 'file-pptx', 'file-code');
    }
    
    editorWorkspace.classList.remove('has-content');
    updateWorkspace("");
}

// Handles parsing via backend (MarkItDown) or client-side JS fallback
async function handleUploadedFile(file) {
    uploadedFileName = file.name;
    const sizeInKB = (file.size / 1024).toFixed(1);
    uploadedFileSize = sizeInKB > 1024 ? (sizeInKB / 1024).toFixed(1) + " MB" : sizeInKB + " KB";
    
    const extension = file.name.split('.').pop().toLowerCase();
    updateFileIconColor(extension);
    
    const advancedExtensions = ['pdf', 'xlsx', 'xls', 'pptx', 'ppt', 'html', 'csv', 'json', 'docx'];
    
    if (isBackendActive && hasMarkItDown && advancedExtensions.includes(extension)) {
        // Parse via server-side file converter
        showLoader("Analyzing File", "Uploading file to document parser...", 20);
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            updateLoaderProgress("Converting Document", "Extracting text and structure...", 50);
            
            const response = await fetch(`${BACKEND_URL}/api/convert`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Server conversion failed.');
            }
            
            const result = await response.json();
            if (result.success) {
                rawContent = result.markdown;
                trackUploadEvent(file.name, extension, sizeInKB, 'backend_markitdown');
                updateLoaderProgress("Optimization Engine", "Formatting data streams...", 85);
                setTimeout(() => {
                    hideLoader();
                    initWorkspace(rawContent);
                    showToast('success', '✓', 'Parsed Successfully', `${file.name} converted to Markdown`);
                }, 500);
            } else {
                throw new Error(result.error || 'Conversion error.');
            }
        } catch (e) {
            hideLoader();
            console.error('Backend upload conversion failed, attempting fallback...', e);
            showToast('error', '✗', 'Backend Error', e.message);
            
            // Fallback for DOCX
            if (extension === 'docx') {
                showToast('info', '✦', 'Local Fallback', 'Running client-side Word parser...');
                runClientSideDocx(file);
            } else {
                alert("Failed to parse file: " + e.message);
            }
        }
    } else {
        // Pure browser client-side execution
        if (extension === 'docx') {
            runClientSideDocx(file);
        } else if (extension === 'txt' || extension === 'md') {
            showLoader("Importing Document", "Opening file stream client-side...", 40);
            const reader = new FileReader();
            reader.onload = function(event) {
                rawContent = event.target.result;
                trackUploadEvent(file.name, extension, sizeInKB, 'client_filereader');
                updateLoaderProgress("Minifying formatting", "Structuring scopes...", 90);
                setTimeout(() => {
                    hideLoader();
                    initWorkspace(rawContent);
                }, 500);
            };
            reader.readAsText(file);
        } else {
            hideLoader();
            if (isBackendActive && !hasMarkItDown) {
                showToast('error', '✗', 'Parser Not Found', 'Advanced file parsing is not available. Please contact support or restart the server.');
            } else {
                showToast('error', '✗', 'Unsupported Format', 'This file type requires the server to be running. Please start the server and try again.');
            }
        }
    }
}

// Client-side fallback extractor for docx files
function runClientSideDocx(file) {
    showLoader("Parsing Word Document", "Extracting structures client-side...", 30);
    const reader = new FileReader();
    reader.onload = async function(event) {
        const arrayBuffer = event.target.result;
        mammoth.extractRawText({ arrayBuffer: arrayBuffer })
            .then((result) => {
                rawContent = result.value;
                const sizeInKB = (file.size / 1024).toFixed(1);
                trackUploadEvent(file.name, 'docx', sizeInKB, 'client_mammoth');
                updateLoaderProgress("Minifying Formatting", "Generating lossless structures...", 80);
                setTimeout(() => {
                    hideLoader();
                    initWorkspace(rawContent);
                }, 500);
            })
            .catch((err) => {
                hideLoader();
                alert("Mammoth DOCX Parser failed: " + err.message);
            });
    };
    reader.readAsArrayBuffer(file);
}

// Dynamically sets standard brand colors on file icons based on extension
function updateFileIconColor(extension) {
    const activeFileIconWrap = uploaderActiveState.querySelector('.file-icon-wrap');
    if (!activeFileIconWrap) return;
    
    activeFileIconWrap.classList.remove('file-docx', 'file-md', 'file-txt', 'file-pdf', 'file-xlsx', 'file-pptx', 'file-code');
    
    if (extension === 'docx' || extension === 'doc') {
        activeFileIconWrap.classList.add('file-docx');
    } else if (extension === 'md') {
        activeFileIconWrap.classList.add('file-md');
    } else if (extension === 'txt') {
        activeFileIconWrap.classList.add('file-txt');
    } else if (extension === 'pdf') {
        activeFileIconWrap.classList.add('file-pdf');
    } else if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
        activeFileIconWrap.classList.add('file-xlsx');
    } else if (extension === 'pptx' || extension === 'ppt') {
        activeFileIconWrap.classList.add('file-pptx');
    } else if (extension === 'html' || extension === 'json') {
        activeFileIconWrap.classList.add('file-code');
    }
}

// Initialize workspace screen content
function initWorkspace(content) {
    currentFilename.textContent = uploadedFileName;
    currentFilesize.textContent = uploadedFileSize;
    
    fileUploaderCard.classList.remove('empty');
    uploaderEmptyState.style.display = 'none';
    uploaderActiveState.style.display = 'flex';
    
    editorWorkspace.classList.add('has-content');
    originalTextarea.value = content;
    updateWorkspace(content);
}

// ==========================================================================
// Control Slider & Rules Synchronization
// ==========================================================================
function setupSliderHandlers() {
    squeezeSlider.addEventListener('input', () => {
        const level = parseInt(squeezeSlider.value);
        syncSliderUI(level);
        if (originalTextarea.value) updateWorkspace(originalTextarea.value);
    });

    // Level card click and keyboard handlers
    document.querySelectorAll('.level-card').forEach(card => {
        const selectLevel = () => {
            const level = parseInt(card.dataset.level);
            squeezeSlider.value = level;
            syncSliderUI(level);
            if (originalTextarea.value) updateWorkspace(originalTextarea.value);
        };
        card.addEventListener('click', selectLevel);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectLevel();
            }
        });
    });

    // Binding checkboxes change
    Object.keys(ruleToggles).forEach(key => {
        ruleToggles[key].addEventListener('change', () => {
            if (originalTextarea.value) updateWorkspace(originalTextarea.value);
        });
    });

    // Binding language select change
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
        languageSelect.addEventListener('change', () => {
            if (originalTextarea.value) updateWorkspace(originalTextarea.value);
        });
    }

    // Reset Rules Button trigger
    resetRulesBtn.addEventListener('click', () => {
        const level = parseInt(squeezeSlider.value);
        syncSliderUI(level);
        if (originalTextarea.value) updateWorkspace(originalTextarea.value);
    });
}

// Syncs rules checklist checkboxes with slider level values
function syncSliderUI(level) {
    if (typeof window.gtag === 'function') {
        window.gtag('event', 'change_level', {
            'event_category': 'interaction',
            'level': level
        });
    }
    // Update level cards active state and ARIA attributes
    document.querySelectorAll('.level-card').forEach(card => {
        const isActive = parseInt(card.dataset.level) === level;
        card.classList.toggle('active', isActive);
        card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });

    // Reset labels active state (hidden spans kept for compat)
    labelLvl1.classList.remove('active');
    labelLvl2.classList.remove('active');
    labelLvl3.classList.remove('active');
    labelLvl4.classList.remove('active');

    // Remove disabled wrapper formatting
    Object.keys(ruleToggles).forEach(key => {
        ruleToggles[key].parentElement.classList.remove('disabled');
    });

    if (level === 1) {
        labelLvl1.classList.add('active');
        
        // Level 1: Only Formatting Enabled
        ruleToggles.whitespace.checked = true;
        ruleToggles.tables.checked = true;
        
        // Disable high-end rules visually
        ruleToggles.codeMode.checked = false;
        ruleToggles.contractions.checked = false;
        ruleToggles.math.checked = false;
        ruleToggles.scoping.checked = false;
        ruleToggles.lz77.checked = false;
        ruleToggles.synonyms.checked = false;
        ruleToggles.telegraphic.checked = false;
        ruleToggles.disemvowel.checked = false;
        ruleToggles.decoder.checked = false;
 
        ruleToggles.codeMode.parentElement.classList.add('disabled');
        ruleToggles.contractions.parentElement.classList.add('disabled');
        ruleToggles.math.parentElement.classList.add('disabled');
        ruleToggles.scoping.parentElement.classList.add('disabled');
        ruleToggles.lz77.parentElement.classList.add('disabled');
        ruleToggles.synonyms.parentElement.classList.add('disabled');
        ruleToggles.telegraphic.parentElement.classList.add('disabled');
        ruleToggles.disemvowel.parentElement.classList.add('disabled');
        ruleToggles.decoder.parentElement.classList.add('disabled');
    } 
    else if (level === 2) {
        labelLvl2.classList.add('active');
        
        // Level 2: Formatting + Conjunctions/Contractions Enabled
        ruleToggles.whitespace.checked = true;
        ruleToggles.tables.checked = true;
        ruleToggles.codeMode.checked = true;
        ruleToggles.contractions.checked = true;
        ruleToggles.math.checked = true;
        
        // Disable Layer 3 and 4
        ruleToggles.scoping.checked = false;
        ruleToggles.lz77.checked = false;
        ruleToggles.synonyms.checked = false;
        ruleToggles.telegraphic.checked = false;
        ruleToggles.disemvowel.checked = false;
        ruleToggles.decoder.checked = false;
 
        ruleToggles.scoping.parentElement.classList.add('disabled');
        ruleToggles.lz77.parentElement.classList.add('disabled');
        ruleToggles.synonyms.parentElement.classList.add('disabled');
        ruleToggles.telegraphic.parentElement.classList.add('disabled');
        ruleToggles.disemvowel.parentElement.classList.add('disabled');
        ruleToggles.decoder.parentElement.classList.add('disabled');
    } 
    else if (level === 3) {
        labelLvl3.classList.add('active');
        
        // Level 3: All Enabled except Level 4 specific
        ruleToggles.whitespace.checked = true;
        ruleToggles.tables.checked = true;
        ruleToggles.codeMode.checked = true;
        ruleToggles.contractions.checked = true;
        ruleToggles.math.checked = true;
        ruleToggles.scoping.checked = true;
        ruleToggles.lz77.checked = true;
        ruleToggles.synonyms.checked = true;
        ruleToggles.telegraphic.checked = true;
        ruleToggles.disemvowel.checked = false;
        ruleToggles.decoder.checked = false;

        ruleToggles.disemvowel.parentElement.classList.add('disabled');
        ruleToggles.decoder.parentElement.classList.add('disabled');
    }
    else if (level === 4) {
        labelLvl4.classList.add('active');
        
        // Level 4: All Enabled EXCEPT disemvowel (which is disabled by default to prevent BPE token bloating)
        ruleToggles.whitespace.checked = true;
        ruleToggles.tables.checked = true;
        ruleToggles.codeMode.checked = true;
        ruleToggles.contractions.checked = true;
        ruleToggles.math.checked = true;
        ruleToggles.scoping.checked = true;
        ruleToggles.lz77.checked = true;
        ruleToggles.synonyms.checked = true;
        ruleToggles.telegraphic.checked = true;
        ruleToggles.disemvowel.checked = false;
        ruleToggles.decoder.checked = true;
    }
}

// ==========================================================================
// Text Editors & Main Calculations Pipeline
// ==========================================================================
function setupEditorHandlers() {
    // Live keystroke listener on original pane with debounce
    originalTextarea.addEventListener('input', () => {
        if (originalTextarea.value.trim() === '') {
            resetUploaderState();
            return;
        }
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            const text = originalTextarea.value;
            updateWorkspace(text);
        }, 350); // 350ms debouncer prevents CPU locking on typing
    });

    // Synchronized scroll controls
    let isScrollingOriginal = false;
    let isScrollingSqueezed = false;

    originalTextarea.addEventListener('scroll', () => {
        if (isScrollingSqueezed) return;
        isScrollingOriginal = true;
        const maxScrollOriginal = originalTextarea.scrollHeight - originalTextarea.clientHeight;
        if (maxScrollOriginal > 0) {
            const scrollPct = originalTextarea.scrollTop / maxScrollOriginal;
            squeezedTextarea.scrollTop = scrollPct * (squeezedTextarea.scrollHeight - squeezedTextarea.clientHeight);
        }
        setTimeout(() => { isScrollingOriginal = false; }, 50);
    });

    squeezedTextarea.addEventListener('scroll', () => {
        if (isScrollingOriginal) return;
        isScrollingSqueezed = true;
        const maxScrollSqueezed = squeezedTextarea.scrollHeight - squeezedTextarea.clientHeight;
        if (maxScrollSqueezed > 0) {
            const scrollPct = squeezedTextarea.scrollTop / maxScrollSqueezed;
            originalTextarea.scrollTop = scrollPct * (originalTextarea.scrollHeight - originalTextarea.clientHeight);
        }
        setTimeout(() => { isScrollingSqueezed = false; }, 50);
    });
}

// Primary workspace updater orchestrating tokenizer calculations & compression runs
function updateWorkspace(text) {
    try {
        const level = parseInt(squeezeSlider.value);
        
        // Dynamically update the editor result badge text
        const badge = document.getElementById('squeezed-badge');
        if (badge) {
            if (level === 1) badge.textContent = "OBUP Level 1: Clean";
            else if (level === 2) badge.textContent = "OBUP Level 2: Brevity";
            else if (level === 3) badge.textContent = "OBUP Level 3: Ultra (v5 Spec)";
            else if (level === 4) badge.textContent = "OBUP Level 4: Quantum (v5 Spec)";
        }
        
        // 1. Gather active rule toggles
        const languageSelectEl = document.getElementById('language-select');
        const activeRules = {
            whitespace: ruleToggles.whitespace.checked,
            tables: ruleToggles.tables.checked,
            contractions: ruleToggles.contractions.checked,
            math: ruleToggles.math.checked,
            scoping: ruleToggles.scoping.checked,
            lz77: ruleToggles.lz77.checked,
            synonyms: ruleToggles.synonyms.checked,
            telegraphic: ruleToggles.telegraphic.checked,
            disemvowel: ruleToggles.disemvowel.checked,
            decoder: ruleToggles.decoder.checked,
            language: languageSelectEl ? languageSelectEl.value : 'en'
        };

        // 2. Perform OBUP Compression
        const compressed = compressText(text, level, activeRules);
        
        // Show processing shimmer briefly
        const squeezedBody = squeezedTextarea.closest('.editor-body');
        if (squeezedBody) {
            squeezedBody.classList.add('processing');
            setTimeout(() => squeezedBody.classList.remove('processing'), 350);
        }

        // Fill optimized editor pane
        squeezedTextarea.value = compressed;

        // 3. Count words & characters
        const origChars = text.length;
        const origWords = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
        
        const squeezedChars = compressed.length;
        const squeezedWords = compressed.trim() === "" ? 0 : compressed.trim().split(/\s+/).length;

        origCharCount.textContent = `${origChars.toLocaleString()} chars`;
        origWordCount.textContent = `${origWords.toLocaleString()} words`;
        squeezedCharCount.textContent = `${squeezedChars.toLocaleString()} chars`;
        squeezedWordCount.textContent = `${squeezedWords.toLocaleString()} words`;

        // 4. Token counts
        const origTokens = countTokens(text);
        const squeezedTokens = countTokens(compressed);

        statOriginalTokens.textContent = origTokens.toLocaleString();
        statSqueezedTokens.textContent = squeezedTokens.toLocaleString();

        // Animate pop effect on metric values
        statOriginalTokens.classList.remove('pop');
        statSqueezedTokens.classList.remove('pop');
        void statOriginalTokens.offsetWidth; // force reflow
        statOriginalTokens.classList.add('pop');
        statSqueezedTokens.classList.add('pop');

        // 5. Calculate Savings & Gauges
        let reductionPercent = 0;
        let chatExpansion = 1.0;

        if (origTokens > 0) {
            reductionPercent = Math.round(((origTokens - squeezedTokens) / origTokens) * 100);
            chatExpansion = (origTokens / squeezedTokens).toFixed(1);
            
            if (typeof window.gtag === 'function') {
                window.gtag('event', 'optimize_text', {
                    'compression_level': level,
                    'original_tokens': origTokens,
                    'compressed_tokens': squeezedTokens,
                    'savings_percent': reductionPercent
                });
            }
        }

        reductionPercent = Math.max(0, reductionPercent);
        savingsPercentText.textContent = `${reductionPercent}%`;
        
        // Update circular SVG gauge stroke
        gaugeFill.setAttribute('stroke-dasharray', `${reductionPercent}, 100`);

        // Celebration glow on high savings
        const gaugeContainer = document.querySelector('.gauge-container');
        if (gaugeContainer) {
            if (reductionPercent >= 40) {
                gaugeContainer.classList.add('celebrating');
            } else {
                gaugeContainer.classList.remove('celebrating');
            }
        }

        // Trigger confetti burst on first-time high compression
        if (reductionPercent >= 40 && origTokens > 50) {
            triggerConfetti();
        }

        // Update Cost Estimation dashboard
        calcChatExpansion.textContent = `${chatExpansion}x`;
        calcCostReduction.textContent = `${reductionPercent}%`;

        // 6. Update visual Density Bar scale
        const densityBar = document.getElementById('density-bar-squeezed');
        const densityRatioText = document.getElementById('density-ratio');
        if (densityBar && densityRatioText) {
            const densityPct = origTokens > 0 ? Math.round((squeezedTokens / origTokens) * 100) : 100;
            densityBar.style.width = `${densityPct}%`;
            densityRatioText.textContent = `${densityPct}% active`;
        }

        // 7. Calculate Live Model Cost Savings (per 100K original inputs)
        const saveClaude = document.getElementById('save-claude');
        const saveGpt4o = document.getElementById('save-gpt4o');
        const saveGemini = document.getElementById('save-gemini');
        let claudeSavingsVal = 0;
        if (saveClaude && saveGpt4o) {
            if (origTokens > 0) {
                const tokenDiff = origTokens - squeezedTokens;
                claudeSavingsVal = (tokenDiff * 3.00) / 10000;
                const gptSavings     = (tokenDiff * 2.50) / 10000;
                const geminiSavings  = (tokenDiff * 1.25) / 10000;
                saveClaude.textContent = `$${claudeSavingsVal.toFixed(2)}`;
                saveGpt4o.textContent  = `$${gptSavings.toFixed(2)}`;
                if (saveGemini) saveGemini.textContent = `$${geminiSavings.toFixed(2)}`;
            } else {
                saveClaude.textContent = "$0.00";
                saveGpt4o.textContent  = "$0.00";
                if (saveGemini) saveGemini.textContent = "$0.00";
            }
        }

        // 8. Update KPI Strip with pop animations
        const origCharsVal = origChars;
        const charsRemoved = Math.max(0, origCharsVal - squeezedChars);
        animateKpiValue(kpiSavings,   `${reductionPercent}%`);
        animateKpiValue(kpiExpansion, `${chatExpansion}x`);
        animateKpiValue(kpiCost,      `$${claudeSavingsVal.toFixed(2)}`);
        animateKpiValue(kpiChars,     charsRemoved.toLocaleString());

        // Calculate and update Semantic Fidelity
        const fidelityScore = calculateSemanticFidelity(text, compressed);
        const fidelityEl = document.getElementById('semantic-fidelity');
        const kpiFidelity = document.getElementById('kpi-fidelity');
        if (fidelityEl) {
            fidelityEl.textContent = `${fidelityScore}%`;
        }
        if (kpiFidelity) {
            animateKpiValue(kpiFidelity, `${fidelityScore}%`);
        }
    } catch (err) {
        console.error("OptiByte: Error updating workspace:", err);
        if (typeof showToast === 'function') {
            showToast('error', '✗', 'Processing Error', err.message);
        }
    }
}

// Helper: animate a KPI element value change with a pop
function animateKpiValue(el, newVal) {
    if (!el) return;
    if (el.textContent === newVal) return;
    el.textContent = newVal;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    el.addEventListener('animationend', () => el.classList.remove('pop'), { once: true });
}

// ==========================================================================
// Copy & File Download Triggers
// ==========================================================================
function setupExportHandlers() {
    const triggerSave = () => {
        const origTokens = parseInt(statOriginalTokens.textContent.replace(/,/g, '')) || 0;
        const squeezedTokens = parseInt(statSqueezedTokens.textContent.replace(/,/g, '')) || 0;
        const level = parseInt(squeezeSlider.value);
        saveToHistory(uploadedFileName, origTokens, squeezedTokens, level, originalTextarea.value);
        triggerFeedbackPrompt();
    };

    // Copy Optimized Text
    copyBtn.addEventListener('click', () => {
        const text = squeezedTextarea.value;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            // Brief visual state change on button
            copyBtn.classList.add('copied');
            copyBtnText.textContent = 'Copied!';
            copyBtn.querySelector('.icon-copy').style.display = 'none';
            copyBtn.querySelector('.icon-success').style.display = 'block';
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtnText.textContent = 'Copy Optimized';
                copyBtn.querySelector('.icon-copy').style.display = 'block';
                copyBtn.querySelector('.icon-success').style.display = 'none';
            }, 2000);
            // GA Event Tracking
            if (typeof window.gtag === 'function') {
                window.gtag('event', 'copy_result', {
                    'event_category': 'export',
                    'copy_type': 'optimized_text',
                    'tokens': parseInt(statSqueezedTokens.textContent.replace(/,/g, '')) || 0
                });
            }
            // Toast
            const tokenCount = statSqueezedTokens.textContent;
            showToast('success', '✓', 'Optimized Text Copied', `${tokenCount} tokens ready to paste`);
            triggerSave();
        });
    });

    // Copy AI Prompt
    copyPromptBtn.addEventListener('click', () => {
        const squeezedText = squeezedTextarea.value;
        if (!squeezedText) return;
        const prompt = buildOBUPv5DecoderPrompt(squeezedText);
        navigator.clipboard.writeText(prompt).then(() => {
            copyPromptBtn.classList.add('copied');
            copyPromptBtnText.textContent = 'Copied!';
            copyPromptBtn.querySelector('.icon-sparkle').style.display = 'none';
            copyPromptBtn.querySelector('.icon-success').style.display = 'block';
            setTimeout(() => {
                copyPromptBtn.classList.remove('copied');
                copyPromptBtnText.textContent = 'Copy AI Prompt';
                copyPromptBtn.querySelector('.icon-sparkle').style.display = 'block';
                copyPromptBtn.querySelector('.icon-success').style.display = 'none';
            }, 2000);
            // GA Event Tracking
            if (typeof window.gtag === 'function') {
                window.gtag('event', 'copy_result', {
                    'event_category': 'export',
                    'copy_type': 'decoder_prompt',
                    'tokens': parseInt(statSqueezedTokens.textContent.replace(/,/g, '')) || 0
                });
            }
            showToast('info', '✦', 'AI Prompt Copied', 'Paste directly into Claude or GPT');
            triggerSave();
        });
    });

    // Download Markdown File
    downloadBtn.addEventListener('click', () => {
        const text = squeezedTextarea.value;
        if (!text) return;
        const rawName = uploadedFileName.split('.').slice(0, -1).join('.');
        const downloadName = `${rawName || 'optimized_document'}_optibyte.md`;
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', downloadName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            // GA Event Tracking
            if (typeof window.gtag === 'function') {
                window.gtag('event', 'download_file', {
                    'event_category': 'export',
                    'file_name': downloadName,
                    'tokens': parseInt(statSqueezedTokens.textContent.replace(/,/g, '')) || 0
                });
            }
            showToast('download', '↓', 'File Downloaded', downloadName);
            triggerSave();
        }
    });
}

// Generates the full OBUP v5 decoder prompt wrapped around compressed text
function buildOBUPv5DecoderPrompt(compressedText) {
    return `The following text is compressed using the OptiByte Universal Protocol (OBUP v5) to minimize token usage. Reconstruct the full semantic meaning in memory and use it to respond to my subsequent questions.

## Parsing Rules for OBUP v5:
1. Macro Definitions: The header [OBUPv5] defines repeating macros like [A=phrase]. Substitute [A], [B], etc. with their definitions throughout the text.
2. Contractions & Abbreviations: Expand standard abbreviations (e.g. docs -> documentation, reqs -> requirements).
3. Vowel-less Words: Restore interior vowels for words of 5+ letters (e.g. cnfgrtn -> configuration, tchnlgy -> technology) based on the context.
4. Logical Symbols: Map logical shorthands: (∈ -> belongs to/is a member of), (⇒ -> implies/leads to), (∴ -> therefore), (∵ -> because), (& -> and), (w/ -> with), (w/o -> without), (btwn -> between), (eg -> for example).

--- COMPRESSED TEXT START ---
${compressedText}
--- COMPRESSED TEXT END ---

Please confirm you have successfully decoded the text by giving a brief 1-sentence summary of what this document is about, and let me know you are ready for my questions.`;
}

// ==========================================================================
// Quantum Loader Operations
// ==========================================================================
function showLoader(title, subtitle, progressPercent = 0) {
    loaderTitle.textContent = title;
    loaderSubtitle.textContent = subtitle;
    loaderProgress.style.width = `${progressPercent}%`;
    loadingOverlay.classList.add('active');
}

function updateLoaderProgress(title, subtitle, progressPercent) {
    loaderTitle.textContent = title;
    loaderSubtitle.textContent = subtitle;
    loaderProgress.style.width = `${progressPercent}%`;
}

function hideLoader() {
    loadingOverlay.classList.remove('active');
}

// ==========================================================================
// Premium UI Interactivity: Parallax & Typewriters
// ==========================================================================

// ==========================================================================
// Toast Notification System
// ==========================================================================
function showToast(type, iconText, title, subtitle, duration = 3000) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-icon ${type}">${iconText}</div>
        <div class="toast-body">
            <span class="toast-title">${title}</span>
            <span class="toast-subtitle">${subtitle}</span>
        </div>
        <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    toastContainer.appendChild(toast);

    // Trigger show animation next frame
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    // Auto-dismiss
    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);

    // Click to dismiss early
    toast.addEventListener('click', () => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    });
}

// ==========================================================================
// Keyboard Shortcuts
// ==========================================================================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+C  → copy optimized
        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            copyBtn.click();
        }
        // Ctrl+Shift+D  → download
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            downloadBtn.click();
        }
    });
}

// ==========================================================================
// Monochromatic 3D Parallax Mouse Interactivity
// ==========================================================================
function setupParallaxEffect() {
    let ticking = false;
    window.addEventListener('mousemove', (e) => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const moveX = (e.clientX - window.innerWidth / 2) * 0.012;
                const moveY = (e.clientY - window.innerHeight / 2) * 0.012;
                
                const starfield = document.querySelector('.starfield-bg');
                if (starfield) {
                    starfield.style.transform = `translate3d(${moveX * 0.6}px, ${moveY * 0.6}px, 0)`;
                }
                
                const glow1 = document.querySelector('.bg-glow-1');
                const glow2 = document.querySelector('.bg-glow-2');
                const glow3 = document.querySelector('.bg-glow-3');
                
                if (glow1) glow1.style.transform = `translate3d(${moveX * -1.2}px, ${moveY * -1.2}px, 0)`;
                if (glow2) glow2.style.transform = `translate3d(${moveX * 1.6}px, ${moveY * 1.6}px, 0)`;
                if (glow3) glow3.style.transform = `translate3d(${moveX * -0.7}px, ${moveY * -0.7}px, 0)`;
                
                ticking = false;
            });
            ticking = true;
        }
    });
}

// Onboarding Typewriter Animations
function startTypewriterEffect() {
    const textEl = document.getElementById('typewriter-text');
    if (!textEl) return;
    
    const phrases = [
        "Compress your Word documents, markdown files, and system prompts by up to 70%.",
        "100% client-side privacy. Absolutely zero factual or semantic loss.",
        "Compacting system preambles and database structures...",
        "Pruning conversational fillers and optimizing set-theory logical syntax...",
        "Ready to squeeze your tokens. Paste raw text or drop your file above!"
    ];
    
    let phraseIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    
    function tick() {
        const currentPhrase = phrases[phraseIdx];
        if (isDeleting) {
            textEl.textContent = currentPhrase.substring(0, charIdx - 1);
            charIdx--;
        } else {
            textEl.textContent = currentPhrase.substring(0, charIdx + 1);
            charIdx++;
        }
        
        let delta = 45; // smooth typewriting speed
        
        if (isDeleting) {
            delta /= 1.8; // delete faster
        }
        
        if (!isDeleting && charIdx === currentPhrase.length) {
            delta = 2800; // wait before deleting
            isDeleting = true;
        } else if (isDeleting && charIdx === 0) {
            isDeleting = false;
            phraseIdx = (phraseIdx + 1) % phrases.length;
            delta = 600; // brief pause before next typing cycle
        }
        
        setTimeout(tick, delta);
    }
    
    tick();
}

// ==========================================================================
// Confetti Celebration Effect (Fires on High Compression)
// ==========================================================================
let lastConfettiTime = 0;

function triggerConfetti() {
    const now = Date.now();
    // Debounce: only fire once every 3 seconds
    if (now - lastConfettiTime < 3000) return;
    lastConfettiTime = now;

    const container = document.getElementById('confetti-container');
    if (!container) return;

    const colors = [
        'hsl(263, 80%, 62%)',  // violet
        'hsl(328, 85%, 58%)',  // pink
        'hsl(185, 85%, 52%)',  // cyan
        'hsl(152, 70%, 50%)',  // emerald
        'hsl(38, 95%, 60%)',   // amber
        '#fff'
    ];

    const particleCount = 25;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.classList.add('confetti-particle');
        
        const color = colors[Math.floor(Math.random() * colors.length)];
        const left = 10 + Math.random() * 80; // spread across 10-90% of viewport
        const size = 4 + Math.random() * 6;
        const delay = Math.random() * 0.6;
        const duration = 1.5 + Math.random() * 1.5;

        particle.style.cssText = `
            left: ${left}%;
            top: -10px;
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            box-shadow: 0 0 6px ${color};
            animation-delay: ${delay}s;
            animation-duration: ${duration}s;
            border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        `;

        container.appendChild(particle);

        // Clean up particle after animation
        setTimeout(() => {
            particle.remove();
        }, (delay + duration) * 1000 + 100);
    }
}

// ==========================================================================
// UX Additions: Dark Mode, History & Global Paste Handler
// ==========================================================================

function setupThemeHandler() {
    const themeToggleBtn = document.getElementById('dark-mode-toggle');
    if (!themeToggleBtn) return;
    
    const sunIcon = themeToggleBtn.querySelector('.icon-sun');
    const moonIcon = themeToggleBtn.querySelector('.icon-moon');
    
    // Check saved theme
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-theme');
        if (sunIcon) sunIcon.style.display = 'block';
        if (moonIcon) moonIcon.style.display = 'none';
    } else {
        document.body.classList.remove('dark-theme');
        if (sunIcon) sunIcon.style.display = 'none';
        if (moonIcon) moonIcon.style.display = 'block';
    }
    
    themeToggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        if (isDark) {
            if (sunIcon) sunIcon.style.display = 'block';
            if (moonIcon) moonIcon.style.display = 'none';
            showToast('info', '☾', 'Dark Mode Active', 'Switched to low-light neon palette');
        } else {
            if (sunIcon) sunIcon.style.display = 'none';
            if (moonIcon) moonIcon.style.display = 'block';
            showToast('info', '☀', 'Light Mode Active', 'Switched to warm paper neon palette');
        }
    });
}

function setupHistoryHandler() {
    const historyToggleBtn = document.getElementById('history-toggle-btn');
    const historyDrawer = document.getElementById('history-drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const historyListContainer = document.getElementById('history-list-container');
    
    if (!historyToggleBtn || !historyDrawer || !drawerOverlay) return;
    
    // Toggle drawer open
    historyToggleBtn.addEventListener('click', () => {
        historyDrawer.classList.add('open');
        drawerOverlay.classList.add('active');
        renderHistory();
    });
    
    // Close drawer
    const closeDrawer = () => {
        historyDrawer.classList.remove('open');
        drawerOverlay.classList.remove('active');
    };
    
    closeDrawerBtn.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);
    
    // Clear history
    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('squeeze_history');
        renderHistory();
        showToast('info', '✦', 'History Cleared', 'All saved sessions have been removed');
    });
    
    // Render list
    function renderHistory() {
        const historyData = JSON.parse(localStorage.getItem('squeeze_history') || '[]');
        
        if (historyData.length === 0) {
            historyListContainer.innerHTML = `
                <div class="drawer-empty-state">
                    <p>No recent optimizations.</p>
                    <span>Your squeezed sessions will appear here for quick access.</span>
                </div>
            `;
            return;
        }
        
        historyListContainer.innerHTML = '';
        historyData.forEach(item => {
            const dateObj = new Date(item.date);
            const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + 
                            dateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
            
            const savingsPct = Math.max(0, Math.round(((item.originalTokens - item.squeezedTokens) / item.originalTokens) * 100));
            
            const itemEl = document.createElement('div');
            itemEl.className = 'history-item';
            itemEl.innerHTML = `
                <div class="history-item-top">
                    <span class="history-item-title">${escapeHTML(item.filename)}</span>
                    <span class="history-item-date">${dateStr}</span>
                </div>
                <div class="history-item-metrics">
                    <span class="history-item-badge badge-grey">L${item.level}</span>
                    <span class="history-item-savings">${savingsPct}% saved</span>
                </div>
            `;
            
            itemEl.addEventListener('click', () => {
                uploadedFileName = item.filename;
                uploadedFileSize = item.filesize || 'Unknown Size';
                initWorkspace(item.rawText);
                closeDrawer();
                showToast('success', '✓', 'Session Restored', `${item.filename} loaded into workspace`);
            });
            
            historyListContainer.appendChild(itemEl);
        });
    }
}

// Simple HTML escaping helper for safe rendering
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

// Global function to save a compression run to localStorage history
function saveToHistory(filename, originalTokens, squeezedTokens, level, rawText) {
    if (!rawText || rawText.trim() === '') return;
    
    // Retrieve history
    const historyData = JSON.parse(localStorage.getItem('squeeze_history') || '[]');
    
    // De-duplicate: remove previous session with identical text to avoid redundancy
    const filteredHistory = historyData.filter(item => item.rawText !== rawText);
    
    // Prepend new item
    const newItem = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        filename: filename || 'pasted_text.txt',
        filesize: uploadedFileSize,
        date: new Date().toISOString(),
        originalTokens,
        squeezedTokens,
        level,
        rawText
    };
    
    filteredHistory.unshift(newItem);
    
    // Limit to 15 items
    if (filteredHistory.length > 15) {
        filteredHistory.pop();
    }
    
    localStorage.setItem('squeeze_history', JSON.stringify(filteredHistory));
}

function setupWindowPasteHandler() {
    window.addEventListener('paste', (e) => {
        // Skip if user is actively focused on a textarea or input field
        const active = document.activeElement;
        const tag = active ? active.tagName.toLowerCase() : '';
        if (tag === 'textarea' || tag === 'input') {
            return;
        }
        
        const clipboardText = (e.clipboardData || window.clipboardData).getData('text');
        if (clipboardText && clipboardText.trim() !== '') {
            uploadedFileName = "pasted_text.txt";
            const sizeInKB = (clipboardText.length / 1024).toFixed(1);
            uploadedFileSize = sizeInKB + " KB";
            initWorkspace(clipboardText);
            showToast('success', '✦', 'Pasted Clipboard Content', 'Imported clipboard text into raw workspace');
        }
    });
}

// ==========================================================================
// Feedback Modal System
// ==========================================================================
function openFeedbackModal() {
    if (feedbackModal && modalOverlay) {
        feedbackModal.classList.add('active');
        modalOverlay.classList.add('active');
    }
}

function closeFeedbackModal() {
    if (feedbackModal && modalOverlay) {
        feedbackModal.classList.remove('active');
        modalOverlay.classList.remove('active');
        resetFeedbackForm();
    }
}

function resetFeedbackForm() {
    if (feedbackForm) {
        feedbackForm.reset();
    }
    ratingBtns.forEach(btn => btn.classList.remove('active'));
    selectedRating = 0;
}

function triggerFeedbackPrompt() {
    // Check sessionStorage to ensure it only prompts once per session
    if (sessionStorage.getItem('optibyte_feedback_prompted') === 'true') {
        return;
    }
    
    // 4-second delay before popping up
    setTimeout(() => {
        if (sessionStorage.getItem('optibyte_feedback_prompted') === 'true') {
            return;
        }
        openFeedbackModal();
        sessionStorage.setItem('optibyte_feedback_prompted', 'true');
    }, 4000);
}

function setupFeedbackHandler() {
    if (feedbackToggleBtn) {
        feedbackToggleBtn.addEventListener('click', openFeedbackModal);
    }
    if (closeFeedbackBtn) {
        closeFeedbackBtn.addEventListener('click', closeFeedbackModal);
    }
    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeFeedbackModal);
    }

    // Emoji Rating Selector
    ratingBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const rating = parseInt(btn.getAttribute('data-rating'));
            selectedRating = rating;

            ratingBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Submit Action
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const textVal = document.getElementById('feedback-text').value;

            if (selectedRating === 0) {
                showToast('warning', '⚠', 'Rating Required', 'Please select a rating emoji before submitting.');
                return;
            }

            const submitBtn = document.getElementById('submit-feedback-btn');
            const originalBtnText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';

            try {
                const response = await fetch('/api/feedback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        rating: selectedRating,
                        message: textVal
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    showToast('success', '✦', 'Feedback Submitted', 'Thank you for helping us improve!');
                    sessionStorage.setItem('optibyte_feedback_prompted', 'true');
                    closeFeedbackModal();
                } else {
                    showToast('error', '✗', 'Failed', data.error || 'Failed to submit feedback.');
                }
            } catch (err) {
                console.error('Feedback submission error:', err);
                showToast('error', '✗', 'Error', 'Could not connect to the feedback server.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        });
    }
}

// Setup global listener to catch and report client-side JavaScript errors to server logs
function setupClientErrorLogger() {
    window.onerror = function (message, url, line, column, errorObj) {
        // Prepare payload, strip error stack to avoid excessive length if needed
        const payload = {
            message: message || 'Unknown client error',
            url: url || window.location.href,
            line: line || 0,
            column: column || 0,
            errorObj: errorObj ? {
                message: errorObj.message,
                stack: errorObj.stack ? errorObj.stack.substring(0, 2000) : ''
            } : null,
            userAgent: navigator.userAgent
        };

        // Fire-and-forget POST to the server
        fetch('/api/log-error', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).catch(() => {
            // Silence networking failures to avoid infinite error logging loops
        });

        // Let the browser handle standard console printing
        return false;
    };

    window.onunhandledrejection = function (event) {
        const reason = event.reason;
        const payload = {
            message: reason instanceof Error ? reason.message : String(reason),
            url: window.location.href,
            line: 0,
            column: 0,
            errorObj: reason instanceof Error ? {
                message: reason.message,
                stack: reason.stack ? reason.stack.substring(0, 2000) : ''
            } : { reason: String(reason) },
            userAgent: navigator.userAgent
        };

        fetch('/api/log-error', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).catch(() => {});
    };
}
