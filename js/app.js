// app.js — 离线问答解锁器（合并版，兼容 file:// 协议）
// 合并自：crt.js, crypto.js, encoding.js, creator.js, solver.js, main.js

(function () {
'use strict';

var i18n = (typeof window !== 'undefined' && window.ShardKeyI18n) ? window.ShardKeyI18n : null;
function t(key, params) {
    if (i18n && typeof i18n.t === 'function') return i18n.t(key, params);
    var out = String(key);
    if (params && typeof params === 'object') {
        Object.keys(params).forEach(function (k) {
            var placeholder = '{' + k + '}';
            var value = String(params[k]);
            var result = '';
            var idx;
            var start = 0;
            while ((idx = out.indexOf(placeholder, start)) !== -1) {
                result += out.substring(start, idx) + value;
                start = idx + placeholder.length;
            }
            out = result + out.substring(start);
        });
    }
    return out;
}
function getLocaleForIntl() {
    if (i18n && typeof i18n.getLocaleForIntl === 'function') return i18n.getLocaleForIntl();
    return 'zh-CN';
}

function getWorkerMessages() {
    if (i18n && typeof i18n.getMessages === 'function') {
        return i18n.getMessages();
    }
    return {};
}

async function runTaskLocally(taskType, payload, onProgress) {
    if (taskType === 'generate') {
        return await generateChallenge(
            payload.secret,
            payload.questions,
            payload.threshold,
            payload.title,
            payload.description,
            onProgress
        );
    }
    if (taskType === 'recover') {
        return await recoverSecret(payload.challenge, payload.answers);
    }
    if (taskType === 'generate-shards') {
        return await generateShards(payload.secret, payload.totalShards, payload.threshold, onProgress);
    }
    if (taskType === 'recover-shards') {
        return await recoverFromShards(payload.shards);
    }
    throw new Error('Unknown task type: ' + taskType);
}

var persistentWorker = null;
var workerSupported = typeof Worker !== 'undefined';
var workerTaskQueue = Promise.resolve();

function ensureWorker() {
    if (!workerSupported) return null;
    if (persistentWorker) return persistentWorker;
    try {
        persistentWorker = new Worker('js/worker.js');
        return persistentWorker;
    } catch (e) {
        workerSupported = false;
        return null;
    }
}

function discardWorker() {
    if (persistentWorker) {
        try { persistentWorker.terminate(); } catch (e) {}
        persistentWorker = null;
    }
}

function runWorkerTask(taskType, payload, onProgress) {
    var gate;
    var prevQueue = workerTaskQueue;
    workerTaskQueue = new Promise(function (r) { gate = r; });

    return prevQueue.then(function () {
        return runWorkerTaskInner(taskType, payload, onProgress, gate);
    });
}

async function runWorkerTaskInner(taskType, payload, onProgress, release) {
    var worker = ensureWorker();
    if (!worker) {
        try {
            return await runTaskLocally(taskType, payload, onProgress);
        } finally {
            release();
        }
    }

    return await new Promise(function (resolve, reject) {
        var settled = false;

        function detach() {
            worker.onmessage = null;
            worker.onerror = null;
            worker.onmessageerror = null;
        }

        function finishWithResult(result) {
            if (settled) return;
            settled = true;
            detach();
            release();
            resolve(result);
        }

        function finishWithError(error) {
            if (settled) return;
            settled = true;
            detach();
            release();
            reject(error);
        }

        function fallbackToLocal() {
            if (settled) return;
            settled = true;
            detach();
            discardWorker();
            runTaskLocally(taskType, payload, onProgress).then(
                function (r) { release(); resolve(r); },
                function (e) { release(); reject(e); }
            );
        }

        worker.onmessage = function (event) {
            var data = event.data || {};
            if (data.type === 'progress') {
                if (typeof onProgress === 'function') {
                    try { onProgress(data.msg, data.done, data.total); } catch (e) {}
                }
                return;
            }
            if (data.type === 'result') {
                finishWithResult(data.result);
                return;
            }
            if (data.type === 'error') {
                finishWithError(new Error(data.error || 'Worker task failed'));
                return;
            }
            finishWithError(new Error('Worker returned invalid response'));
        };

        worker.onerror = fallbackToLocal;
        worker.onmessageerror = fallbackToLocal;

        try {
            worker.postMessage({
                type: taskType,
                payload: payload,
                messages: getWorkerMessages(),
            });
        } catch (e) {
            fallbackToLocal();
        }
    });
}

// =====================================================================
// limits.js — 安全稳健的输入边界
// =====================================================================

var LIMITS = Object.assign({}, ShardKeyCore.DEFAULTS, {
    maxUrlHashChars: 20000,
    maxChallengeFileBytes: 250000,
    maxShardTextChars: 50000,
});

// =====================================================================
// protocol.js — v4 协议包装（Shamir + AEAD）
// =====================================================================

function getCoreOptions(extra) {
    var base = {
        translate: t,
        limits: LIMITS,
    };
    if (!extra) return base;
    Object.keys(extra).forEach(function (key) {
        base[key] = extra[key];
    });
    return base;
}

function packChallengeForShare(challenge) {
    return ShardKeyCore.packChallengeForShare(challenge, getCoreOptions());
}

function unpackChallengeFromShare(payload) {
    return ShardKeyCore.unpackChallengeFromShare(payload, getCoreOptions());
}

function challengeToBase64(obj) {
    return ShardKeyCore.encodeJsonBase64Url(packChallengeForShare(obj));
}

function challengeFromBase64(base64url) {
    if (typeof base64url !== 'string' || base64url.length === 0) {
        throw new Error(t('errors.link.invalid_data'));
    }
    if (base64url.length > LIMITS.maxUrlHashChars) {
        throw new Error(t('errors.link.too_long_use_json'));
    }
    return unpackChallengeFromShare(ShardKeyCore.decodeJsonBase64Url(base64url, getCoreOptions()));
}

function getCurrentShareLang() {
    if (!i18n || typeof i18n.getLang !== 'function') {
        return '';
    }
    return i18n.getLang() || '';
}

function getShareBaseURL() {
    var baseURL = window.location.href.split('#')[0];
    try {
        var url = new URL(baseURL);
        url.search = '';

        var currentLang = getCurrentShareLang();
        if (currentLang) {
            url.searchParams.set('lang', currentLang);
        }

        return url.toString();
    } catch (e) {
        return baseURL;
    }
}

function challengeToURL(obj) {
    var base64 = challengeToBase64(obj);
    return getShareBaseURL() + '#' + base64;
}

function challengeToFile(obj, filename) {
    var json = JSON.stringify(obj, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'challenge.json';
    try {
        document.body.appendChild(a);
        a.click();
    } finally {
        if (a.parentNode) {
            a.parentNode.removeChild(a);
        }
        URL.revokeObjectURL(url);
    }
}

function challengeFromFile(file) {
    return new Promise(function (resolve, reject) {
        if (!file || typeof file.size !== 'number') {
            reject(new Error(t('errors.file.invalid')));
            return;
        }
        if (file.size > LIMITS.maxChallengeFileBytes) {
            reject(new Error(t('errors.file.too_large', { size: file.size })));
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            try {
                resolve(JSON.parse(reader.result));
            } catch (e) {
                reject(new Error(t('errors.file.invalid_format')));
            }
        };
        reader.onerror = function () { reject(new Error(t('errors.file.read_failed'))); };
        reader.readAsText(file);
    });
}

function packShardForShare(shard) {
    return ShardKeyCore.packShardForShare(shard, getCoreOptions());
}

function unpackShardFromShare(value) {
    return ShardKeyCore.unpackShardFromShare(value, getCoreOptions());
}

function shardToBase64(shard) {
    return ShardKeyCore.encodeJsonBase64Url(packShardForShare(shard));
}

function shardFromBase64(base64url) {
    if (typeof base64url !== 'string' || base64url.length === 0) {
        throw new Error(t('errors.shard.link.invalid_data'));
    }
    if (base64url.length > LIMITS.maxUrlHashChars) {
        throw new Error(t('errors.shard.link.too_long'));
    }
    return unpackShardFromShare(ShardKeyCore.decodeJsonBase64Url(base64url, getCoreOptions()));
}

function shardToURL(shard) {
    var base64 = shardToBase64(shard);
    return getShareBaseURL() + '#shard:' + base64;
}

function parseSolveHashData(hashData) {
    var trimmed = String(hashData || '').trim().replace(/^#/, '');
    if (!trimmed) {
        throw new Error(t('errors.solve.link_no_data'));
    }

    if (trimmed.indexOf('shard:') === 0) {
        var shardPayload = trimmed.substring(6);
        return {
            type: 'shard',
            modeHint: 'shard',
            hashData: trimmed,
            payload: shardFromBase64(shardPayload),
        };
    }

    return {
        type: 'challenge',
        modeHint: 'classic',
        hashData: trimmed,
        payload: challengeFromBase64(trimmed),
    };
}

function parseSolveDataFromURLDetailed() {
    var hash = window.location.hash;
    if (!hash || hash.length < 2) {
        return { type: '', payload: null, error: null, modeHint: null, hashData: '' };
    }
    if (hash.length - 1 > LIMITS.maxUrlHashChars) {
        return {
            type: '',
            payload: null,
            error: t('errors.link.too_long_use_json'),
            modeHint: hash.indexOf('#shard:') === 0 ? 'shard' : 'classic',
            hashData: '',
        };
    }
    try {
        return parseSolveHashData(hash.substring(1));
    } catch (e) {
        return {
            type: '',
            payload: null,
            error: e.message || t('errors.link.parse_failed'),
            modeHint: hash.indexOf('#shard:') === 0 ? 'shard' : 'classic',
            hashData: '',
        };
    }
}

function parseSolveHashFromLink(link) {
    var trimmed = String(link || '').trim();
    if (!trimmed) {
        throw new Error(t('errors.solve.link_no_data'));
    }

    if (/^#?shard:/i.test(trimmed)) {
        return parseSolveHashData(trimmed.replace(/^#/, ''));
    }

    var hashIndex = trimmed.indexOf('#');
    if (hashIndex !== -1 && hashIndex < trimmed.length - 1) {
        return parseSolveHashData(trimmed.substring(hashIndex + 1));
    }

    throw new Error(t('errors.solve.link_no_data'));
}

function parseShardInputText(rawText) {
    var text = String(rawText || '').trim();
    if (!text) {
        throw new Error(t('errors.shard.input.empty'));
    }

    if (text.length > LIMITS.maxShardTextChars) {
        throw new Error(t('errors.shard.input.too_large'));
    }

    if (text[0] === '{') {
        return validateShardData(JSON.parse(text));
    }

    if (text[0] === '[') {
        throw new Error(t('errors.shard.input.single_only'));
    }

    var parsed = parseSolveHashFromLink(text);
    if (parsed.type !== 'shard') {
        throw new Error(t('errors.shard.input.expect_single'));
    }
    return parsed.payload;
}

function parseShardLoadText(rawText) {
    var text = String(rawText || '').trim();
    if (!text) {
        throw new Error(t('errors.shard.input.empty'));
    }

    if (text.length > LIMITS.maxShardTextChars) {
        throw new Error(t('errors.shard.input.too_large'));
    }

    if (text[0] === '[') {
        return normalizeShardCollection(JSON.parse(text));
    }

    if (text[0] === '{') {
        return [validateShardData(JSON.parse(text))];
    }

    var parsed = parseSolveHashFromLink(text);
    if (parsed.type !== 'shard') {
        throw new Error(t('errors.shard.input.expect_single'));
    }
    return [parsed.payload];
}

// =====================================================================
// task.js — v4 任务入口（委托给共享协议核心）
// =====================================================================

async function generateChallenge(secret, questions, threshold, title, description, onProgress) {
    return await ShardKeyCore.generateChallenge(secret, questions, threshold, title, description, getCoreOptions({
        onProgress: function (msgKey, done, total) {
            if (typeof onProgress === 'function') {
                onProgress(t(msgKey), done, total);
            }
        },
    }));
}

async function recoverSecret(challenge, answers) {
    return await ShardKeyCore.recoverSecret(challenge, answers, getCoreOptions());
}

function validateChallengeData(challenge) {
    return ShardKeyCore.validateChallengeData(challenge, getCoreOptions());
}

function validateShardData(shard) {
    return ShardKeyCore.validateShardData(shard, getCoreOptions());
}

function normalizeShardCollection(value) {
    return ShardKeyCore.normalizeShardCollection(value, getCoreOptions());
}

async function generateShards(secret, totalShards, threshold, onProgress) {
    return await ShardKeyCore.generateShards(secret, totalShards, threshold, getCoreOptions({
        onProgress: function (msgKey, done, total) {
            if (typeof onProgress === 'function') {
                onProgress(t(msgKey), done, total);
            }
        },
    }));
}

async function recoverFromShards(shards) {
    return await ShardKeyCore.recoverFromShards(shards, getCoreOptions());
}
// =====================================================================
// main.js — 入口：模式切换、URL 检测、事件绑定
// =====================================================================

var appQuestions = [];
var currentAppMode = 'classic';
var currentChallenge = null;
var currentShardMergeState = null;
var questionIdCounter = 0;

var tabBtns = document.querySelectorAll('.tab-btn');
var panelCreate = document.getElementById('panel-create');
var panelSolve = document.getElementById('panel-solve');
var modeOptions = document.querySelectorAll('.mode-toggle-btn');
var createClassicContent = document.getElementById('create-classic-content');
var createShardContent = document.getElementById('create-shard-content');
var solveClassicMode = document.getElementById('solve-classic-mode');
var solveShardMode = document.getElementById('solve-shard-mode');

var runtimeWarningEl = document.getElementById('runtime-warning');

var secretInput = document.getElementById('secret-input');
var challengeTitleEl = document.getElementById('challenge-title');
var challengeDescEl = document.getElementById('challenge-desc');
var questionList = document.getElementById('question-list');
var btnAddQuestion = document.getElementById('btn-add-question');
var thresholdInput = document.getElementById('threshold-input');
var questionCountDisplay = document.getElementById('question-count-display');
var btnGenerate = document.getElementById('btn-generate');
var generateProgress = document.getElementById('generate-progress');
var progressFill = document.getElementById('progress-fill');
var progressText = document.getElementById('progress-text');
var generateResult = document.getElementById('generate-result');
var shardSecretInput = document.getElementById('shard-secret-input');
var shardTotalInput = document.getElementById('shard-total');
var shardThresholdInput = document.getElementById('shard-threshold');
var btnGenerateShards = document.getElementById('btn-generate-shards');
var shardGenerateProgress = document.getElementById('shard-generate-progress');
var shardProgressFill = document.getElementById('shard-progress-fill');
var shardProgressText = document.getElementById('shard-progress-text');
var shardGenerateResult = document.getElementById('shard-generate-result');

var solveLoadCard = document.getElementById('solve-load-card');
var solveContent = document.getElementById('solve-content');
var solveTitleEl = document.getElementById('solve-title');
var solveDescEl = document.getElementById('solve-desc');
var solveMetaEl = document.getElementById('solve-meta');
var solveQuestionsEl = document.getElementById('solve-questions');
var btnSolve = document.getElementById('btn-solve');
var solveResultEl = document.getElementById('solve-result');
var fileImport = document.getElementById('file-import');
var btnPasteLink = document.getElementById('btn-paste-link');
var pasteLinkArea = document.getElementById('paste-link-area');
var pasteLinkInput = document.getElementById('paste-link-input');
var btnLoadLink = document.getElementById('btn-load-link');
var btnChangeChallenge = document.getElementById('btn-change-challenge');
var shardFileImport = document.getElementById('shard-file-import');
var btnPasteShard = document.getElementById('btn-paste-shard');
var pasteShardArea = document.getElementById('paste-shard-area');
var pasteShardInput = document.getElementById('paste-shard-input');
var btnLoadShard = document.getElementById('btn-load-shard');
var solveShardLoadCard = document.getElementById('solve-shard-load-card');
var solveShardLoadError = document.getElementById('solve-shard-load-error');
var shardMergeCard = document.getElementById('shard-merge-card');
var shardMergeMeta = document.getElementById('shard-merge-meta');
var shardMergeHint = document.getElementById('shard-merge-hint');
var shardMergeInputs = document.getElementById('shard-merge-inputs');
var btnAddShardInput = document.getElementById('btn-add-shard-input');
var btnMergeShards = document.getElementById('btn-merge-shards');
var btnChangeShardSet = document.getElementById('btn-change-shard-set');
var shardMergeResult = document.getElementById('shard-merge-result');
var langSwitcher = document.getElementById('lang-switcher');
var langTrigger = document.getElementById('lang-trigger');
var langMenu = document.getElementById('lang-menu');
var langOptions = langSwitcher ? langSwitcher.querySelectorAll('.lang-option') : [];
var lastGeneratedState = null;
var lastGeneratedShardState = null;
var currentChallengeSource = '';
var currentShardSource = '';
var lastSolveOutcome = null;
var lastShardMergeOutcome = null;

function switchTab(tabName) {
    tabBtns.forEach(function (btn) {
        var isActive = btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    if (panelCreate) {
        var isCreate = tabName === 'create';
        panelCreate.classList.toggle('active', isCreate);
        panelCreate.hidden = !isCreate;
    }
    if (panelSolve) {
        var isSolve = tabName === 'solve';
        panelSolve.classList.toggle('active', isSolve);
        panelSolve.hidden = !isSolve;
    }
}

tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    btn.addEventListener('keydown', function (event) {
        var currentIndex = Array.prototype.indexOf.call(tabBtns, btn);
        var nextIndex = currentIndex;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabBtns.length;
        if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabBtns.length) % tabBtns.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabBtns.length - 1;
        if (nextIndex !== currentIndex) {
            event.preventDefault();
            tabBtns[nextIndex].focus();
            switchTab(tabBtns[nextIndex].dataset.tab);
        }
    });
});

modeOptions.forEach(function (option) {
    option.addEventListener('click', function () {
        setAppMode(option.dataset.mode);
    });
});

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
}

function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var key = el.getAttribute('data-i18n');
        if (!key) return;
        el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
        var key2 = el.getAttribute('data-i18n-placeholder');
        if (!key2) return;
        el.setAttribute('placeholder', t(key2));
    });
}

function syncLangSelect() {
    if (!langSwitcher) return;
    var current = (i18n && typeof i18n.getLang === 'function') ? i18n.getLang() : '';
    langOptions.forEach(function (btn) {
        var isActive = btn.dataset.lang === current;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
}

function setLangMenuOpen(open) {
    if (!langSwitcher) return;
    langSwitcher.classList.toggle('open', !!open);
    if (langTrigger) {
        langTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
}

function setAppMode(mode) {
    if (mode !== 'classic' && mode !== 'shard') {
        mode = 'classic';
    }
    currentAppMode = mode;

    modeOptions.forEach(function (option) {
        var isActive = option.dataset.mode === mode;
        option.classList.toggle('active', isActive);
        option.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (createClassicContent) {
        createClassicContent.classList.toggle('hidden', mode !== 'classic');
    }
    if (createShardContent) {
        createShardContent.classList.toggle('hidden', mode !== 'shard');
    }
    if (solveClassicMode) {
        solveClassicMode.classList.toggle('hidden', mode !== 'classic');
    }
    if (solveShardMode) {
        solveShardMode.classList.toggle('hidden', mode !== 'shard');
    }
}

function rerenderAll() {
    snapshotShardMergeInputState();
    applyStaticI18n();
    checkRuntimeSupport();
    setAppMode(currentAppMode);
    renderQuestions();
    if (lastGeneratedState) {
        renderGenerateResult(lastGeneratedState);
    }
    if (lastGeneratedShardState) {
        renderShardGenerateResult(lastGeneratedShardState);
    }
    if (currentChallenge) {
        renderSolveChallenge(currentChallenge, true);
    }
    if (btnSolve && btnSolve.disabled) {
        btnSolve.textContent = t('solve.solving');
    }
    if (currentShardMergeState) {
        renderShardMergeUI(true);
    }
    if (btnMergeShards && btnMergeShards.disabled) {
        btnMergeShards.textContent = t('solve.shard.merge.loading');
    }
}

function setRuntimeWarning(messageHtml) {
    if (!runtimeWarningEl) return;
    if (!messageHtml) {
        runtimeWarningEl.classList.add('hidden');
        runtimeWarningEl.innerHTML = '';
        return;
    }
    runtimeWarningEl.classList.remove('hidden');
    runtimeWarningEl.innerHTML = messageHtml;
}

function checkRuntimeSupport() {
    var missing = [];
    var webCrypto = window.crypto;
    var subtle = webCrypto && webCrypto.subtle;
    if (typeof TextEncoder === 'undefined' || typeof TextDecoder === 'undefined') missing.push('TextEncoder/TextDecoder');
    if (!webCrypto || typeof webCrypto.getRandomValues !== 'function') missing.push('crypto.getRandomValues');
    if (!subtle) {
        missing.push('crypto.subtle (all)');
    } else {
        ['digest', 'importKey', 'deriveBits', 'encrypt', 'decrypt'].forEach(function (method) {
            if (typeof subtle[method] !== 'function') missing.push('crypto.subtle.' + method);
        });
    }

    if (missing.length === 0) {
        setRuntimeWarning('');
        return;
    }

    setRuntimeWarning(
        '<div class="result-box warning">' +
            '<div class="result-label">' + escapeHtml(t('runtime.not_supported.title')) + '</div>' +
            '<p style="font-size: 0.9em; color: var(--text-secondary);">' +
                escapeHtml(t('runtime.not_supported.missing', { missing: missing.join(', ') })) +
                ' ' +
                escapeHtml(t('runtime.not_supported.before_example')) +
                '<code>python3 -m http.server 8000</code>' +
                escapeHtml(t('runtime.not_supported.after_example')) +
            '</p>' +
        '</div>'
    );
}

function initI18nUI() {
    syncLangSelect();
    if (langTrigger) {
        langTrigger.addEventListener('click', function (event) {
            event.preventDefault();
            setLangMenuOpen(!langSwitcher.classList.contains('open'));
        });
    }
    if (langOptions.length && i18n && typeof i18n.setLang === 'function') {
        langOptions.forEach(function (btn) {
            btn.addEventListener('click', function () {
                i18n.setLang(btn.dataset.lang);
                setLangMenuOpen(false);
                if (langTrigger) langTrigger.focus();
            });
        });
    }
    document.addEventListener('click', function (event) {
        if (!langSwitcher || langSwitcher.contains(event.target)) return;
        setLangMenuOpen(false);
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            setLangMenuOpen(false);
        }
    });
    if (i18n && typeof i18n.onChange === 'function') {
        i18n.onChange(function () {
            syncLangSelect();
            rerenderAll();
        });
    }
    rerenderAll();
}

async function copyFromTextarea(textarea) {
    try {
        textarea.focus();
        textarea.select();
    } catch (e) {
        // ignore
    }

    var text = textarea.value;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            // fall through to legacy copy
        }
    }

    try {
        if (document.execCommand && document.execCommand('copy')) {
            return true;
        }
    } catch (e) {
        // ignore
    }

    return false;
}

function showSolveLoadError(msg) {
    var el = document.getElementById('solve-load-error');
    if (!el) return;
    if (!msg) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    el.classList.remove('hidden');
    el.innerHTML =
        '<div class="result-box error">' +
            '<div class="result-label">' + escapeHtml(t('ui.load_failed.title')) + '</div>' +
            '<p>' + escapeHtml(msg) + '</p>' +
        '</div>';
}

function setSolveLoadedState(loaded) {
    solveLoadCard.classList.toggle('hidden', loaded);
    solveContent.classList.toggle('hidden', !loaded);
}

function resetSolveState(clearError) {
    currentChallenge = null;
    currentChallengeSource = '';
    lastSolveOutcome = null;

    solveTitleEl.textContent = '';
    solveDescEl.textContent = '';
    solveMetaEl.textContent = '';
    solveQuestionsEl.innerHTML = '';
    solveResultEl.classList.add('hidden');
    solveResultEl.innerHTML = '';

    btnSolve.disabled = false;
    btnSolve.textContent = t('solve.unlock');

    pasteLinkArea.classList.add('hidden');
    pasteLinkInput.value = '';

    if (clearError) {
        showSolveLoadError('');
    }

    setSolveLoadedState(false);
}

function replaceLocationHash(hashValue) {
    var baseURL = window.location.href.split('#')[0];
    var nextURL = hashValue ? (baseURL + '#' + hashValue) : baseURL;

    if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, document.title, nextURL);
        return;
    }

    if (hashValue) {
        window.location.hash = hashValue;
    } else if (window.location.hash) {
        window.location.hash = '';
    }
}

function showShardLoadError(msg) {
    if (!solveShardLoadError) return;
    if (!msg) {
        solveShardLoadError.classList.add('hidden');
        solveShardLoadError.innerHTML = '';
        return;
    }
    solveShardLoadError.classList.remove('hidden');
    solveShardLoadError.innerHTML =
        '<div class="result-box error">' +
            '<div class="result-label">' + escapeHtml(t('ui.load_failed.title')) + '</div>' +
            '<p>' + escapeHtml(msg) + '</p>' +
        '</div>';
}

function snapshotShardMergeInputState() {
    if (!currentShardMergeState || !shardMergeInputs) return;
    currentShardMergeState.inputs = Array.prototype.map.call(
        shardMergeInputs.querySelectorAll('.shard-merge-data'),
        function (input) {
            return {
                value: input.value,
                readOnly: !!input.readOnly,
            };
        }
    );
}

function setShardLoadedState(loaded) {
    if (solveShardLoadCard) {
        solveShardLoadCard.classList.toggle('hidden', loaded);
    }
    if (shardMergeCard) {
        shardMergeCard.classList.toggle('hidden', !loaded);
    }
}

function resetShardSolveState(clearError) {
    currentShardMergeState = null;
    currentShardSource = '';
    lastShardMergeOutcome = null;

    if (shardMergeMeta) shardMergeMeta.textContent = '';
    if (shardMergeInputs) shardMergeInputs.innerHTML = '';
    if (shardMergeResult) {
        shardMergeResult.classList.add('hidden');
        shardMergeResult.innerHTML = '';
    }
    if (btnMergeShards) {
        btnMergeShards.disabled = false;
        btnMergeShards.textContent = t('solve.shard.merge.submit');
    }
    if (pasteShardArea) pasteShardArea.classList.add('hidden');
    if (pasteShardInput) pasteShardInput.value = '';

    if (clearError) {
        showShardLoadError('');
    }

    setShardLoadedState(false);
}

function buildShardInputStateFromShards(shards, lockPrefilled) {
    var inputs = shards.map(function (shard, index) {
        return {
            value: JSON.stringify(shard, null, 2),
            readOnly: !!lockPrefilled && index === 0,
        };
    });
    var threshold = shards[0] ? shards[0].threshold : 3;
    while (inputs.length < threshold) {
        inputs.push({ value: '', readOnly: false });
    }
    return inputs;
}

function renderShardMergeResult(outcome) {
    if (!outcome || !shardMergeResult) {
        if (shardMergeResult) {
            shardMergeResult.classList.add('hidden');
            shardMergeResult.innerHTML = '';
        }
        return;
    }
    shardMergeResult.classList.remove('hidden');

    if (outcome.success) {
        shardMergeResult.innerHTML =
            '<div class="result-box success shard-success-glow">' +
                '<div class="result-label">' + escapeHtml(t('solve.shard.merge.success_title')) + '</div>' +
                '<div class="result-value">' + escapeHtml(outcome.secret) + '</div>' +
                '<p class="shard-merge-intro">' +
                    escapeHtml(t('solve.shard.merge.success_detail', { used: outcome.usedCount || 0, threshold: outcome.threshold || 0 })) +
                '</p>' +
            '</div>';
        return;
    }

    shardMergeResult.innerHTML =
        '<div class="result-box error">' +
            '<div class="result-label">' + escapeHtml(outcome.isError ? t('ui.error.title') : t('solve.shard.merge.failed_title')) + '</div>' +
            '<p>' + escapeHtml(outcome.error || '') + '</p>' +
        '</div>';
}

function renderShardMergeUI(preserveValues) {
    if (!currentShardMergeState || !shardMergeInputs) return;

    if (preserveValues) {
        snapshotShardMergeInputState();
    }

    var state = currentShardMergeState;
    var inputs = Array.isArray(state.inputs) ? state.inputs.slice() : [];
    var targetCount = Math.max(state.threshold, inputs.length || 0);
    while (inputs.length < targetCount) {
        inputs.push({ value: '', readOnly: false });
    }
    state.inputs = inputs;

    shardMergeMeta.textContent = t('solve.shard.merge.meta', {
        threshold: state.threshold,
        total: state.totalShards,
        id: state.challengeId.slice(0, 8),
    });
    if (shardMergeHint) {
        shardMergeHint.textContent = t('solve.shard.merge.hint', { threshold: state.threshold });
    }

    shardMergeInputs.innerHTML = '';
    state.inputs.forEach(function (entry, index) {
        var wrapper = document.createElement('div');
        wrapper.className = 'shard-merge-input';
        wrapper.innerHTML =
            '<label>' +
                '<span>' + escapeHtml(t('solve.shard.merge.input_label', { n: index + 1 })) + '</span>' +
                (entry.readOnly ? '<span class="input-note">' + escapeHtml(t('solve.shard.merge.input_locked')) + '</span>' : '') +
            '</label>' +
            '<textarea class="shard-merge-data" data-index="' + index + '" placeholder="' + escapeHtml(t('solve.shard.merge.input_placeholder')) + '"' + (entry.readOnly ? ' readonly' : '') + '>' + escapeHtml(entry.value || '') + '</textarea>';
        shardMergeInputs.appendChild(wrapper);
    });

    if (!shardMergeResult.classList.contains('hidden') && lastShardMergeOutcome) {
        renderShardMergeResult(lastShardMergeOutcome);
    }

    setShardLoadedState(true);
}

function addQuestion(text, answer, hint) {
    text = text || '';
    hint = hint || '';
    var id = questionIdCounter++;
    var answers = [];
    if (Array.isArray(answer)) {
        answers = answer.length > 0 ? answer : [''];
    } else {
        answers = [answer || ''];
    }
    appQuestions.push({ id: id, question: text, answers: answers, hint: hint });
    renderQuestions();
    return id;
}

function removeQuestion(id) {
    appQuestions = appQuestions.filter(function (q) { return q.id !== id; });
    renderQuestions();
}

function parseDataId(value) {
    return Number.parseInt(value, 10);
}

function getQuestionById(id) {
    return appQuestions.find(function (q) { return q.id === id; });
}

function renderQuestions() {
    questionList.innerHTML = '';
    appQuestions.forEach(function (q, index) {
        var div = document.createElement('div');
        div.className = 'question-item';

        var answersHtml = '';
        q.answers.forEach(function (ans, ansIdx) {
            var answerPlaceholder = q.answers.length > 1
                ? t('create.answer.placeholder_indexed', { n: ansIdx + 1 })
                : t('create.answer.placeholder_single');
            var removeAnsBtn = q.answers.length > 1
                ? '<button class="btn-remove-answer" data-id="' + q.id + '" data-aidx="' + ansIdx + '">' + escapeHtml(t('create.answer.delete')) + '</button>'
                : '';
            answersHtml +=
                '<div class="answer-row">' +
                    '<input type="text" class="q-answer" data-id="' + q.id + '" data-aidx="' + ansIdx + '" value="' + escapeHtml(ans) + '" placeholder="' + escapeHtml(answerPlaceholder) + '">' +
                    removeAnsBtn +
                '</div>';
        });

        div.innerHTML =
            '<div class="question-header">' +
                '<span class="question-number">' + escapeHtml(t('create.question.number', { n: index + 1 })) + '</span>' +
                '<button class="btn-remove" data-id="' + q.id + '">' + escapeHtml(t('create.question.delete')) + '</button>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>' + escapeHtml(t('create.question.text.label')) + '</label>' +
                '<input type="text" class="q-text" data-id="' + q.id + '" value="' + escapeHtml(q.question) + '" placeholder="' + escapeHtml(t('create.question.text.placeholder')) + '">' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group answers-group">' +
                    '<label>' + escapeHtml(t('create.answers.label')) + '</label>' +
                    '<div class="answers-list">' + answersHtml + '</div>' +
                    '<button class="btn-add-answer btn btn-secondary" data-id="' + q.id + '">' + escapeHtml(t('create.answers.add_alt')) + '</button>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>' + escapeHtml(t('create.hint.label')) + '</label>' +
                    '<input type="text" class="q-hint" data-id="' + q.id + '" value="' + escapeHtml(q.hint) + '" placeholder="' + escapeHtml(t('create.hint.placeholder')) + '">' +
                '</div>' +
            '</div>';
        questionList.appendChild(div);
    });

    questionCountDisplay.value = appQuestions.length;
}

btnAddQuestion.addEventListener('click', function () { addQuestion(); });

questionList.addEventListener('click', function (e) {
    var removeBtn = e.target.closest('.btn-remove');
    if (removeBtn) {
        var id = parseDataId(removeBtn.dataset.id);
        if (!Number.isNaN(id)) {
            removeQuestion(id);
        }
        return;
    }

    var addAnsBtn = e.target.closest('.btn-add-answer');
    if (addAnsBtn) {
        var qid = parseDataId(addAnsBtn.dataset.id);
        var q = getQuestionById(qid);
        if (q && q.answers.length < 16) {
            q.answers.push('');
            renderQuestions();
        }
        return;
    }

    var removeAnsBtn = e.target.closest('.btn-remove-answer');
    if (removeAnsBtn) {
        var qid2 = parseDataId(removeAnsBtn.dataset.id);
        var aidx = Number.parseInt(removeAnsBtn.dataset.aidx, 10);
        var q2 = getQuestionById(qid2);
        if (q2 && q2.answers.length > 1 && aidx >= 0 && aidx < q2.answers.length) {
            q2.answers.splice(aidx, 1);
            renderQuestions();
        }
        return;
    }
});

questionList.addEventListener('input', function (e) {
    var target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.id) return;

    var id = parseDataId(target.dataset.id);
    if (Number.isNaN(id)) return;
    var q = getQuestionById(id);
    if (!q) return;

    if (target.classList.contains('q-text')) {
        q.question = target.value;
    } else if (target.classList.contains('q-answer')) {
        var aidx = Number.parseInt(target.dataset.aidx, 10);
        if (!Number.isNaN(aidx) && aidx >= 0 && aidx < q.answers.length) {
            q.answers[aidx] = target.value;
        }
    } else if (target.classList.contains('q-hint')) {
        q.hint = target.value;
    }
});

