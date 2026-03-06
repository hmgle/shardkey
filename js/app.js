// app.js — 秘密共享工具（合并版，兼容 file:// 协议）
// 合并自：crt.js, crypto.js, encoding.js, creator.js, solver.js, main.js

(function () {
'use strict';

var i18n = (typeof window !== 'undefined' && window.ShardKeyI18n) ? window.ShardKeyI18n : null;
function t(key, params) {
    if (i18n && typeof i18n.t === 'function') return i18n.t(key, params);
    var out = String(key);
    if (params && typeof params === 'object') {
        Object.keys(params).forEach(function (k) {
            out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), String(params[k]));
        });
    }
    return out;
}
function getLocaleForIntl() {
    if (i18n && typeof i18n.getLocaleForIntl === 'function') return i18n.getLocaleForIntl();
    return 'zh-CN';
}

// =====================================================================
// limits.js — 安全稳健的输入边界
// =====================================================================

var LIMITS = {
    maxQuestions: 64,
    maxThreshold: 64,
    maxSecretBytes: 1024,
    maxUrlHashChars: 20000,
    maxChallengeFileBytes: 250000,
    maxTitleChars: 120,
    maxDescChars: 800,
    maxQuestionTextChars: 400,
    maxHintChars: 300,
    maxBigIntDigits: 1400,
    maxBase64UrlChars: 30000,
};

// =====================================================================
// crt.js — 核心数学模块（纯 BigInt 运算）
// =====================================================================

function gcd(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) {
        [a, b] = [b, a % b];
    }
    return a;
}

function extendedGcd(a, b) {
    if (b === 0n) {
        return { gcd: a, x: 1n, y: 0n };
    }
    const result = extendedGcd(b, a % b);
    return {
        gcd: result.gcd,
        x: result.y,
        y: result.x - (a / b) * result.y,
    };
}

function modPow(base, exp, mod) {
    if (mod === 1n) return 0n;
    base = ((base % mod) + mod) % mod;
    let result = 1n;
    while (exp > 0n) {
        if (exp & 1n) {
            result = (result * base) % mod;
        }
        exp >>= 1n;
        base = (base * base) % mod;
    }
    return result;
}

function solveCRT(remainders, moduli) {
    const k = remainders.length;
    if (k === 0) throw new Error(t('errors.crt.min_pairs'));
    if (k !== moduli.length) throw new Error(t('errors.crt.length_mismatch'));

    let M = 1n;
    for (let i = 0; i < k; i++) {
        M *= moduli[i];
    }

    let x = 0n;
    for (let i = 0; i < k; i++) {
        const Mi = M / moduli[i];
        const { y: yi } = extendedGcd(moduli[i], Mi);
        x = (x + Mi * yi * remainders[i]) % M;
    }

    return ((x % M) + M) % M;
}

// =====================================================================
// crypto.js — 密码学模块（SHA-256、素数生成、答案归一化）
// =====================================================================

function normalizeAnswer(text) {
    text = String(text || '');
    if (typeof text.normalize === 'function') {
        text = text.normalize('NFKC');
    }
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
    return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function sha256Bytes(data) {
    let buffer;
    if (typeof data === 'string') {
        buffer = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
        buffer = data;
    } else {
        buffer = new Uint8Array(data);
    }
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return new Uint8Array(hashBuffer);
}

function getSecureRandomBigInt(bits) {
    const bytes = Math.ceil(bits / 8);
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    const excessBits = bytes * 8 - bits;
    if (excessBits > 0) {
        arr[0] &= (1 << (8 - excessBits)) - 1;
    }
    let hex = '';
    for (const b of arr) {
        hex += b.toString(16).padStart(2, '0');
    }
    return BigInt('0x0' + hex);
}

function getSecureRandomBigIntInRange(min, max) {
    if (max < min) throw new Error(t('errors.random.invalid_range'));
    if (max === min) return min;

    const span = max - min + 1n;
    const bits = span.toString(2).length;
    let candidate;
    do {
        candidate = getSecureRandomBigInt(bits);
    } while (candidate >= span);
    return min + candidate;
}

function getSecureRandomBytes(byteLength) {
    const arr = new Uint8Array(byteLength);
    crypto.getRandomValues(arr);
    return arr;
}

function yieldToUI() {
    return new Promise(function (resolve) {
        setTimeout(resolve, 0);
    });
}

function millerRabin(n, rounds) {
    if (rounds === undefined) rounds = 20;
    if (n < 2n) return false;
    if (n === 2n || n === 3n) return true;
    if (n % 2n === 0n) return false;

    let r = 0n;
    let d = n - 1n;
    while (d % 2n === 0n) {
        d /= 2n;
        r++;
    }

    const smallPrimes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

    for (let i = 0; i < rounds; i++) {
        let a;
        if (i < smallPrimes.length && smallPrimes[i] < n - 2n) {
            a = smallPrimes[i];
        } else {
            const bits = n.toString(2).length;
            do {
                a = getSecureRandomBigInt(bits);
            } while (a < 2n || a >= n - 2n);
        }

        let x = modPow(a, d, n);

        if (x === 1n || x === n - 1n) continue;

        let composite = true;
        for (let j = 1n; j < r; j++) {
            x = modPow(x, 2n, n);
            if (x === n - 1n) {
                composite = false;
                break;
            }
        }

        if (composite) return false;
    }

    return true;
}

async function generatePrime(bits) {
    let attempts = 0;
    while (true) {
        let candidate = getSecureRandomBigInt(bits);
        candidate |= (1n << BigInt(bits - 1));
        candidate |= 1n;
        if (millerRabin(candidate)) {
            return candidate;
        }
        attempts++;
        if (attempts % 32 === 0) {
            await yieldToUI();
        }
    }
}

async function generateModuli(count, bitSize, onProgress) {
    const moduli = [];
    for (let i = 0; i < count; i++) {
        let prime;
        do {
            prime = await generatePrime(bitSize);
        } while (moduli.some(function (m) { return m === prime; }));
        moduli.push(prime);
        if (onProgress) onProgress(i + 1, count);
        await yieldToUI();
    }
    return moduli;
}

async function deriveAnswerKeyMaterialPBKDF2(answer, saltBytes, iterations, dkLenBytes) {
    const normalized = normalizeAnswer(answer);
    const inputBytes = new TextEncoder().encode(normalized);
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        inputBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: iterations },
        keyMaterial,
        dkLenBytes * 8
    );

    const keyBytes = new Uint8Array(derivedBits);
    return {
        keyBytes: keyBytes,
        keyBigInt: bytesToBigInt(keyBytes),
    };
}

