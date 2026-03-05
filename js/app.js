// app.js — 秘密共享工具（合并版，兼容 file:// 协议）
// 合并自：crt.js, crypto.js, encoding.js, creator.js, solver.js, main.js

(function () {
'use strict';

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
    if (k === 0) throw new Error('至少需要一组余数和模数');
    if (k !== moduli.length) throw new Error('余数和模数数组长度不匹配');

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
    if (max < min) throw new Error('随机范围无效');
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

async function deriveAnswerKeyBigIntPBKDF2(answer, saltBytes, iterations, dkLenBytes) {
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
    return bytesToBigInt(keyBytes);
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
    if (typeof base64url !== 'string' || base64url.length === 0) {
        throw new Error('Base64Url 字段无效');
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
    if (secretBytes.length > 65535) {
        throw new Error('秘密过长（最多 65535 字节）');
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
        throw new Error('秘密载荷格式无效');
    }
    const minLen = 4 + 2 + 16;
    if (payloadBytes.length < minLen) {
        throw new Error('秘密载荷长度无效');
    }
    if (payloadBytes[0] !== 0x53 || payloadBytes[1] !== 0x4b || payloadBytes[2] !== 0x33 || payloadBytes[3] !== 0x00) {
        throw new Error('秘密载荷标记无效');
    }
    const secretLen = (payloadBytes[4] << 8) | payloadBytes[5];
    const checksumLen = 16;
    const expectedLen = 4 + 2 + secretLen + checksumLen;
    if (expectedLen !== payloadBytes.length) {
        throw new Error('秘密载荷长度不匹配');
    }
    const secretBytes = payloadBytes.slice(6, 6 + secretLen);
    const checksumBytes = payloadBytes.slice(6 + secretLen);

    const computed = (await sha256Bytes(secretBytes)).slice(0, checksumLen);
    for (let i = 0; i < checksumLen; i++) {
        if (computed[i] !== checksumBytes[i]) {
            throw new Error('秘密载荷校验失败');
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
    const baseURL = window.location.href.split('#')[0];
    return baseURL + '#' + base64;
}

function challengeFromURL() {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return null;
    try {
        return challengeFromBase64(hash.substring(1));
    } catch (e) {
        return null;
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
        const reader = new FileReader();
        reader.onload = function () {
            try {
                resolve(JSON.parse(reader.result));
            } catch (e) {
                reject(new Error('无效的挑战文件格式'));
            }
        };
        reader.onerror = function () { reject(new Error('读取文件失败')); };
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
        throw new Error('秘密过大，无法编码到当前门限区间。');
    }

    let kMin = 0n;
    if (beta >= rawSecretValue) {
        kMin = ((beta - rawSecretValue) / base) + 1n;
    }
    const kMax = (upper - rawSecretValue) / base;
    if (kMax < kMin) {
        throw new Error('无法为当前秘密构造安全门限区间。请提高门限值或减少问题数量。');
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
    if (!secret) throw new Error('秘密不能为空');
    if (questions.length < threshold) {
        throw new Error('问题数量 (' + questions.length + ') 不能少于门限值 (' + threshold + ')');
    }
    if (threshold < 2) throw new Error('门限值至少为 2');

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
        if (onProgress) onProgress('正在生成素数模数...', 0, questions.length);
        moduli = await generateModuli(questions.length, bitSizeForAttempt, function (done, total) {
            if (onProgress) onProgress('正在生成素数模数...', done, total);
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
        throw new Error('生成挑战失败，请重试。');
    }

    const kdf = {
        type: 'pbkdf2-sha256',
        hash: 'SHA-256',
        iterations: 120000,
        dkLen: 32,
        saltLen: 16,
    };

    if (onProgress) onProgress('正在计算 XOR 掩码...', 0, questions.length);
    const questionEntries = [];
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const mi = moduli[i];
        const remainder = ((encodedSecret % mi) + mi) % mi;
        const saltBytes = getSecureRandomBytes(kdf.saltLen);
        const keyVal = await deriveAnswerKeyBigIntPBKDF2(q.answer, saltBytes, kdf.iterations, kdf.dkLen);
        const keyMod = ((keyVal % mi) + mi) % mi;
        const xorValue = keyMod ^ remainder;

        questionEntries.push({
            id: i,
            text: q.question,
            hint: q.hint || '',
            modulus: mi.toString(),
            xorValue: xorValue.toString(),
            salt: bytesToBase64Url(saltBytes),
        });

        if (onProgress) onProgress('正在计算 XOR 掩码...', i + 1, questions.length);
        if ((i + 1) % 4 === 0) {
            await yieldToUI();
        }
    }

    return {
        version: 3,
        secretEncoding: 'offset-payload-v3',
        title: title || '秘密挑战',
        description: description || '回答问题来获取秘密！',
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

async function recoverSecret(challenge, answers) {
    challenge = validateChallengeData(challenge);

    const threshold = challenge.threshold;
    const secretByteLength = challenge.secretByteLength;
    const questions = challenge.questions;
    const secretPayloadByteLength = challenge.secretPayloadByteLength;
    const kdf = challenge.kdf;

    const answeredQuestions = questions.filter(function (q) {
        return answers[q.id] !== undefined && answers[q.id].trim() !== '';
    });
    const answeredCount = answeredQuestions.length;

    if (answeredCount < threshold) {
        return {
            success: false,
            error: '需要至少回答 ' + threshold + ' 个问题，当前只回答了 ' + answeredCount + ' 个。',
            answeredCount: answeredCount,
        };
    }

    const entries = [];

    for (const q of answeredQuestions) {
        const userAnswer = answers[q.id];
        const mi = q.modulusBigInt || BigInt(q.modulus);
        const xorVal = q.xorValueBigInt || BigInt(q.xorValue);
        const keyVal = await deriveAnswerKeyBigIntPBKDF2(userAnswer, q.saltBytes, kdf.iterations, kdf.dkLen);
        const keyMod = ((keyVal % mi) + mi) % mi;
        const bi = keyMod ^ xorVal;
        entries.push({ remainder: bi, modulus: mi });
        if (entries.length % 8 === 0) {
            await yieldToUI();
        }
    }

    const allModuli = questions.map(function (q) { return q.modulusBigInt || BigInt(q.modulus); });
    const bounds = calculateMignotteBounds(allModuli, threshold);
    const alpha = bounds.alpha;
    const beta = bounds.beta;

    async function trySubset(subsetIndices) {
        const remainders = [];
        const moduli = [];
        for (const idx of subsetIndices) {
            remainders.push(entries[idx].remainder);
            moduli.push(entries[idx].modulus);
        }
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

    const maxSubsetTries = 4096;
    let testedSubsets = 0;
    let truncated = false;

    if (entries.length === threshold) {
        try {
            testedSubsets = 1;
            const secretText = await trySubset(entries.map(function (_, i) { return i; }));
            if (secretText !== null) {
                return { success: true, secret: secretText, answeredCount: answeredCount, usedCount: threshold };
            }
        } catch (e) {
            return { success: false, error: '求解失败：' + e.message, answeredCount: answeredCount };
        }
    } else {
        const n = entries.length;
        const indices = [];
        for (let i = 0; i < threshold; i++) {
            indices.push(i);
        }

        while (true) {
            testedSubsets++;
            try {
                const secretText = await trySubset(indices);
                if (secretText !== null) {
                    return { success: true, secret: secretText, answeredCount: answeredCount, usedCount: threshold };
                }
            } catch (e) {
                // 单个子集失败时继续尝试其他组合
            }

            if (testedSubsets >= maxSubsetTries) {
                truncated = true;
                break;
            }

            let pivot = threshold - 1;
            while (pivot >= 0 && indices[pivot] === n - threshold + pivot) {
                pivot--;
            }
            if (pivot < 0) {
                break;
            }

            indices[pivot]++;
            for (let j = pivot + 1; j < threshold; j++) {
                indices[j] = indices[j - 1] + 1;
            }

            if (testedSubsets % 16 === 0) {
                await yieldToUI();
            }
        }
    }

    const suffix = truncated
        ? '（可尝试减少填写的答案数量后重试）'
        : '';
    return {
        success: false,
        error: '验证失败——部分答案可能不正确。请检查答案后重试。' + suffix,
        answeredCount: answeredCount,
        testedSubsets: testedSubsets,
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateChallengeData(challenge) {
    if (!isPlainObject(challenge)) {
        throw new Error('无效的挑战数据格式');
    }

    const version = Number(challenge.version);
    if (!Number.isInteger(version) || version !== 3) {
        throw new Error('仅支持 v3 挑战格式');
    }
    if (challenge.secretEncoding !== 'offset-payload-v3') {
        throw new Error('不支持的秘密编码格式');
    }

    const threshold = Number(challenge.threshold);
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > 128) {
        throw new Error('门限值格式无效');
    }

    const secretByteLength = Number(challenge.secretByteLength);
    if (!Number.isInteger(secretByteLength) || secretByteLength < 0 || secretByteLength > 65536) {
        throw new Error('秘密长度字段无效');
    }

    const secretPayloadByteLength = Number(challenge.secretPayloadByteLength);
    if (!Number.isInteger(secretPayloadByteLength) || secretPayloadByteLength < 22 || secretPayloadByteLength > 70000) {
        throw new Error('秘密载荷长度字段无效');
    }
    if (secretPayloadByteLength !== secretByteLength + 22) {
        throw new Error('秘密载荷长度字段无效');
    }

    if (!isPlainObject(challenge.kdf)) {
        throw new Error('KDF 参数无效');
    }
    const kdfType = String(challenge.kdf.type || '');
    const kdfHash = String(challenge.kdf.hash || '');
    const kdfIterations = Number(challenge.kdf.iterations);
    const kdfDkLen = Number(challenge.kdf.dkLen);
    const kdfSaltLen = Number(challenge.kdf.saltLen);
    if (kdfType !== 'pbkdf2-sha256' || kdfHash !== 'SHA-256') {
        throw new Error('KDF 参数无效');
    }
    if (!Number.isInteger(kdfIterations) || kdfIterations < 1000 || kdfIterations > 2000000) {
        throw new Error('KDF 迭代次数无效');
    }
    if (!Number.isInteger(kdfDkLen) || kdfDkLen < 16 || kdfDkLen > 64) {
        throw new Error('KDF 输出长度无效');
    }
    if (!Number.isInteger(kdfSaltLen) || kdfSaltLen < 8 || kdfSaltLen > 32) {
        throw new Error('KDF salt 长度无效');
    }
    const kdf = { type: kdfType, hash: kdfHash, iterations: kdfIterations, dkLen: kdfDkLen, saltLen: kdfSaltLen };

    if (!Array.isArray(challenge.questions) || challenge.questions.length === 0 || challenge.questions.length > 128) {
        throw new Error('题目列表格式无效');
    }
    if (challenge.questions.length < threshold) {
        throw new Error('题目数量少于门限值');
    }

    const seenIds = new Set();
    const usedModuli = [];
    const normalizedQuestions = challenge.questions.map(function (q) {
        if (!isPlainObject(q)) {
            throw new Error('题目字段格式无效');
        }

        const id = Number(q.id);
        if (!Number.isInteger(id) || id < 0) {
            throw new Error('题目 ID 无效');
        }
        if (seenIds.has(id)) {
            throw new Error('题目 ID 重复');
        }
        seenIds.add(id);

        const text = typeof q.text === 'string' ? q.text : '';
        const hint = typeof q.hint === 'string' ? q.hint : '';

        const modulusStr = String(q.modulus || '');
        const xorValueStr = String(q.xorValue || '');
        if (!/^\d{1,1200}$/.test(modulusStr) || !/^\d{1,1200}$/.test(xorValueStr)) {
            throw new Error('题目参数格式无效');
        }

        const modulusBigInt = BigInt(modulusStr);
        const xorValueBigInt = BigInt(xorValueStr);
        if (modulusBigInt <= 2n || xorValueBigInt < 0n) {
            throw new Error('题目参数取值无效');
        }

        const salt = String(q.salt || '');
        if (!/^[0-9A-Za-z_-]{8,200}$/.test(salt)) {
            throw new Error('题目 salt 无效');
        }
        const saltBytes = base64UrlToBytes(salt);
        if (saltBytes.length !== kdf.saltLen) {
            throw new Error('题目 salt 无效');
        }

        for (const prev of usedModuli) {
            if (gcd(prev, modulusBigInt) !== 1n) {
                throw new Error('模数不是两两互素');
            }
        }
        usedModuli.push(modulusBigInt);

        return {
            id: id,
            text: text,
            hint: hint,
            modulus: modulusBigInt.toString(),
            xorValue: xorValueBigInt.toString(),
            modulusBigInt: modulusBigInt,
            xorValueBigInt: xorValueBigInt,
            salt: salt,
            saltBytes: saltBytes,
        };
    });

    return {
        version: version,
        secretEncoding: 'offset-payload-v3',
        title: typeof challenge.title === 'string' ? challenge.title : '秘密挑战',
        description: typeof challenge.description === 'string' ? challenge.description : '',
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
            '<div class="result-label">运行环境不支持</div>' +
            '<p style="font-size: 0.9em; color: var(--text-secondary);">' +
                '当前浏览器缺少必要能力：' + escapeHtml(missing.join(', ')) + '。' +
                '建议使用最新版 Chrome / Edge / Firefox，并尽量通过本地静态服务打开（例如 <code>python3 -m http.server 8000</code>）。' +
            '</p>' +
        '</div>'
    );
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

function addQuestion(text, answer, hint) {
    text = text || '';
    answer = answer || '';
    hint = hint || '';
    var id = questionIdCounter++;
    appQuestions.push({ id: id, question: text, answer: answer, hint: hint });
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
        div.innerHTML =
            '<div class="question-header">' +
                '<span class="question-number">问题 ' + (index + 1) + '</span>' +
                '<button class="btn-remove" data-id="' + q.id + '">删除</button>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>问题内容</label>' +
                '<input type="text" class="q-text" data-id="' + q.id + '" value="' + escapeHtml(q.question) + '" placeholder="例如：我的猫叫什么名字？">' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label>正确答案</label>' +
                    '<input type="text" class="q-answer" data-id="' + q.id + '" value="' + escapeHtml(q.answer) + '" placeholder="答案（大小写不敏感）">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>提示（可选）</label>' +
                    '<input type="text" class="q-hint" data-id="' + q.id + '" value="' + escapeHtml(q.hint) + '" placeholder="给求解者的提示">' +
                '</div>' +
            '</div>';
        questionList.appendChild(div);
    });

    questionCountDisplay.value = appQuestions.length;
}

btnAddQuestion.addEventListener('click', function () { addQuestion(); });

questionList.addEventListener('click', function (e) {
    var removeBtn = e.target.closest('.btn-remove');
    if (!removeBtn) return;
    var id = parseDataId(removeBtn.dataset.id);
    if (!Number.isNaN(id)) {
        removeQuestion(id);
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
        q.answer = target.value;
    } else if (target.classList.contains('q-hint')) {
        q.hint = target.value;
    }
});

addQuestion();
addQuestion();
addQuestion();

checkRuntimeSupport();

btnGenerate.addEventListener('click', async function () {
    var secret = secretInput.value.trim();
    if (!secret) {
        showGenerateError('请输入要分享的秘密。');
        return;
    }

    var validQuestions = appQuestions.filter(function (q) { return q.question.trim() && q.answer.trim(); });
    if (validQuestions.length < 2) {
        showGenerateError('请至少设置 2 个包含问题和答案的问题。');
        return;
    }

    var threshold = Number.parseInt(thresholdInput.value, 10);
    if (isNaN(threshold) || threshold < 2) {
        showGenerateError('门限值至少为 2。');
        return;
    }
    if (threshold > validQuestions.length) {
        showGenerateError('门限值 (' + threshold + ') 不能超过有效问题数 (' + validQuestions.length + ')。');
        return;
    }

    btnGenerate.disabled = true;
    generateProgress.classList.remove('hidden');
    generateResult.classList.add('hidden');

    try {
        var challenge = await generateChallenge(
            secret, validQuestions, threshold,
            challengeTitleEl.value.trim() || undefined,
            challengeDescEl.value.trim() || undefined,
            function (msg, done, total) {
                var pct = total > 0 ? Math.round((done / total) * 100) : 0;
                progressFill.style.width = pct + '%';
                progressText.textContent = msg + ' (' + done + '/' + total + ')';
            }
        );

        var url = challengeToURL(challenge);
        var urlHint = '';
        if (url.length > 2000) {
            urlHint =
                '<div class="form-hint" style="margin-top: 10px; color: var(--warning);">' +
                    '提示：链接长度为 ' + url.length + '，部分平台可能截断或打不开，建议使用“下载 JSON 文件”分享。' +
                '</div>';
        }
        generateResult.classList.remove('hidden');
        generateResult.innerHTML =
            '<div class="result-box success">' +
                '<div class="result-label">挑战创建成功！</div>' +
                '<p style="margin-bottom: 12px; font-size: 0.9em; color: var(--text-secondary);">' +
                    '分享以下链接给你的朋友。他们需要正确回答至少 ' + threshold + ' 个问题才能获取秘密。' +
                '</p>' +
                '<textarea class="share-link" readonly id="share-link-output">' + escapeHtml(url) + '</textarea>' +
                urlHint +
                '<div class="btn-group">' +
                    '<button class="btn btn-primary" id="btn-copy-link">复制链接</button>' +
                    '<button class="btn btn-secondary" id="btn-download-json">下载 JSON 文件</button>' +
                '</div>' +
            '</div>';

        document.getElementById('btn-copy-link').addEventListener('click', function () {
            var textarea = document.getElementById('share-link-output');
            var btn = document.getElementById('btn-copy-link');
            copyFromTextarea(textarea).then(function (ok) {
                if (ok) {
                    btn.textContent = '已复制！';
                } else {
                    btn.textContent = '复制失败';
                }
                setTimeout(function () { btn.textContent = '复制链接'; }, 2000);
            });
        });

        document.getElementById('btn-download-json').addEventListener('click', function () {
            challengeToFile(challenge, (challengeTitleEl.value.trim() || 'challenge') + '.json');
        });

    } catch (e) {
        showGenerateError(e.message);
    } finally {
        btnGenerate.disabled = false;
        generateProgress.classList.add('hidden');
    }
});

function showGenerateError(msg) {
    generateResult.classList.remove('hidden');
    generateResult.innerHTML = '<div class="result-box error"><div class="result-label">错误</div><p>' + escapeHtml(msg) + '</p></div>';
}

function loadChallenge(challenge) {
    try {
        const normalized = validateChallengeData(challenge);
        currentChallenge = normalized;

        solveTitleEl.textContent = normalized.title || '秘密挑战';
        solveDescEl.textContent = normalized.description || '';

        let dateText = '未知日期';
        if (normalized.createdAt) {
            const createdAtDate = new Date(normalized.createdAt);
            if (!isNaN(createdAtDate.getTime())) {
                dateText = createdAtDate.toLocaleDateString('zh-CN');
            }
        }
        solveMetaEl.textContent = '门限：' + normalized.threshold + '/' + normalized.questions.length +
            ' · 创建于 ' + dateText;

        solveQuestionsEl.innerHTML = '';
        normalized.questions.forEach(function (q, i) {
            var div = document.createElement('div');
            div.className = 'solve-question';
            div.innerHTML =
                '<label>问题 ' + (i + 1) + '：' + escapeHtml(q.text) + '</label>' +
                (q.hint ? '<div class="hint">提示：' + escapeHtml(q.hint) + '</div>' : '') +
                '<input type="text" class="solve-answer" data-qid="' + q.id + '" placeholder="输入你的答案（不知道可以留空）">';
            solveQuestionsEl.appendChild(div);
        });

        solveLoadCard.classList.add('hidden');
        solveContent.classList.remove('hidden');
        solveResultEl.classList.add('hidden');

        switchTab('solve');
    } catch (e) {
        alert('加载挑战失败：' + e.message);
    }
}

fileImport.addEventListener('change', async function (e) {
    var file = e.target.files[0];
    if (!file) return;
    try {
        var challenge = await challengeFromFile(file);
        loadChallenge(challenge);
    } catch (err) {
        alert('文件读取失败：' + err.message);
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
        var hashIndex = link.indexOf('#');
        if (hashIndex === -1) throw new Error('链接中没有挑战数据');
        var data = link.substring(hashIndex + 1);
        var challenge = challengeFromBase64(data);
        loadChallenge(challenge);
    } catch (e) {
        alert('链接解析失败：' + e.message);
    }
});

btnSolve.addEventListener('click', async function () {
    if (!currentChallenge) return;

    var answers = {};
    solveQuestionsEl.querySelectorAll('.solve-answer').forEach(function (input) {
        var val = input.value.trim();
        if (val) {
            answers[Number.parseInt(input.dataset.qid, 10)] = val;
        }
    });

    btnSolve.disabled = true;
    btnSolve.textContent = '正在求解...';

    try {
        var result = await recoverSecret(currentChallenge, answers);

        solveResultEl.classList.remove('hidden');
        if (result.success) {
            solveResultEl.innerHTML =
                '<div class="result-box success">' +
                    '<div class="result-label">秘密已解锁！</div>' +
                    '<div class="result-value">' + escapeHtml(result.secret) + '</div>' +
                    '<p style="margin-top: 8px; font-size: 0.82em; color: var(--text-secondary);">' +
                        '已填写 ' + result.answeredCount + ' 个答案，使用其中 ' + (result.usedCount || result.answeredCount) + ' 个恢复秘密。' +
                    '</p>' +
                '</div>';
        } else {
            solveResultEl.innerHTML =
                '<div class="result-box error">' +
                    '<div class="result-label">求解失败</div>' +
                    '<p>' + escapeHtml(result.error) + '</p>' +
                '</div>';
        }
    } catch (e) {
        solveResultEl.classList.remove('hidden');
        solveResultEl.innerHTML =
            '<div class="result-box error">' +
                '<div class="result-label">错误</div>' +
                '<p>' + escapeHtml(e.message) + '</p>' +
            '</div>';
    } finally {
        btnSolve.disabled = false;
        btnSolve.textContent = '解锁秘密';
    }
});

function checkURLChallenge() {
    var challenge = challengeFromURL();
    if (challenge) {
        loadChallenge(challenge);
    }
}

window.addEventListener('hashchange', checkURLChallenge);
checkURLChallenge();

})();