addQuestion();
addQuestion();
addQuestion();

initI18nUI();

btnGenerateShards.addEventListener('click', async function () {
    lastGeneratedShardState = null;
    var secret = shardSecretInput.value.trim();
    if (!secret) {
        showShardGenerateError(t('errors.shard.secret_empty'));
        return;
    }

    var totalShards = Number.parseInt(shardTotalInput.value, 10);
    var threshold = Number.parseInt(shardThresholdInput.value, 10);

    if (Number.isNaN(totalShards) || totalShards < 2 || totalShards > LIMITS.maxShardCount) {
        showShardGenerateError(t('errors.shard.total_invalid', { max: LIMITS.maxShardCount }));
        return;
    }
    if (Number.isNaN(threshold) || threshold < 2) {
        showShardGenerateError(t('errors.shard.threshold_invalid'));
        return;
    }
    if (threshold > totalShards) {
        showShardGenerateError(t('errors.shard.threshold_gt_total'));
        return;
    }

    btnGenerateShards.disabled = true;
    shardGenerateProgress.classList.remove('hidden');
    shardGenerateResult.classList.add('hidden');

    try {
        var shards = await runWorkerTask(
            'generate-shards',
            {
                secret: secret,
                totalShards: totalShards,
                threshold: threshold,
            },
            function (msg, done, total) {
                var pct = total > 0 ? Math.round((done / total) * 100) : 0;
                shardProgressFill.style.width = pct + '%';
                shardProgressText.textContent = msg + ' (' + done + '/' + total + ')';
            }
        );

        lastGeneratedShardState = {
            shards: shards,
            totalShards: totalShards,
            threshold: threshold,
        };
        renderShardGenerateResult(lastGeneratedShardState);
    } catch (e) {
        showShardGenerateError(e.message || t('errors.shard.generate_failed'));
    } finally {
        btnGenerateShards.disabled = false;
        shardGenerateProgress.classList.add('hidden');
    }
});