async function deriveAnswerKeyBigIntPBKDF2(answer, saltBytes, iterations, dkLenBytes) {
    const material = await deriveAnswerKeyMaterialPBKDF2(answer, saltBytes, iterations, dkLenBytes);
    return material.keyBigInt;
}

async function computeAnswerVerificationTag(keyBytes, saltBytes, modulusBigInt, xorValueBigInt) {
    const tagInput = [
        'shardkey-answer-tag-v1',
        bytesToBase64Url(keyBytes),
        bytesToBase64Url(saltBytes),
        modulusBigInt.toString(),
        xorValueBigInt.toString(),
    ].join('|');
    const tagBytes = (await sha256Bytes(tagInput)).slice(0, 16);
    return bytesToBase64Url(tagBytes);
}

// =====================================================================
// encoding.js — 编码模块
// =====================================================================

function bytesToBigInt(bytes) {
    if (!bytes || bytes.length === 0) return 0n;
    let hex = '';
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
    }
    return BigInt('0x' + hex);
}

function bigIntToBytes(n, byteLength) {
    if (byteLength === 0) return new Uint8Array(0);
    let hex = n.toString(16);
    hex = hex.padStart(byteLength * 2, '0');
    const bytes = new Uint8Array(byteLength);
    for (let i = 0; i < byteLength; i++) {
        bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function getSecretValueBase(byteLength) {
    if (byteLength <= 0) return 1n;
    return 1n << (8n * BigInt(byteLength));
}

function bytesToBase64Url(bytes) {
    let binary = '';
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }
    let base64 = btoa(binary);
    base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return base64;
}

function base64UrlToBytes(base64url) {
    if (typeof base64url !== 'string' || base64url.length === 0 || base64url.length > LIMITS.maxBase64UrlChars) {
        throw new Error(t('errors.base64url.invalid_field'));
    }
    if (!/^[0-9A-Za-z_-]+$/.test(base64url)) {
        throw new Error(t('errors.base64url.invalid_field'));
    }
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function encodeSecretPayloadV3(secretText) {
    const secretBytes = new TextEncoder().encode(secretText);
    if (secretBytes.length > LIMITS.maxSecretBytes) {
        throw new Error(t('errors.secret.too_long_bytes', { max: LIMITS.maxSecretBytes }));
    }

    const checksumBytes = (await sha256Bytes(secretBytes)).slice(0, 16);
    const payload = new Uint8Array(4 + 2 + secretBytes.length + checksumBytes.length);
    payload[0] = 0x53; // S
    payload[1] = 0x4b; // K
    payload[2] = 0x33; // 3
    payload[3] = 0x00;
    payload[4] = (secretBytes.length >> 8) & 0xff;
    payload[5] = secretBytes.length & 0xff;
    payload.set(secretBytes, 6);
    payload.set(checksumBytes, 6 + secretBytes.length);

    return {
        value: bytesToBigInt(payload),
        byteLength: payload.length,
        secretByteLength: secretBytes.length,
    };
}

async function decodeSecretPayloadV3(payloadBytes) {
    if (!(payloadBytes instanceof Uint8Array)) {
        throw new Error(t('errors.secret.payload.invalid_format'));
    }
    const minLen = 4 + 2 + 16;
    if (payloadBytes.length < minLen) {
        throw new Error(t('errors.secret.payload.length_invalid'));
    }
    if (payloadBytes[0] !== 0x53 || payloadBytes[1] !== 0x4b || payloadBytes[2] !== 0x33 || payloadBytes[3] !== 0x00) {
        throw new Error(t('errors.secret.payload.marker_invalid'));
    }
    const secretLen = (payloadBytes[4] << 8) | payloadBytes[5];
    const checksumLen = 16;
    const expectedLen = 4 + 2 + secretLen + checksumLen;
    if (expectedLen !== payloadBytes.length) {
        throw new Error(t('errors.secret.payload.length_mismatch'));
    }
    const secretBytes = payloadBytes.slice(6, 6 + secretLen);
    const checksumBytes = payloadBytes.slice(6 + secretLen);

    const computed = (await sha256Bytes(secretBytes)).slice(0, checksumLen);
    for (let i = 0; i < checksumLen; i++) {
        if (computed[i] !== checksumBytes[i]) {
            throw new Error(t('errors.secret.payload.checksum_failed'));
        }
    }

    const secretText = new TextDecoder().decode(secretBytes);
    return { secretText: secretText, secretByteLength: secretLen };
}

function challengeToBase64(obj) {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }
    let base64 = btoa(binary);
    base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return base64;
}

function challengeFromBase64(base64url) {
    if (typeof base64url !== 'string' || base64url.length === 0) {
        throw new Error(t('errors.link.invalid_data'));
    }
    if (base64url.length > LIMITS.maxUrlHashChars) {
        throw new Error(t('errors.link.too_long_use_json'));
    }
    if (!/^[0-9A-Za-z_-]+$/.test(base64url)) {
        throw new Error(t('errors.link.invalid_data'));
    }
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
}

function challengeToURL(obj) {
    const base64 = challengeToBase64(obj);
    let baseURL = window.location.href.split('#')[0];
    try {
        const url = new URL(baseURL);
        if (i18n && typeof i18n.getLang === 'function') {
            url.searchParams.set('lang', i18n.getLang());
            baseURL = url.toString();
        }
    } catch (e) {
        // ignore
    }
    return baseURL + '#' + base64;
}

function challengeFromURL() {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return null;
    try {
        if (hash.length - 1 > LIMITS.maxUrlHashChars) {
            return null;
        }
        return challengeFromBase64(hash.substring(1));
    } catch (e) {
        return null;
    }
}

function parseChallengeFromURLDetailed() {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return { challenge: null, error: null };
    if (hash.length - 1 > LIMITS.maxUrlHashChars) {
        return { challenge: null, error: t('errors.link.too_long_use_json') };
    }
    try {
        return { challenge: challengeFromBase64(hash.substring(1)), error: null };
    } catch (e) {
        return { challenge: null, error: e.message || t('errors.link.parse_failed') };
    }
}

function challengeToFile(obj, filename) {
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'challenge.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
        const reader = new FileReader();
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

// =====================================================================
// creator.js — 创建流程
// =====================================================================

function calculateModulusBitSize(secretBits, threshold) {
    const minBits = Math.ceil(Math.max(secretBits, 8) / threshold) + 20;
    return Math.max(minBits, 32);
}

function calculateMignotteBounds(moduli, threshold) {
    const sortedModuli = moduli.slice().sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    let alpha = 1n;
    for (let i = 0; i < threshold; i++) {
        alpha *= sortedModuli[i];
    }

    let beta = 1n;
    for (let i = sortedModuli.length - (threshold - 1); i < sortedModuli.length; i++) {
        beta *= sortedModuli[i];
    }

    return { alpha: alpha, beta: beta };
}

function chooseEncodedSecret(rawSecretValue, byteLength, alpha, beta) {
    const base = getSecretValueBase(byteLength);
    const upper = alpha - 1n;
    if (upper < rawSecretValue) {
        throw new Error(t('errors.secret.too_large_for_threshold'));
    }

    let kMin = 0n;
    if (beta >= rawSecretValue) {
        kMin = ((beta - rawSecretValue) / base) + 1n;
    }
    const kMax = (upper - rawSecretValue) / base;
    if (kMax < kMin) {
        throw new Error(t('errors.secret.cannot_construct_interval'));
    }

    const k = getSecureRandomBigIntInRange(kMin, kMax);
    return rawSecretValue + k * base;
}

function decodeRecoveredSecretValueV3(recovered, secretPayloadByteLength) {
    const base = getSecretValueBase(secretPayloadByteLength);
    const mod = recovered % base;
    return mod < 0n ? mod + base : mod;
}

async function generateChallenge(secret, questions, threshold, title, description, onProgress) {
    if (!secret) throw new Error(t('errors.secret.empty'));
    if (questions.length < threshold) {
        throw new Error(t('errors.questions.less_than_threshold', { count: questions.length, threshold: threshold }));
    }
    if (threshold < 2) throw new Error(t('errors.threshold.min2'));

    const payload = await encodeSecretPayloadV3(secret);
    const rawSecretValue = payload.value;
    const payloadByteLength = payload.byteLength;
    const secretByteLength = payload.secretByteLength;
    const secretBits = Math.max(1, payloadByteLength * 8);

    const modBits = calculateModulusBitSize(secretBits, threshold);

    let moduli = null;
    let alpha = 0n;
    let beta = 0n;
    let encodedSecret = null;
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const bitSizeForAttempt = modBits + attempt * 2;
        if (onProgress) onProgress(t('progress.generating_moduli'), 0, questions.length);
        moduli = await generateModuli(questions.length, bitSizeForAttempt, function (done, total) {
            if (onProgress) onProgress(t('progress.generating_moduli'), done, total);
        });

        const bounds = calculateMignotteBounds(moduli, threshold);
        alpha = bounds.alpha;
        beta = bounds.beta;
        if (alpha <= beta) {
            await yieldToUI();
            continue;
        }

        try {
            encodedSecret = chooseEncodedSecret(rawSecretValue, payloadByteLength, alpha, beta);
            break;
        } catch (e) {
            if (attempt === maxAttempts - 1) {
                throw e;
            }
            await yieldToUI();
        }
    }

    if (!moduli || encodedSecret === null) {
        throw new Error(t('errors.challenge.generate_failed'));
    }

    const kdf = {
        type: 'pbkdf2-sha256',
        hash: 'SHA-256',
        iterations: 120000,
        dkLen: 32,
        saltLen: 16,
    };

    if (onProgress) onProgress(t('progress.computing_xor_mask'), 0, questions.length);
    const questionEntries = [];
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const mi = moduli[i];
        const remainder = ((encodedSecret % mi) + mi) % mi;

        const answerOptions = Array.isArray(q.answers) ? q.answers : [q.answer];
        if (answerOptions.length === 0 || !answerOptions.some(function (a) { return String(a || '').trim(); })) {
            throw new Error(t('errors.question.missing_answer', { n: i + 1 }));
        }
        if (answerOptions.length > 16) {
            throw new Error(t('errors.question.too_many_answers', { n: i + 1, max: 16 }));
        }

        const saltBytes = getSecureRandomBytes(kdf.saltLen);

        const xorValues = [];
        const xorTags = [];
        for (const answerText of answerOptions) {
            if (!String(answerText || '').trim()) continue;
            const keyMaterial = await deriveAnswerKeyMaterialPBKDF2(answerText, saltBytes, kdf.iterations, kdf.dkLen);
            const keyMod = ((keyMaterial.keyBigInt % mi) + mi) % mi;
            const xorValue = keyMod ^ remainder;
            xorValues.push(xorValue.toString());
            xorTags.push(await computeAnswerVerificationTag(keyMaterial.keyBytes, saltBytes, mi, xorValue));
        }
        if (xorValues.length === 0) {
            throw new Error(t('errors.question.missing_answer', { n: i + 1 }));
        }

        questionEntries.push({
            id: i,
            text: q.question,
            hint: q.hint || '',
            modulus: mi.toString(),
            xorValue: xorValues[0],
            xorValues: xorValues,
            xorTags: xorTags,
            salt: bytesToBase64Url(saltBytes),
        });

        if (onProgress) onProgress(t('progress.computing_xor_mask'), i + 1, questions.length);
        if ((i + 1) % 4 === 0) {
            await yieldToUI();
        }
    }

    return {
        version: 3,
        secretEncoding: 'offset-payload-v3',
        title: title || t('defaults.challenge_title'),
        description: description || t('defaults.challenge_desc'),
        threshold: threshold,
        secretByteLength: secretByteLength,
        secretPayloadByteLength: payloadByteLength,
        kdf: kdf,
        questions: questionEntries,
        createdAt: new Date().toISOString(),
    };
}