btnGenerate.addEventListener('click', async function () {
    lastGeneratedState = null;
    var secret = secretInput.value.trim();
    if (!secret) {
        showGenerateError(t('validation.secret.required'));
        return;
    }
    try {
        var secretBytes = new TextEncoder().encode(secret);
        if (secretBytes.length > LIMITS.maxSecretBytes) {
            showGenerateError(t('validation.secret.too_long', { max: LIMITS.maxSecretBytes }));
            return;
        }
    } catch (e) {
        showGenerateError(t('validation.secret.encode_failed'));
        return;
    }

    var validQuestions = appQuestions.filter(function (q) {
        return q.question.trim() && q.answers.some(function (a) { return a.trim(); });
    });
    if (validQuestions.length < 2) {
        showGenerateError(t('validation.questions.min2'));
        return;
    }
    if (validQuestions.length > LIMITS.maxQuestions) {
        showGenerateError(t('validation.questions.too_many', { max: LIMITS.maxQuestions }));
        return;
    }
    var titleCandidate = challengeTitleEl.value.trim();
    var descCandidate = challengeDescEl.value.trim();
    if (titleCandidate.length > LIMITS.maxTitleChars) {
        showGenerateError(t('validation.title.too_long', { max: LIMITS.maxTitleChars }));
        return;
    }
    if (descCandidate.length > LIMITS.maxDescChars) {
        showGenerateError(t('validation.desc.too_long', { max: LIMITS.maxDescChars }));
        return;
    }
    for (var qi = 0; qi < validQuestions.length; qi++) {
        if (validQuestions[qi].question.length > LIMITS.maxQuestionTextChars) {
            showGenerateError(t('validation.question.text_too_long', { n: qi + 1, max: LIMITS.maxQuestionTextChars }));
            return;
        }
        if ((validQuestions[qi].hint || '').length > LIMITS.maxHintChars) {
            showGenerateError(t('validation.question.hint_too_long', { n: qi + 1, max: LIMITS.maxHintChars }));
            return;
        }
    }

    var threshold = Number.parseInt(thresholdInput.value, 10);
    if (isNaN(threshold) || threshold < 2) {
        showGenerateError(t('validation.threshold.min2'));
        return;
    }
    if (threshold > LIMITS.maxThreshold) {
        showGenerateError(t('validation.threshold.too_large', { max: LIMITS.maxThreshold }));
        return;
    }
    if (threshold > validQuestions.length) {
        showGenerateError(t('validation.threshold.gt_questions', { threshold: threshold, count: validQuestions.length }));
        return;
    }

    btnGenerate.disabled = true;
    generateProgress.classList.remove('hidden');
    generateResult.classList.add('hidden');

    var preparedQuestions = validQuestions.map(function (q) {
        var nonEmpty = q.answers.filter(function (a) { return a.trim(); });
        var seen = new Set();
        var unique = [];
        for (var ai = 0; ai < nonEmpty.length; ai++) {
            var norm = ShardKeyCore.normalizeAnswer(nonEmpty[ai]);
            if (!seen.has(norm)) {
                seen.add(norm);
                unique.push(nonEmpty[ai]);
            }
        }
        return { question: q.question, answers: unique, hint: q.hint };
    });

    try {
        var challenge = await runWorkerTask(
            'generate',
            {
                secret: secret,
                questions: preparedQuestions,
                threshold: threshold,
                title: titleCandidate || undefined,
                description: descCandidate || undefined,
            },
            function (msg, done, total) {
                var pct = total > 0 ? Math.round((done / total) * 100) : 0;
                progressFill.style.width = pct + '%';
                progressText.textContent = msg + ' (' + done + '/' + total + ')';
            }
        );

        var url = challengeToURL(challenge);
        var hashLen = 0;
        var hashPos = url.indexOf('#');
        if (hashPos >= 0) {
            hashLen = url.length - hashPos - 1;
        }
        var urlDisabled = hashLen > LIMITS.maxUrlHashChars;
        lastGeneratedState = {
            challenge: challenge,
            url: url,
            hashLen: hashLen,
            urlLen: url.length,
            urlDisabled: urlDisabled,
            threshold: threshold,
        };
        renderGenerateResult(lastGeneratedState);

    } catch (e) {
        showGenerateError(e.message);
    } finally {
        btnGenerate.disabled = false;
        generateProgress.classList.add('hidden');
    }
});

function showGenerateError(msg) {
    generateResult.classList.remove('hidden');
    generateResult.innerHTML =
        '<div class="result-box error">' +
            '<div class="result-label">' + escapeHtml(t('ui.error.title')) + '</div>' +
            '<p>' + escapeHtml(msg) + '</p>' +
        '</div>';
}

function renderGenerateResult(state) {
    if (!state) return;

    state.url = challengeToURL(state.challenge);
    state.urlLen = state.url.length;
    var hashPos = state.url.indexOf('#');
    state.hashLen = hashPos >= 0 ? (state.url.length - hashPos - 1) : 0;
    state.urlDisabled = state.hashLen > LIMITS.maxUrlHashChars;

    var urlHint = '';
    if (state.urlDisabled) {
        urlHint =
            '<div class="form-hint" style="margin-top: 10px; color: var(--warning);">' +
                escapeHtml(t('generate.hint.hash_too_long', { hashLen: state.hashLen })) +
            '</div>';
    } else if (state.urlLen > 2000) {
        urlHint =
            '<div class="form-hint" style="margin-top: 10px; color: var(--warning);">' +
                escapeHtml(t('generate.hint.url_too_long', { urlLen: state.urlLen })) +
            '</div>';
    }

    var linkHtml = state.urlDisabled
        ? ''
        : '<textarea class="share-link" readonly id="share-link-output">' + escapeHtml(state.url) + '</textarea>';

    var shareIntroText = state.urlDisabled
        ? t('generate.share_intro.large', { threshold: state.threshold })
        : t('generate.share_intro.link', { threshold: state.threshold });

    var buttonsHtml = state.urlDisabled
        ? '<div class="btn-group">' +
            '<button class="btn btn-secondary" id="btn-download-json">' + escapeHtml(t('generate.download_json')) + '</button>' +
          '</div>'
        : '<div class="btn-group">' +
            '<button class="btn btn-primary" id="btn-copy-link">' + escapeHtml(t('generate.copy_link')) + '</button>' +
            '<button class="btn btn-secondary" id="btn-download-json">' + escapeHtml(t('generate.download_json')) + '</button>' +
          '</div>';

    generateResult.classList.remove('hidden');
    generateResult.innerHTML =
        '<div class="result-box success">' +
            '<div class="result-label">' + escapeHtml(t('generate.success.title')) + '</div>' +
            '<p style="margin-bottom: 12px; font-size: 0.9em; color: var(--text-secondary);">' +
                escapeHtml(shareIntroText) +
            '</p>' +
            linkHtml +
            urlHint +
            buttonsHtml +
        '</div>';

    var btnDownload = document.getElementById('btn-download-json');
    if (btnDownload) {
        btnDownload.addEventListener('click', function () {
            challengeToFile(state.challenge, (challengeTitleEl.value.trim() || 'challenge') + '.json');
        });
    }

    if (!state.urlDisabled) {
        var btnCopy = document.getElementById('btn-copy-link');
        if (btnCopy) {
            btnCopy.addEventListener('click', function () {
                var textarea = document.getElementById('share-link-output');
                var btn = document.getElementById('btn-copy-link');
                copyFromTextarea(textarea).then(function (ok) {
                    btn.textContent = ok ? t('generate.copied') : t('generate.copy_failed');
                    setTimeout(function () { btn.textContent = t('generate.copy_link'); }, 2000);
                });
            });
        }
    }
}