// =====================================================================
// solver.js — 求解流程
// =====================================================================

function questionHasVerificationTags(question) {
    if (Array.isArray(question.xorTags) && Array.isArray(question.xorValuesBigInt)) {
        return question.xorTags.length > 0 && question.xorTags.length === question.xorValuesBigInt.length;
    }
    if (Array.isArray(question.variants) && question.variants.length > 0) {
        return question.variants.every(function (variant) { return typeof variant.tag === 'string' && variant.tag.length > 0; });
    }
    return false;
}

async function findVerifiedQuestionRemainder(question, userAnswer, kdf, modulusBigInt) {
    if (Array.isArray(question.xorTags) && Array.isArray(question.xorValuesBigInt) && question.xorTags.length === question.xorValuesBigInt.length && question.xorTags.length > 0) {
        const keyMaterial = await deriveAnswerKeyMaterialPBKDF2(userAnswer, question.saltBytes, kdf.iterations, kdf.dkLen);
        const keyMod = ((keyMaterial.keyBigInt % modulusBigInt) + modulusBigInt) % modulusBigInt;
        for (let i = 0; i < question.xorValuesBigInt.length; i++) {
            const xorVal = question.xorValuesBigInt[i];
            const expectedTag = await computeAnswerVerificationTag(keyMaterial.keyBytes, question.saltBytes, modulusBigInt, xorVal);
            if (expectedTag === question.xorTags[i]) {
                return keyMod ^ xorVal;
            }
        }
        return null;
    }

    if (Array.isArray(question.variants) && question.variants.length > 0 && question.variants.every(function (variant) { return typeof variant.tag === 'string' && variant.tag.length > 0; })) {
        for (const variant of question.variants) {
            const keyMaterial = await deriveAnswerKeyMaterialPBKDF2(userAnswer, variant.saltBytes, kdf.iterations, kdf.dkLen);
            const keyMod = ((keyMaterial.keyBigInt % modulusBigInt) + modulusBigInt) % modulusBigInt;
            const expectedTag = await computeAnswerVerificationTag(keyMaterial.keyBytes, variant.saltBytes, modulusBigInt, variant.xorValueBigInt);
            if (expectedTag === variant.tag) {
                return keyMod ^ variant.xorValueBigInt;
            }
        }
    }

    return null;
}