function showShardGenerateError(msg) {
    shardGenerateResult.classList.remove('hidden');
    shardGenerateResult.innerHTML =
        '<div class="result-box error">' +
            '<div class="result-label">' + escapeHtml(t('ui.error.title')) + '</div>' +
            '<p>' + escapeHtml(msg) + '</p>' +
        '</div>';
}

function renderShardGenerateResult(state) {
    if (!state) return;

    var itemsHtml = '';
    state.shards.forEach(function (shard, index) {
        var url = shardToURL(shard);
        itemsHtml +=
            '<div class="shard-link-item">' +
                '<div class="shard-link-head">' +
                    '<span class="shard-label">' + escapeHtml(t('create.shard.result.item_label', { n: index + 1 })) + '</span>' +
                    '<button class="btn btn-secondary btn-copy-shard" data-index="' + index + '">' + escapeHtml(t('create.shard.result.copy')) + '</button>' +
                '</div>' +
                '<textarea class="share-link shard-share-link" readonly id="shard-link-' + index + '">' + escapeHtml(url) + '</textarea>' +
            '</div>';
    });

    shardGenerateResult.classList.remove('hidden');
    shardGenerateResult.innerHTML =
        '<div class="result-box success">' +
            '<div class="result-label">' + escapeHtml(t('create.shard.result.title')) + '</div>' +
            '<p style="margin-bottom: 12px; font-size: 0.9em; color: var(--text-secondary);">' +
                escapeHtml(t('create.shard.result.summary', { total: state.totalShards, threshold: state.threshold })) +
            '</p>' +
            '<div class="shard-link-list">' + itemsHtml + '</div>' +
            '<div class="btn-group">' +
                '<button class="btn btn-secondary" id="btn-download-shards-json">' + escapeHtml(t('create.shard.result.download')) + '</button>' +
            '</div>' +
        '</div>';

    shardGenerateResult.querySelectorAll('.btn-copy-shard').forEach(function (button) {
        button.addEventListener('click', function () {
            var index = Number.parseInt(button.dataset.index, 10);
            var textarea = document.getElementById('shard-link-' + index);
            copyFromTextarea(textarea).then(function (ok) {
                button.textContent = ok ? t('create.shard.result.copied') : t('generate.copy_failed');
                setTimeout(function () {
                    button.textContent = t('create.shard.result.copy');
                }, 2000);
            });
        });
    });

    var btnDownloadShards = document.getElementById('btn-download-shards-json');
    if (btnDownloadShards) {
        btnDownloadShards.addEventListener('click', function () {
            challengeToFile(state.shards, 'shards.json');
        });
    }
}

function loadShardCollection(shards, lockPrefilled) {
    var normalized = normalizeShardCollection(shards);
    currentShardMergeState = {
        challengeId: normalized[0].challengeId,
        threshold: normalized[0].threshold,
        totalShards: normalized[0].totalShards,
        inputs: buildShardInputStateFromShards(normalized, lockPrefilled),
    };
    lastShardMergeOutcome = null;
    showShardLoadError('');
    renderShardMergeUI(false);
    switchTab('solve');
    return true;
}

function loadShardCollectionFromSource(shards, options) {
    options = options || {};
    try {
        setAppMode('shard');
        loadShardCollection(shards, !!options.lockPrefilled);
        currentShardSource = options.source || 'loaded';
        if (options.hashData !== undefined) {
            replaceLocationHash(options.hashData);
        } else if (options.clearHash) {
            replaceLocationHash('');
        }
        return true;
    } catch (e) {
        resetShardSolveState(false);
        showShardLoadError(e.message || t('errors.shard.load_failed'));
        switchTab('solve');
        return false;
    }
}

function loadChallenge(challenge) {
    try {
        var normalized = validateChallengeData(challenge);
        setAppMode('classic');
        currentChallenge = normalized;
        currentChallengeSource = 'loaded';
        lastSolveOutcome = null;
        showSolveLoadError('');
        renderSolveChallenge(normalized, false);

        setSolveLoadedState(true);
        solveResultEl.classList.add('hidden');
        solveResultEl.innerHTML = '';

        switchTab('solve');
        return true;
    } catch (e) {
        showSolveLoadError(e.message || t('errors.solve.load_failed'));
        return false;
    }
}