async function decodeRecoveredSecretFromRemainders(remainders, moduli, alpha, beta, secretPayloadByteLength, secretByteLength) {
    const recovered = solveCRT(remainders, moduli);
    if (recovered <= beta || recovered >= alpha) {
        return null;
    }
    const decodedValue = decodeRecoveredSecretValueV3(recovered, secretPayloadByteLength);
    const payloadBytes = bigIntToBytes(decodedValue, secretPayloadByteLength);
    try {
        const decoded = await decodeSecretPayloadV3(payloadBytes);
        if (decoded.secretByteLength !== secretByteLength) {
            return null;
        }
        return decoded.secretText;
    } catch (e) {
        return null;
    }
}

async function recoverSecret(challenge, answers) {
    challenge = validateChallengeData(challenge);

    const threshold = challenge.threshold;
    const secretByteLength = challenge.secretByteLength;
    const questions = challenge.questions;
    const secretPayloadByteLength = challenge.secretPayloadByteLength;
    const kdf = challenge.kdf;

    const answeredQuestions = questions.filter(function (q) {
        return answers[q.id] !== undefined && String(answers[q.id] || '').trim() !== '';
    });
    const answeredCount = answeredQuestions.length;

    if (answeredCount < threshold) {
        return {
            success: false,
            error: t('errors.solver.need_at_least', { threshold: threshold, answered: answeredCount }),
            answeredCount: answeredCount,
        };
    }

    const verifiedEntries = [];
    const fallbackEntries = [];

    for (const q of answeredQuestions) {
        const userAnswer = String(answers[q.id] || '');
        const mi = q.modulusBigInt || BigInt(q.modulus);
        const verifiedRemainder = await findVerifiedQuestionRemainder(q, userAnswer, kdf, mi);
        if (verifiedRemainder !== null) {
            verifiedEntries.push({ modulus: mi, remainder: verifiedRemainder });
            if (verifiedEntries.length % 8 === 0) {
                await yieldToUI();
            }
            continue;
        }

        if (questionHasVerificationTags(q)) {
            continue;
        }

        const candidates = [];
        const seen = new Set();

        if (Array.isArray(q.xorValuesBigInt) && q.xorValuesBigInt.length > 0) {
            const keyVal = await deriveAnswerKeyBigIntPBKDF2(userAnswer, q.saltBytes, kdf.iterations, kdf.dkLen);
            const keyMod = ((keyVal % mi) + mi) % mi;
            for (const xorVal of q.xorValuesBigInt) {
                const bi = keyMod ^ xorVal;
                const biKey = bi.toString();
                if (!seen.has(biKey)) {
                    seen.add(biKey);
                    candidates.push(bi);
                }
                if (candidates.length >= 16) break;
            }
        } else {
            const variants = Array.isArray(q.variants) && q.variants.length > 0
                ? q.variants
                : [{
                    xorValueBigInt: q.xorValueBigInt || BigInt(q.xorValue),
                    saltBytes: q.saltBytes,
                }];
            for (const v of variants) {
                const xorVal = v.xorValueBigInt || BigInt(v.xorValue);
                const saltBytes = v.saltBytes || base64UrlToBytes(String(v.salt || ''));
                const keyVal = await deriveAnswerKeyBigIntPBKDF2(userAnswer, saltBytes, kdf.iterations, kdf.dkLen);
                const keyMod = ((keyVal % mi) + mi) % mi;
                const bi = keyMod ^ xorVal;
                const biKey = bi.toString();
                if (!seen.has(biKey)) {
                    seen.add(biKey);
                    candidates.push(bi);
                }
                if (candidates.length >= 16) break;
            }
        }

        if (candidates.length === 0) {
            continue;
        }

        fallbackEntries.push({ modulus: mi, candidates: candidates });
        if (fallbackEntries.length % 8 === 0) {
            await yieldToUI();
        }
    }

    const allModuli = questions.map(function (q) { return q.modulusBigInt || BigInt(q.modulus); });
    const bounds = calculateMignotteBounds(allModuli, threshold);
    const alpha = bounds.alpha;
    const beta = bounds.beta;

    if (verifiedEntries.length >= threshold) {
        const solvedEntries = verifiedEntries.slice(0, threshold);
        const secretText = await decodeRecoveredSecretFromRemainders(
            solvedEntries.map(function (item) { return item.remainder; }),
            solvedEntries.map(function (item) { return item.modulus; }),
            alpha,
            beta,
            secretPayloadByteLength,
            secretByteLength
        );
        if (secretText !== null) {
            return { success: true, secret: secretText, answeredCount: answeredCount, usedCount: threshold };
        }
    }

    const needFallbackCount = threshold - verifiedEntries.length;
    if (needFallbackCount <= 0 || fallbackEntries.length < needFallbackCount) {
        return {
            success: false,
            error: t('errors.solver.verify_failed', { suffix: '' }),
            answeredCount: answeredCount,
            testedSubsets: 0,
            testedCombos: 0,
        };
    }

    const solveStartedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const maxSolveMs = 8000;
    function isOverSolveBudget() {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        return (now - solveStartedAt) > maxSolveMs;
    }

    async function trySubset(subsetIndices) {
        const subsetItems = verifiedEntries.concat(subsetIndices.map(function (idx) { return fallbackEntries[idx]; }))
            .map(function (item) {
                return item.candidates
                    ? { modulus: item.modulus, candidates: item.candidates }
                    : { modulus: item.modulus, candidates: [item.remainder] };
            })
            .sort(function (a, b) { return a.candidates.length - b.candidates.length; });

        const moduli = subsetItems.map(function (item) { return item.modulus; });
        const remainders = new Array(subsetItems.length);

        async function tryCandidates(pos) {
            if (testedCombos >= maxComboTries || isOverSolveBudget()) {
                truncated = true;
                if (!truncatedReason) truncatedReason = isOverSolveBudget() ? 'time' : 'limit';
                return null;
            }
            if (pos >= subsetItems.length) {
                testedCombos++;
                const secretText = await decodeRecoveredSecretFromRemainders(
                    remainders,
                    moduli,
                    alpha,
                    beta,
                    secretPayloadByteLength,
                    secretByteLength
                );
                if (testedCombos % 16 === 0) {
                    await yieldToUI();
                }
                return secretText;
            }

            const item = subsetItems[pos];
            for (const cand of item.candidates) {
                remainders[pos] = cand;
                const found = await tryCandidates(pos + 1);
                if (found !== null) return found;
                if (truncated) return null;
            }
            return null;
        }

        return await tryCandidates(0);
    }

    const maxSubsetTries = 4096;
    const maxComboTries = 8192;
    let testedSubsets = 0;
    let testedCombos = 0;
    let truncated = false;
    let truncatedReason = '';
    const indices = [];
    for (let i = 0; i < needFallbackCount; i++) {
        indices.push(i);
    }

    while (true) {
        if (isOverSolveBudget()) {
            truncated = true;
            truncatedReason = 'time';
            break;
        }
        testedSubsets++;
        try {
            const secretText = await trySubset(indices);
            if (secretText !== null) {
                return { success: true, secret: secretText, answeredCount: answeredCount, usedCount: threshold };
            }
        } catch (e) {
            // continue searching other fallback subsets
        }

        if (truncated || testedSubsets >= maxSubsetTries) {
            truncated = true;
            if (!truncatedReason) truncatedReason = 'limit';
            break;
        }

        let pivot = needFallbackCount - 1;
        while (pivot >= 0 && indices[pivot] === fallbackEntries.length - needFallbackCount + pivot) {
            pivot--;
        }
        if (pivot < 0) {
            break;
        }

        indices[pivot]++;
        for (let j = pivot + 1; j < needFallbackCount; j++) {
            indices[j] = indices[j - 1] + 1;
        }

        if (testedSubsets % 16 === 0) {
            await yieldToUI();
        }
    }

    const suffix = truncated
        ? (truncatedReason === 'time'
            ? t('errors.solver.timeout_suffix')
            : t('errors.solver.limit_suffix'))
        : '';
    return {
        success: false,
        error: t('errors.solver.verify_failed', { suffix: suffix }),
        answeredCount: answeredCount,
        testedSubsets: testedSubsets,
        testedCombos: testedCombos,
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateChallengeData(challenge) {
    if (!isPlainObject(challenge)) {
        throw new Error(t('errors.challenge.invalid_format'));
    }

    const version = Number(challenge.version);
    if (!Number.isInteger(version) || version !== 3) {
        throw new Error(t('errors.challenge.only_v3'));
    }
    if (challenge.secretEncoding !== 'offset-payload-v3') {
        throw new Error(t('errors.challenge.unsupported_secret_encoding'));
    }

    const threshold = Number(challenge.threshold);
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > LIMITS.maxThreshold) {
        throw new Error(t('errors.challenge.threshold_invalid_format'));
    }

    const secretByteLength = Number(challenge.secretByteLength);
    if (!Number.isInteger(secretByteLength) || secretByteLength < 0 || secretByteLength > LIMITS.maxSecretBytes) {
        throw new Error(t('errors.challenge.secret_length_field_invalid'));
    }

    const secretPayloadByteLength = Number(challenge.secretPayloadByteLength);
    if (!Number.isInteger(secretPayloadByteLength) || secretPayloadByteLength < 22 || secretPayloadByteLength > LIMITS.maxSecretBytes + 22) {
        throw new Error(t('errors.challenge.secret_payload_length_field_invalid'));
    }
    if (secretPayloadByteLength !== secretByteLength + 22) {
        throw new Error(t('errors.challenge.secret_payload_length_field_invalid'));
    }

    const expectedSecretBits = Math.max(1, secretPayloadByteLength * 8);
    const expectedModBits = calculateModulusBitSize(expectedSecretBits, threshold);
    const allowedModBits = expectedModBits + 256;

    if (!isPlainObject(challenge.kdf)) {
        throw new Error(t('errors.challenge.kdf_invalid'));
    }
    const kdfType = String(challenge.kdf.type || '');
    const kdfHash = String(challenge.kdf.hash || '');
    const kdfIterations = Number(challenge.kdf.iterations);
    const kdfDkLen = Number(challenge.kdf.dkLen);
    const kdfSaltLen = Number(challenge.kdf.saltLen);
    if (kdfType !== 'pbkdf2-sha256' || kdfHash !== 'SHA-256') {
        throw new Error(t('errors.challenge.kdf_invalid'));
    }
    if (!Number.isInteger(kdfIterations) || kdfIterations < 1000 || kdfIterations > 2000000) {
        throw new Error(t('errors.challenge.kdf_iterations_invalid'));
    }
    if (!Number.isInteger(kdfDkLen) || kdfDkLen < 16 || kdfDkLen > 64) {
        throw new Error(t('errors.challenge.kdf_dklen_invalid'));
    }
    if (!Number.isInteger(kdfSaltLen) || kdfSaltLen < 8 || kdfSaltLen > 32) {
        throw new Error(t('errors.challenge.kdf_saltlen_invalid'));
    }
    const kdf = { type: kdfType, hash: kdfHash, iterations: kdfIterations, dkLen: kdfDkLen, saltLen: kdfSaltLen };

    if (!Array.isArray(challenge.questions) || challenge.questions.length === 0 || challenge.questions.length > LIMITS.maxQuestions) {
        throw new Error(t('errors.challenge.questions_list_invalid'));
    }
    if (challenge.questions.length < threshold) {
        throw new Error(t('errors.challenge.question_count_below_threshold'));
    }

    const seenIds = new Set();
    const usedModuli = [];
    const normalizedQuestions = challenge.questions.map(function (q) {
        if (!isPlainObject(q)) {
            throw new Error(t('errors.challenge.question_field_invalid'));
        }

        const id = Number(q.id);
        if (!Number.isInteger(id) || id < 0) {
            throw new Error(t('errors.challenge.question_id_invalid'));
        }
        if (seenIds.has(id)) {
            throw new Error(t('errors.challenge.question_id_duplicate'));
        }
        seenIds.add(id);

        const text = typeof q.text === 'string' ? q.text : '';
        const hint = typeof q.hint === 'string' ? q.hint : '';
        if (text.length > LIMITS.maxQuestionTextChars) throw new Error(t('errors.challenge.question_text_too_long'));
        if (hint.length > LIMITS.maxHintChars) throw new Error(t('errors.challenge.question_hint_too_long'));

        const modulusStr = String(q.modulus || '');
        if (!/^\d+$/.test(modulusStr) || modulusStr.length > LIMITS.maxBigIntDigits) {
            throw new Error(t('errors.challenge.question_params_invalid_format'));
        }
        const modulusBigInt = BigInt(modulusStr);
        if (modulusBigInt <= 2n) {
            throw new Error(t('errors.challenge.question_params_invalid_value'));
        }
        const modulusBits = modulusBigInt.toString(2).length;
        if (modulusBits > allowedModBits) {
            throw new Error(t('errors.challenge.question_params_invalid_value'));
        }

        function parseQuestionTag(rawTag) {
            const tag = String(rawTag || '');
            if (!/^[0-9A-Za-z_-]{8,120}$/.test(tag)) {
                throw new Error(t('errors.challenge.question_tag_invalid'));
            }
            return tag;
        }

        function parseVariant(rawVariant) {
            if (!isPlainObject(rawVariant)) {
                throw new Error(t('errors.challenge.question_params_invalid_format'));
            }
            const xorValueStr = String(rawVariant.xorValue || '');
            if (!/^\d+$/.test(xorValueStr) || xorValueStr.length > LIMITS.maxBigIntDigits) {
                throw new Error(t('errors.challenge.question_params_invalid_format'));
            }
            const xorValueBigInt = BigInt(xorValueStr);
            if (xorValueBigInt < 0n) {
                throw new Error(t('errors.challenge.question_params_invalid_value'));
            }
            const xorBits = xorValueBigInt === 0n ? 1 : xorValueBigInt.toString(2).length;
            if (xorBits > modulusBits) {
                throw new Error(t('errors.challenge.question_params_invalid_value'));
            }
            const salt = String(rawVariant.salt || '');
            if (!/^[0-9A-Za-z_-]{8,200}$/.test(salt)) {
                throw new Error(t('errors.challenge.question_salt_invalid'));
            }
            const saltBytes = base64UrlToBytes(salt);
            if (saltBytes.length !== kdf.saltLen) {
                throw new Error(t('errors.challenge.question_salt_invalid'));
            }
            const tag = rawVariant.tag === undefined || rawVariant.tag === null || rawVariant.tag === ''
                ? null
                : parseQuestionTag(rawVariant.tag);
            return {
                xorValue: xorValueBigInt.toString(),
                xorValueBigInt: xorValueBigInt,
                salt: salt,
                saltBytes: saltBytes,
                tag: tag,
            };
        }

        let xorValuesBigInt = null;
        let xorValueBigInt = null;
        let xorTags = null;
        let salt = null;
        let saltBytes = null;
        let variants = [];

        if (Array.isArray(q.xorValues) && q.xorValues.length > 0) {
            if (q.xorValues.length > 16) {
                throw new Error(t('errors.challenge.too_many_variants', { max: 16 }));
            }
            const xorValueStrs = q.xorValues.map(function (v) { return String(v || ''); });
            for (const xvs of xorValueStrs) {
                if (!/^\d+$/.test(xvs) || xvs.length > LIMITS.maxBigIntDigits) {
                    throw new Error(t('errors.challenge.question_params_invalid_format'));
                }
            }
            xorValuesBigInt = xorValueStrs.map(function (s) { return BigInt(s); });
            for (const xvb of xorValuesBigInt) {
                if (xvb < 0n) {
                    throw new Error(t('errors.challenge.question_params_invalid_value'));
                }
                const xorBits = xvb === 0n ? 1 : xvb.toString(2).length;
                if (xorBits > modulusBits) {
                    throw new Error(t('errors.challenge.question_params_invalid_value'));
                }
            }
            xorValueBigInt = xorValuesBigInt[0];

            if (q.xorTags !== undefined) {
                if (!Array.isArray(q.xorTags) || q.xorTags.length !== q.xorValues.length) {
                    throw new Error(t('errors.challenge.question_tag_invalid'));
                }
                xorTags = q.xorTags.map(parseQuestionTag);
            }

            salt = String(q.salt || '');
            if (!/^[0-9A-Za-z_-]{8,200}$/.test(salt)) {
                throw new Error(t('errors.challenge.question_salt_invalid'));
            }
            saltBytes = base64UrlToBytes(salt);
            if (saltBytes.length !== kdf.saltLen) {
                throw new Error(t('errors.challenge.question_salt_invalid'));
            }
        } else if (Array.isArray(q.variants)) {
            if (q.variants.length === 0 || q.variants.length > 16) {
                throw new Error(t('errors.challenge.answer_variants_count_invalid'));
            }
            variants = q.variants.map(parseVariant);
            xorValueBigInt = variants[0].xorValueBigInt;
            salt = variants[0].salt;
            saltBytes = variants[0].saltBytes;
        } else {
            const primary = parseVariant({ xorValue: q.xorValue, salt: q.salt, tag: q.tag });
            variants = [primary];
            xorValueBigInt = primary.xorValueBigInt;
            salt = primary.salt;
            saltBytes = primary.saltBytes;
        }

        for (const prev of usedModuli) {
            if (gcd(prev, modulusBigInt) !== 1n) {
                throw new Error(t('errors.challenge.moduli_not_coprime'));
            }
        }
        usedModuli.push(modulusBigInt);

        return {
            id: id,
            text: text,
            hint: hint,
            modulus: modulusBigInt.toString(),
            modulusBigInt: modulusBigInt,
            xorValue: xorValueBigInt.toString(),
            xorValueBigInt: xorValueBigInt,
            xorValues: xorValuesBigInt ? xorValuesBigInt.map(function (v) { return v.toString(); }) : null,
            xorValuesBigInt: xorValuesBigInt,
            xorTags: xorTags,
            salt: salt,
            saltBytes: saltBytes,
            variants: variants,
        };
    });

    const title = typeof challenge.title === 'string' ? challenge.title : t('defaults.challenge_title');
    const description = typeof challenge.description === 'string' ? challenge.description : '';
    if (title.length > LIMITS.maxTitleChars) throw new Error(t('errors.challenge.title_too_long'));
    if (description.length > LIMITS.maxDescChars) throw new Error(t('errors.challenge.desc_too_long'));

    const allModuli = normalizedQuestions.map(function (q) { return q.modulusBigInt; });
    const bounds = calculateMignotteBounds(allModuli, threshold);
    if (bounds.alpha <= bounds.beta) {
        throw new Error(t('errors.challenge.params_invalid_moduli_bounds'));
    }

    return {
        version: version,
        secretEncoding: 'offset-payload-v3',
        title: title,
        description: description,
        threshold: threshold,
        secretByteLength: secretByteLength,
        secretPayloadByteLength: secretPayloadByteLength,
        kdf: kdf,
        questions: normalizedQuestions,
        createdAt: typeof challenge.createdAt === 'string' ? challenge.createdAt : '',
    };
}

// =====================================================================
// main.js — 入口：模式切换、URL 检测、事件绑定
// =====================================================================

var appQuestions = [];
var currentChallenge = null;
var questionIdCounter = 0;

var tabBtns = document.querySelectorAll('.tab-btn');
var panelCreate = document.getElementById('panel-create');
var panelSolve = document.getElementById('panel-solve');

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

function switchTab(tabName) {
    tabBtns.forEach(function (btn) { btn.classList.toggle('active', btn.dataset.tab === tabName); });
    panelCreate.classList.toggle('active', tabName === 'create');
    panelSolve.classList.toggle('active', tabName === 'solve');
}

tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
});

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