function loadChallengeFromSource(challenge, options) {
    options = options || {};

    if (!loadChallenge(challenge)) {
        return false;
    }

    currentChallengeSource = options.source || 'loaded';

    if (options.hashData !== undefined) {
        replaceLocationHash(options.hashData);
    } else if (options.clearHash) {
        replaceLocationHash('');
    }

    return true;
}

function renderSolveChallenge(normalized, preserveAnswers) {
    if (!normalized) return;

    solveTitleEl.textContent = normalized.title || t('defaults.challenge_title');
    solveDescEl.textContent = normalized.description || '';

    var dateText = t('solve.meta.unknown_date');
    if (normalized.createdAt) {
        var createdAtDate = new Date(normalized.createdAt);
        if (!isNaN(createdAtDate.getTime())) {
            dateText = createdAtDate.toLocaleDateString(getLocaleForIntl());
        }
    }
    solveMetaEl.textContent = t('solve.meta.format', {
        threshold: normalized.threshold,
        total: normalized.questions.length,
        date: dateText,
    });

    var existingAnswers = {};
    if (preserveAnswers) {
        solveQuestionsEl.querySelectorAll('.solve-answer').forEach(function (input) {
            var qid = Number.parseInt(input.dataset.qid, 10);
            if (!Number.isNaN(qid)) existingAnswers[qid] = input.value;
        });
    }

    solveQuestionsEl.innerHTML = '';
    normalized.questions.forEach(function (q, i) {
        var div = document.createElement('div');
        div.className = 'solve-question';
        div.innerHTML =
            '<label>' + escapeHtml(t('solve.question.prefix', { n: i + 1 })) + escapeHtml(q.text) + '</label>' +
            (q.hint ? '<div class="hint">' + escapeHtml(t('solve.hint.prefix')) + escapeHtml(q.hint) + '</div>' : '') +
            '<input type="text" class="solve-answer" data-qid="' + q.id + '" placeholder="' + escapeHtml(t('solve.answer.placeholder')) + '">';
        solveQuestionsEl.appendChild(div);

        if (preserveAnswers && Object.prototype.hasOwnProperty.call(existingAnswers, q.id)) {
            var inputEl = div.querySelector('.solve-answer');
            if (inputEl) inputEl.value = existingAnswers[q.id];
        }
    });

    if (!solveResultEl.classList.contains('hidden') && lastSolveOutcome) {
        renderSolveResult(lastSolveOutcome);
    }
}

function renderSolveResult(outcome) {
    if (!outcome) return;
    solveResultEl.classList.remove('hidden');
    if (outcome.success) {
        solveResultEl.innerHTML =
            '<div class="result-box success">' +
                '<div class="result-label">' + escapeHtml(t('solve.unlocked.title')) + '</div>' +
                '<div class="result-value">' + escapeHtml(outcome.secret) + '</div>' +
                '<p style="margin-top: 8px; font-size: 0.82em; color: var(--text-secondary);">' +
                    escapeHtml(t('solve.unlocked.detail', { answered: outcome.answeredCount, used: outcome.usedCount || outcome.answeredCount })) +
                '</p>' +
            '</div>';
        return;
    }

    var label = outcome.isError ? t('ui.error.title') : t('solve.failed.title');
    solveResultEl.innerHTML =
        '<div class="result-box error">' +
            '<div class="result-label">' + escapeHtml(label) + '</div>' +
            '<p>' + escapeHtml(outcome.error || '') + '</p>' +
        '</div>';
}

fileImport.addEventListener('change', async function (e) {
    var file = e.target.files[0];
    if (!file) return;
    try {
        var challenge = await challengeFromFile(file);
        loadChallengeFromSource(challenge, { clearHash: true, source: 'file' });
    } catch (err) {
        resetSolveState(false);
        showSolveLoadError(t('errors.solve.file_read_failed', { msg: err.message || t('errors.solve.unknown_error') }));
        switchTab('solve');
    }
    fileImport.value = '';
});

btnPasteLink.addEventListener('click', function () {
    pasteLinkArea.classList.toggle('hidden');
});

btnLoadLink.addEventListener('click', function () {
    var link = pasteLinkInput.value.trim();
    if (!link) return;
    try {
        var parsed = parseSolveHashFromLink(link);
        if (parsed.type !== 'challenge') {
            throw new Error(t('errors.link.parse_failed'));
        }
        loadChallengeFromSource(parsed.payload, { hashData: parsed.hashData, source: 'pasted-link' });
    } catch (e) {
        resetSolveState(false);
        showSolveLoadError(e.message || t('errors.link.parse_failed'));
        switchTab('solve');
    }
});

shardFileImport.addEventListener('change', async function (e) {
    var file = e.target.files[0];
    if (!file) return;
    try {
        var loaded = await challengeFromFile(file);
        var shards = Array.isArray(loaded) ? normalizeShardCollection(loaded) : [validateShardData(loaded)];
        loadShardCollectionFromSource(shards, {
            clearHash: true,
            source: Array.isArray(loaded) ? 'shard-file-collection' : 'shard-file',
            lockPrefilled: !Array.isArray(loaded),
        });
    } catch (err) {
        resetShardSolveState(false);
        showShardLoadError(err.message || t('errors.shard.load_failed'));
        switchTab('solve');
    }
    shardFileImport.value = '';
});

btnPasteShard.addEventListener('click', function () {
    pasteShardArea.classList.toggle('hidden');
});

btnLoadShard.addEventListener('click', function () {
    var rawText = pasteShardInput.value.trim();
    if (!rawText) return;
    try {
        var shards = parseShardLoadText(rawText);
        loadShardCollectionFromSource(shards, {
            source: shards.length > 1 ? 'pasted-shard-collection' : 'pasted-shard',
            clearHash: shards.length > 1,
            hashData: shards.length === 1 ? ('shard:' + shardToBase64(shards[0])) : undefined,
            lockPrefilled: shards.length === 1,
        });
    } catch (e) {
        resetShardSolveState(false);
        showShardLoadError(e.message || t('errors.shard.load_failed'));
        switchTab('solve');
    }
});

btnChangeChallenge.addEventListener('click', function () {
    if (currentChallengeSource === 'url-hash' || currentChallengeSource === 'pasted-link') {
        replaceLocationHash('');
    }
    resetSolveState(true);
    switchTab('solve');
});

btnSolve.addEventListener('click', async function () {
    if (!currentChallenge) return;

    var answers = {};
    solveQuestionsEl.querySelectorAll('.solve-answer').forEach(function (input) {
        var rawVal = typeof input.value === 'string' ? input.value : String(input.value || '');
        var val = rawVal.trim();
        if (val) {
            answers[Number.parseInt(input.dataset.qid, 10)] = val;
        }
    });

    btnSolve.disabled = true;
    btnSolve.textContent = t('solve.solving');

    try {
        var result = await runWorkerTask('recover', {
            challenge: currentChallenge,
            answers: answers,
        });

        lastSolveOutcome = result;
        renderSolveResult(result);
    } catch (e) {
        lastSolveOutcome = { success: false, isError: true, error: e.message || '' };
        renderSolveResult(lastSolveOutcome);
    } finally {
        btnSolve.disabled = false;
        btnSolve.textContent = t('solve.unlock');
    }
});

btnAddShardInput.addEventListener('click', function () {
    if (!currentShardMergeState) return;
    snapshotShardMergeInputState();
    currentShardMergeState.inputs.push({ value: '', readOnly: false });
    renderShardMergeUI(false);
});

btnChangeShardSet.addEventListener('click', function () {
    if (currentShardSource === 'url-hash' || currentShardSource === 'pasted-shard') {
        replaceLocationHash('');
    }
    resetShardSolveState(true);
    switchTab('solve');
});

btnMergeShards.addEventListener('click', async function () {
    if (!currentShardMergeState) return;

    snapshotShardMergeInputState();
    var shards = [];
    try {
        for (var i = 0; i < currentShardMergeState.inputs.length; i++) {
            var rawText = String(currentShardMergeState.inputs[i].value || '').trim();
            if (!rawText) continue;
            shards.push(parseShardInputText(rawText));
        }
    } catch (e) {
        lastShardMergeOutcome = { success: false, isError: true, error: e.message || '' };
        renderShardMergeResult(lastShardMergeOutcome);
        return;
    }

    btnMergeShards.disabled = true;
    btnMergeShards.textContent = t('solve.shard.merge.loading');

    try {
        var secret = await runWorkerTask('recover-shards', { shards: shards });
        lastShardMergeOutcome = {
            success: true,
            secret: secret,
            usedCount: shards.length,
            threshold: currentShardMergeState ? currentShardMergeState.threshold : 0,
        };
        renderShardMergeResult(lastShardMergeOutcome);
    } catch (e) {
        lastShardMergeOutcome = { success: false, isError: true, error: e.message || '' };
        renderShardMergeResult(lastShardMergeOutcome);
    } finally {
        btnMergeShards.disabled = false;
        btnMergeShards.textContent = t('solve.shard.merge.submit');
    }
});

function checkURLChallenge() {
    var parsed = parseSolveDataFromURLDetailed();
    if (parsed.type === 'challenge' && parsed.payload) {
        loadChallengeFromSource(parsed.payload, { source: 'url-hash' });
        return;
    }
    if (parsed.type === 'shard' && parsed.payload) {
        loadShardCollectionFromSource([parsed.payload], {
            source: 'url-hash',
            hashData: parsed.hashData,
            lockPrefilled: true,
        });
        return;
    }
    resetSolveState(!parsed.error);
    resetShardSolveState(!parsed.error);
    if (parsed.error && parsed.modeHint === 'shard') {
        setAppMode('shard');
        showShardLoadError(parsed.error);
    } else if (parsed.error) {
        setAppMode('classic');
        showSolveLoadError(parsed.error);
    }
}

window.addEventListener('hashchange', checkURLChallenge);
checkURLChallenge();

})();