var langSelectEl = document.getElementById('lang-select');
var lastGeneratedState = null;
var currentChallengeSource = '';

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
    if (!langSelectEl) return;
    if (i18n && typeof i18n.getLang === 'function') {
        langSelectEl.value = i18n.getLang();
    }
    langSelectEl.setAttribute('aria-label', t('ui.language'));
}

function rerenderAll() {
    applyStaticI18n();
    checkRuntimeSupport();
    renderQuestions();
    if (lastGeneratedState) {
        renderGenerateResult(lastGeneratedState);
    }
    if (currentChallenge) {
        renderSolveChallenge(currentChallenge, true);
    }
    if (btnSolve && btnSolve.disabled) {
        btnSolve.textContent = t('solve.solving');
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
    if (typeof BigInt === 'undefined') missing.push('BigInt');
    if (typeof TextEncoder === 'undefined' || typeof TextDecoder === 'undefined') missing.push('TextEncoder/TextDecoder');
    if (!window.crypto || typeof crypto.getRandomValues !== 'function') missing.push('crypto.getRandomValues');
    if (!window.crypto || !crypto.subtle || typeof crypto.subtle.digest !== 'function') missing.push('crypto.subtle.digest');
    if (!window.crypto || !crypto.subtle || typeof crypto.subtle.importKey !== 'function') missing.push('crypto.subtle.importKey');
    if (!window.crypto || !crypto.subtle || typeof crypto.subtle.deriveBits !== 'function') missing.push('crypto.subtle.deriveBits');

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
    if (langSelectEl && i18n && typeof i18n.setLang === 'function') {
        langSelectEl.addEventListener('change', function () { i18n.setLang(langSelectEl.value); });
    }
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

function parseChallengeHashFromLink(link) {
    var trimmed = String(link || '').trim();
    if (!trimmed) {
        throw new Error(t('errors.solve.link_no_data'));
    }

    var hashIndex = trimmed.indexOf('#');
    if (hashIndex === -1 || hashIndex === trimmed.length - 1) {
        throw new Error(t('errors.solve.link_no_data'));
    }

    return trimmed.substring(hashIndex + 1);
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
            var norm = normalizeAnswer(nonEmpty[ai]);
            if (!seen.has(norm)) {
                seen.add(norm);
                unique.push(nonEmpty[ai]);
            }
        }
        return { question: q.question, answers: unique, hint: q.hint };
    });

    try {
        var challenge = await generateChallenge(
            secret, preparedQuestions, threshold,
            titleCandidate || undefined,
            descCandidate || undefined,
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

function loadChallenge(challenge) {
    try {
        const normalized = validateChallengeData(challenge);
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

var lastSolveOutcome = null;

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
        const createdAtDate = new Date(normalized.createdAt);
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
        var data = parseChallengeHashFromLink(link);
        var challenge = challengeFromBase64(data);
        loadChallengeFromSource(challenge, { hashData: data, source: 'pasted-link' });
    } catch (e) {
        resetSolveState(false);
        showSolveLoadError(e.message || t('errors.link.parse_failed'));
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
        var result = await recoverSecret(currentChallenge, answers);

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

function checkURLChallenge() {
    var parsed = parseChallengeFromURLDetailed();
    if (parsed.challenge) {
        loadChallengeFromSource(parsed.challenge, { source: 'url-hash' });
        return;
    }
    resetSolveState(!parsed.error);
    if (parsed.error) {
        showSolveLoadError(parsed.error);
    }
}

window.addEventListener('hashchange', checkURLChallenge);
checkURLChallenge();

})();
