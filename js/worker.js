(function () {
'use strict';

var messages = {};

function t(key, params) {
    var template = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : key;
    var out = String(template);
    if (params && typeof params === 'object') {
        Object.keys(params).forEach(function (k) {
            out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), String(params[k]));
        });
    }
    return out;
}

var LIMITS = {
    maxQuestions: 64,
    maxThreshold: 64,
    maxShardCount: 20,
    maxSecretBytes: 1024,
    maxTitleChars: 120,
    maxDescChars: 800,
    maxQuestionTextChars: 400,
    maxHintChars: 300,
    maxBigIntDigits: 1400,
    maxBase64UrlChars: 30000
};

function gcd(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) {
        var temp = a % b;
        a = b;
        b = temp;
    }
    return a;
}

function extendedGcd(a, b) {
    if (b === 0n) return { gcd: a, x: 1n, y: 0n };
    var result = extendedGcd(b, a % b);
    return { gcd: result.gcd, x: result.y, y: result.x - (a / b) * result.y };
}

function modPow(base, exp, mod) {
    if (mod === 1n) return 0n;
    base = ((base % mod) + mod) % mod;
    var result = 1n;
    while (exp > 0n) {
        if (exp & 1n) result = (result * base) % mod;
        exp >>= 1n;
        base = (base * base) % mod;
    }
    return result;
}

function solveCRT(remainders, moduli) {
    var k = remainders.length;
    if (k === 0) throw new Error(t('errors.crt.min_pairs'));
    if (k !== moduli.length) throw new Error(t('errors.crt.length_mismatch'));
    var M = 1n;
    for (var i = 0; i < k; i++) M *= moduli[i];
    var x = 0n;
    for (var j = 0; j < k; j++) {
        var Mi = M / moduli[j];
        var yi = extendedGcd(moduli[j], Mi).y;
        x = (x + Mi * yi * remainders[j]) % M;
    }
    return ((x % M) + M) % M;
}

function normalizeAnswer(text) {
    text = String(text || '');
    if (typeof text.normalize === 'function') text = text.normalize('NFKC');
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
    return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function sha256Bytes(data) {
    var buffer;
    if (typeof data === 'string') buffer = new TextEncoder().encode(data);
    else if (data instanceof Uint8Array) buffer = data;
    else buffer = new Uint8Array(data);
    return new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
}

function getSecureRandomBigInt(bits) {
    var bytes = Math.ceil(bits / 8);
    var arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    var excessBits = bytes * 8 - bits;
    if (excessBits > 0) arr[0] &= (1 << (8 - excessBits)) - 1;
    var hex = '';
    for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
    return BigInt('0x0' + hex);
}

function getSecureRandomBigIntInRange(min, max) {
    if (max < min) throw new Error(t('errors.random.invalid_range'));
    if (max === min) return min;
    var span = max - min + 1n;
    var bits = span.toString(2).length;
    var candidate;
    do {
        candidate = getSecureRandomBigInt(bits);
    } while (candidate >= span);
    return min + candidate;
}

function getSecureRandomBytes(byteLength) {
    var arr = new Uint8Array(byteLength);
    crypto.getRandomValues(arr);
    return arr;
}

function yieldToUI() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
}

function millerRabin(n, rounds) {
    if (rounds === undefined) rounds = 20;
    if (n < 2n) return false;
    if (n === 2n || n === 3n) return true;
    if (n % 2n === 0n) return false;
    var r = 0n;
    var d = n - 1n;
    while (d % 2n === 0n) {
        d /= 2n;
        r++;
    }
    var smallPrimes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    for (var i = 0; i < rounds; i++) {
        var a;
        if (i < smallPrimes.length && smallPrimes[i] < n - 2n) a = smallPrimes[i];
        else {
            var bits = n.toString(2).length;
            do { a = getSecureRandomBigInt(bits); } while (a < 2n || a >= n - 2n);
        }
        var x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) continue;
        var composite = true;
        for (var j = 1n; j < r; j++) {
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
    var attempts = 0;
    while (true) {
        var candidate = getSecureRandomBigInt(bits);
        candidate |= (1n << BigInt(bits - 1));
        candidate |= 1n;
        if (millerRabin(candidate)) return candidate;
        attempts++;
        if (attempts % 32 === 0) await yieldToUI();
    }
}

async function generateModuli(count, bitSize, onProgress) {
    var moduli = [];
    for (var i = 0; i < count; i++) {
        var prime;
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
    var normalized = normalizeAnswer(answer);
    var inputBytes = new TextEncoder().encode(normalized);
    var keyMaterial = await crypto.subtle.importKey('raw', inputBytes, { name: 'PBKDF2' }, false, ['deriveBits']);
    var derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: iterations }, keyMaterial, dkLenBytes * 8);
    var keyBytes = new Uint8Array(derivedBits);
    return { keyBytes: keyBytes, keyBigInt: bytesToBigInt(keyBytes) };
}

async function computeAnswerVerificationTag(keyBytes, saltBytes, modulusBigInt, xorValueBigInt) {
    var tagInput = ['shardkey-answer-tag-v1', bytesToBase64Url(keyBytes), bytesToBase64Url(saltBytes), modulusBigInt.toString(), xorValueBigInt.toString()].join('|');
    var tagBytes = (await sha256Bytes(tagInput)).slice(0, 16);
    return bytesToBase64Url(tagBytes);
}

function bytesToBigInt(bytes) {
    if (!bytes || bytes.length === 0) return 0n;
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return BigInt('0x' + hex);
}

function bigIntToBytes(n, byteLength) {
    if (byteLength === 0) return new Uint8Array(0);
    var hex = n.toString(16).padStart(byteLength * 2, '0');
    var bytes = new Uint8Array(byteLength);
    for (var i = 0; i < byteLength; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return bytes;
}

function getSecretValueBase(byteLength) {
    if (byteLength <= 0) return 1n;
    return 1n << (8n * BigInt(byteLength));
}

function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
}

async function hashToHex(data) {
    return bytesToHex(await sha256Bytes(data));
}

async function checksumMatches(secretText, checksum) {
    if (typeof checksum !== 'string') return false;
    var secretBytes = new TextEncoder().encode(String(secretText || ''));
    var actual = (await hashToHex(secretBytes)).toLowerCase();
    return actual.substring(0, checksum.length) === checksum.toLowerCase();
}

function secretToBigInt(text) {
    var bytes = new TextEncoder().encode(String(text || ''));
    if (bytes.length === 0) return { value: 0n, byteLength: 0 };
    return { value: bytesToBigInt(bytes), byteLength: bytes.length };
}

function bigIntToSecret(n, byteLength) {
    if (byteLength === 0) return '';
    return new TextDecoder().decode(bigIntToBytes(n, byteLength));
}

function bytesToBase64Url(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(base64url) {
    if (typeof base64url !== 'string' || base64url.length === 0 || base64url.length > LIMITS.maxBase64UrlChars) throw new Error(t('errors.base64url.invalid_field'));
    if (!/^[0-9A-Za-z_-]+$/.test(base64url)) throw new Error(t('errors.base64url.invalid_field'));
    var base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function encodeSecretPayloadV3(secretText) {
    var secretBytes = new TextEncoder().encode(secretText);
    if (secretBytes.length > LIMITS.maxSecretBytes) throw new Error(t('errors.secret.too_long_bytes', { max: LIMITS.maxSecretBytes }));
    var checksumBytes = (await sha256Bytes(secretBytes)).slice(0, 16);
    var payload = new Uint8Array(4 + 2 + secretBytes.length + checksumBytes.length);
    payload[0] = 0x53;
    payload[1] = 0x4b;
    payload[2] = 0x33;
    payload[3] = 0x00;
    payload[4] = (secretBytes.length >> 8) & 0xff;
    payload[5] = secretBytes.length & 0xff;
    payload.set(secretBytes, 6);
    payload.set(checksumBytes, 6 + secretBytes.length);
    return { value: bytesToBigInt(payload), byteLength: payload.length, secretByteLength: secretBytes.length };
}

async function decodeSecretPayloadV3(payloadBytes) {
    if (!(payloadBytes instanceof Uint8Array)) throw new Error(t('errors.secret.payload.invalid_format'));
    if (payloadBytes.length < 22) throw new Error(t('errors.secret.payload.length_invalid'));
    if (payloadBytes[0] !== 0x53 || payloadBytes[1] !== 0x4b || payloadBytes[2] !== 0x33 || payloadBytes[3] !== 0x00) throw new Error(t('errors.secret.payload.marker_invalid'));
    var secretLen = (payloadBytes[4] << 8) | payloadBytes[5];
    if (4 + 2 + secretLen + 16 !== payloadBytes.length) throw new Error(t('errors.secret.payload.length_mismatch'));
    var secretBytes = payloadBytes.slice(6, 6 + secretLen);
    var checksumBytes = payloadBytes.slice(6 + secretLen);
    var computed = (await sha256Bytes(secretBytes)).slice(0, 16);
    for (var i = 0; i < 16; i++) if (computed[i] !== checksumBytes[i]) throw new Error(t('errors.secret.payload.checksum_failed'));
    return { secretText: new TextDecoder().decode(secretBytes), secretByteLength: secretLen };
}

function calculateModulusBitSize(secretBits, threshold) {
    var minBits = Math.ceil(Math.max(secretBits, 8) / threshold) + 20;
    return Math.max(minBits, 32);
}

function calculateMignotteBounds(moduli, threshold) {
    var sortedModuli = moduli.slice().sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    var alpha = 1n;
    for (var i = 0; i < threshold; i++) alpha *= sortedModuli[i];
    var beta = 1n;
    for (var j = sortedModuli.length - (threshold - 1); j < sortedModuli.length; j++) beta *= sortedModuli[j];
    return { alpha: alpha, beta: beta };
}

function chooseEncodedSecret(rawSecretValue, byteLength, alpha, beta) {
    var base = getSecretValueBase(byteLength);
    var upper = alpha - 1n;
    if (upper < rawSecretValue) throw new Error(t('errors.secret.too_large_for_threshold'));
    var kMin = 0n;
    if (beta >= rawSecretValue) kMin = ((beta - rawSecretValue) / base) + 1n;
    var kMax = (upper - rawSecretValue) / base;
    if (kMax < kMin) throw new Error(t('errors.secret.cannot_construct_interval'));
    return rawSecretValue + getSecureRandomBigIntInRange(kMin, kMax) * base;
}

function decodeRecoveredSecretValueV3(recovered, secretPayloadByteLength) {
    var base = getSecretValueBase(secretPayloadByteLength);
    var mod = recovered % base;
    return mod < 0n ? mod + base : mod;
}

async function generateChallenge(secret, questions, threshold, title, description) {
    if (!secret) throw new Error(t('errors.secret.empty'));
    if (questions.length < threshold) throw new Error(t('errors.questions.less_than_threshold', { count: questions.length, threshold: threshold }));
    if (threshold < 2) throw new Error(t('errors.threshold.min2'));
    var payload = await encodeSecretPayloadV3(secret);
    var rawSecretValue = payload.value;
    var payloadByteLength = payload.byteLength;
    var secretByteLength = payload.secretByteLength;
    var secretBits = Math.max(1, payloadByteLength * 8);
    var modBits = calculateModulusBitSize(secretBits, threshold);
    var moduli = null;
    var alpha = 0n;
    var beta = 0n;
    var encodedSecret = null;
    for (var attempt = 0; attempt < 8; attempt++) {
        var bitSizeForAttempt = modBits + attempt * 2;
        postMessage({ type: 'progress', msg: t('progress.generating_moduli'), done: 0, total: questions.length });
        moduli = await generateModuli(questions.length, bitSizeForAttempt, function (done, total) {
            postMessage({ type: 'progress', msg: t('progress.generating_moduli'), done: done, total: total });
        });
        var bounds = calculateMignotteBounds(moduli, threshold);
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
            if (attempt === 7) throw e;
            await yieldToUI();
        }
    }
    if (!moduli || encodedSecret === null) throw new Error(t('errors.challenge.generate_failed'));
    var kdf = { type: 'pbkdf2-sha256', hash: 'SHA-256', iterations: 120000, dkLen: 32, saltLen: 16 };
    postMessage({ type: 'progress', msg: t('progress.computing_xor_mask'), done: 0, total: questions.length });
    var questionEntries = [];
    for (var i = 0; i < questions.length; i++) {
        var q = questions[i];
        var mi = moduli[i];
        var remainder = ((encodedSecret % mi) + mi) % mi;
        var answerOptions = Array.isArray(q.answers) ? q.answers : [q.answer];
        if (answerOptions.length === 0 || !answerOptions.some(function (a) { return String(a || '').trim(); })) throw new Error(t('errors.question.missing_answer', { n: i + 1 }));
        if (answerOptions.length > 16) throw new Error(t('errors.question.too_many_answers', { n: i + 1, max: 16 }));
        var saltBytes = getSecureRandomBytes(kdf.saltLen);
        var xorValues = [];
        var xorTags = [];
        for (var j = 0; j < answerOptions.length; j++) {
            var answerText = answerOptions[j];
            if (!String(answerText || '').trim()) continue;
            var keyMaterial = await deriveAnswerKeyMaterialPBKDF2(answerText, saltBytes, kdf.iterations, kdf.dkLen);
            var keyMod = ((keyMaterial.keyBigInt % mi) + mi) % mi;
            var xorValue = keyMod ^ remainder;
            xorValues.push(xorValue.toString());
            xorTags.push(await computeAnswerVerificationTag(keyMaterial.keyBytes, saltBytes, mi, xorValue));
        }
        if (xorValues.length === 0) throw new Error(t('errors.question.missing_answer', { n: i + 1 }));
        questionEntries.push({ id: i, text: q.question, hint: q.hint || '', modulus: mi.toString(), xorValues: xorValues, xorTags: xorTags, salt: bytesToBase64Url(saltBytes) });
        postMessage({ type: 'progress', msg: t('progress.computing_xor_mask'), done: i + 1, total: questions.length });
        if ((i + 1) % 4 === 0) await yieldToUI();
    }
    return { version: 3, secretEncoding: 'offset-payload-v3', title: title || t('defaults.challenge_title'), description: description || t('defaults.challenge_desc'), threshold: threshold, secretByteLength: secretByteLength, secretPayloadByteLength: payloadByteLength, kdf: kdf, questions: questionEntries, createdAt: new Date().toISOString() };
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateChallengeData(challenge) {
    if (!isPlainObject(challenge)) throw new Error(t('errors.challenge.invalid_format'));
    var version = Number(challenge.version);
    if (!Number.isInteger(version) || version !== 3) throw new Error(t('errors.challenge.only_v3'));
    if (challenge.secretEncoding !== 'offset-payload-v3') throw new Error(t('errors.challenge.unsupported_secret_encoding'));
    var threshold = Number(challenge.threshold);
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > LIMITS.maxThreshold) throw new Error(t('errors.challenge.threshold_invalid_format'));
    var secretByteLength = Number(challenge.secretByteLength);
    if (!Number.isInteger(secretByteLength) || secretByteLength < 0 || secretByteLength > LIMITS.maxSecretBytes) throw new Error(t('errors.challenge.secret_length_field_invalid'));
    var secretPayloadByteLength = Number(challenge.secretPayloadByteLength);
    if (!Number.isInteger(secretPayloadByteLength) || secretPayloadByteLength < 22 || secretPayloadByteLength > LIMITS.maxSecretBytes + 22 || secretPayloadByteLength !== secretByteLength + 22) throw new Error(t('errors.challenge.secret_payload_length_field_invalid'));
    var expectedSecretBits = Math.max(1, secretPayloadByteLength * 8);
    var expectedModBits = calculateModulusBitSize(expectedSecretBits, threshold);
    var allowedModBits = expectedModBits + 256;
    if (!isPlainObject(challenge.kdf)) throw new Error(t('errors.challenge.kdf_invalid'));
    var kdfType = String(challenge.kdf.type || '');
    var kdfHash = String(challenge.kdf.hash || '');
    var kdfIterations = Number(challenge.kdf.iterations);
    var kdfDkLen = Number(challenge.kdf.dkLen);
    var kdfSaltLen = Number(challenge.kdf.saltLen);
    if (kdfType !== 'pbkdf2-sha256' || kdfHash !== 'SHA-256') throw new Error(t('errors.challenge.kdf_invalid'));
    if (!Number.isInteger(kdfIterations) || kdfIterations < 1000 || kdfIterations > 2000000) throw new Error(t('errors.challenge.kdf_iterations_invalid'));
    if (!Number.isInteger(kdfDkLen) || kdfDkLen < 16 || kdfDkLen > 64) throw new Error(t('errors.challenge.kdf_dklen_invalid'));
    if (!Number.isInteger(kdfSaltLen) || kdfSaltLen < 8 || kdfSaltLen > 32) throw new Error(t('errors.challenge.kdf_saltlen_invalid'));
    var kdf = { type: kdfType, hash: kdfHash, iterations: kdfIterations, dkLen: kdfDkLen, saltLen: kdfSaltLen };
    if (!Array.isArray(challenge.questions) || challenge.questions.length === 0 || challenge.questions.length > LIMITS.maxQuestions) throw new Error(t('errors.challenge.questions_list_invalid'));
    if (challenge.questions.length < threshold) throw new Error(t('errors.challenge.question_count_below_threshold'));
    var seenIds = new Set();
    var usedModuli = [];
    var normalizedQuestions = challenge.questions.map(function (q) {
        if (!isPlainObject(q)) throw new Error(t('errors.challenge.question_field_invalid'));
        var id = Number(q.id);
        if (!Number.isInteger(id) || id < 0) throw new Error(t('errors.challenge.question_id_invalid'));
        if (seenIds.has(id)) throw new Error(t('errors.challenge.question_id_duplicate'));
        seenIds.add(id);
        var text = typeof q.text === 'string' ? q.text : '';
        var hint = typeof q.hint === 'string' ? q.hint : '';
        if (text.length > LIMITS.maxQuestionTextChars) throw new Error(t('errors.challenge.question_text_too_long'));
        if (hint.length > LIMITS.maxHintChars) throw new Error(t('errors.challenge.question_hint_too_long'));
        var modulusStr = String(q.modulus || '');
        if (!/^\d+$/.test(modulusStr) || modulusStr.length > LIMITS.maxBigIntDigits) throw new Error(t('errors.challenge.question_params_invalid_format'));
        var modulusBigInt = BigInt(modulusStr);
        if (modulusBigInt <= 2n) throw new Error(t('errors.challenge.question_params_invalid_value'));
        var modulusBits = modulusBigInt.toString(2).length;
        if (modulusBits > allowedModBits) throw new Error(t('errors.challenge.question_params_invalid_value'));
        function parseQuestionTag(rawTag) {
            var tag = String(rawTag || '');
            if (!/^[0-9A-Za-z_-]{8,120}$/.test(tag)) throw new Error(t('errors.challenge.question_tag_invalid'));
            return tag;
        }
        if (!Array.isArray(q.xorValues) || q.xorValues.length === 0 || q.xorValues.length > 16) throw new Error(t('errors.challenge.answer_variants_count_invalid'));
        if (!Array.isArray(q.xorTags) || q.xorTags.length !== q.xorValues.length) throw new Error(t('errors.challenge.question_tag_invalid'));
        var xorValueStrs = q.xorValues.map(function (v) { return String(v || ''); });
        for (var i = 0; i < xorValueStrs.length; i++) if (!/^\d+$/.test(xorValueStrs[i]) || xorValueStrs[i].length > LIMITS.maxBigIntDigits) throw new Error(t('errors.challenge.question_params_invalid_format'));
        var xorValuesBigInt = xorValueStrs.map(function (s) { return BigInt(s); });
        for (var j = 0; j < xorValuesBigInt.length; j++) {
            var xvb = xorValuesBigInt[j];
            if (xvb < 0n) throw new Error(t('errors.challenge.question_params_invalid_value'));
            var xorBits = xvb === 0n ? 1 : xvb.toString(2).length;
            if (xorBits > modulusBits) throw new Error(t('errors.challenge.question_params_invalid_value'));
        }
        var xorTags = q.xorTags.map(parseQuestionTag);
        var salt = String(q.salt || '');
        if (!/^[0-9A-Za-z_-]{8,200}$/.test(salt)) throw new Error(t('errors.challenge.question_salt_invalid'));
        var saltBytes = base64UrlToBytes(salt);
        if (saltBytes.length !== kdf.saltLen) throw new Error(t('errors.challenge.question_salt_invalid'));
        for (var k = 0; k < usedModuli.length; k++) if (gcd(usedModuli[k], modulusBigInt) !== 1n) throw new Error(t('errors.challenge.moduli_not_coprime'));
        usedModuli.push(modulusBigInt);
        return { id: id, text: text, hint: hint, modulus: modulusBigInt.toString(), modulusBigInt: modulusBigInt, xorValues: xorValuesBigInt.map(function (v) { return v.toString(); }), xorValuesBigInt: xorValuesBigInt, xorTags: xorTags, salt: salt, saltBytes: saltBytes };
    });
    var title = typeof challenge.title === 'string' ? challenge.title : t('defaults.challenge_title');
    var description = typeof challenge.description === 'string' ? challenge.description : '';
    if (title.length > LIMITS.maxTitleChars) throw new Error(t('errors.challenge.title_too_long'));
    if (description.length > LIMITS.maxDescChars) throw new Error(t('errors.challenge.desc_too_long'));
    var bounds = calculateMignotteBounds(normalizedQuestions.map(function (q) { return q.modulusBigInt; }), threshold);
    if (bounds.alpha <= bounds.beta) throw new Error(t('errors.challenge.params_invalid_moduli_bounds'));
    return { version: version, secretEncoding: 'offset-payload-v3', title: title, description: description, threshold: threshold, secretByteLength: secretByteLength, secretPayloadByteLength: secretPayloadByteLength, kdf: kdf, questions: normalizedQuestions, createdAt: typeof challenge.createdAt === 'string' ? challenge.createdAt : '' };
}

function validateShardData(shard) {
    if (!isPlainObject(shard)) throw new Error(t('errors.shard.invalid_format'));
    var version = Number(shard.version);
    if (!Number.isInteger(version) || version !== 3) throw new Error(t('errors.shard.only_v3'));
    if (String(shard.type || '') !== 'shard') throw new Error(t('errors.shard.type_invalid'));

    var challengeId = String(shard.challengeId || '').toLowerCase();
    if (!/^[0-9a-f]{8,64}$/.test(challengeId)) throw new Error(t('errors.shard.challenge_id_invalid'));

    var totalShards = Number(shard.totalShards);
    if (!Number.isInteger(totalShards) || totalShards < 2 || totalShards > LIMITS.maxShardCount) throw new Error(t('errors.shard.total_invalid', { max: LIMITS.maxShardCount }));

    var threshold = Number(shard.threshold);
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > totalShards) throw new Error(t('errors.shard.threshold_invalid'));

    var shardIndex = Number(shard.shardIndex);
    if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= totalShards) throw new Error(t('errors.shard.index_invalid'));

    var secretByteLength = Number(shard.secretByteLength);
    if (!Number.isInteger(secretByteLength) || secretByteLength <= 0 || secretByteLength > LIMITS.maxSecretBytes) throw new Error(t('errors.shard.secret_length_invalid'));

    var secretChecksum = String(shard.secretChecksum || '').toLowerCase();
    if (!/^[0-9a-f]{16,64}$/.test(secretChecksum)) throw new Error(t('errors.shard.checksum_invalid'));

    if (String(shard.secretEncoding || '') !== 'offset-base256') throw new Error(t('errors.shard.encoding_invalid'));

    var modulusStr = String(shard.modulus || '');
    if (!/^\d+$/.test(modulusStr) || modulusStr.length > LIMITS.maxBigIntDigits) throw new Error(t('errors.shard.modulus_invalid'));
    var modulusBigInt = BigInt(modulusStr);
    if (modulusBigInt <= 2n) throw new Error(t('errors.shard.modulus_invalid'));

    var remainderStr = String(shard.remainder || '');
    if (!/^\d+$/.test(remainderStr) || remainderStr.length > LIMITS.maxBigIntDigits) throw new Error(t('errors.shard.remainder_invalid'));
    var remainderBigInt = BigInt(remainderStr);
    if (remainderBigInt < 0n || remainderBigInt >= modulusBigInt) throw new Error(t('errors.shard.remainder_invalid'));

    return {
        type: 'shard',
        version: version,
        challengeId: challengeId,
        shardIndex: shardIndex,
        totalShards: totalShards,
        threshold: threshold,
        secretByteLength: secretByteLength,
        secretChecksum: secretChecksum,
        secretEncoding: 'offset-base256',
        modulus: modulusBigInt.toString(),
        remainder: remainderBigInt.toString(),
    };
}

function normalizeShardCollection(value) {
    if (!Array.isArray(value) || value.length === 0) throw new Error(t('errors.shard.collection_empty'));
    var normalized = value.map(validateShardData);
    var first = normalized[0];
    for (var i = 1; i < normalized.length; i++) {
        var shard = normalized[i];
        if (shard.challengeId !== first.challengeId || shard.threshold !== first.threshold || shard.totalShards !== first.totalShards || shard.secretByteLength !== first.secretByteLength || shard.secretChecksum !== first.secretChecksum || shard.secretEncoding !== first.secretEncoding) {
            throw new Error(t('errors.shard.mixed_collection'));
        }
    }
    return normalized;
}

async function generateShards(secret, totalShards, threshold, onProgress) {
    if (!secret) throw new Error(t('errors.shard.secret_empty'));
    if (totalShards < 2 || totalShards > LIMITS.maxShardCount) throw new Error(t('errors.shard.total_invalid', { max: LIMITS.maxShardCount }));
    if (threshold < 2) throw new Error(t('errors.shard.threshold_invalid'));
    if (threshold > totalShards) throw new Error(t('errors.shard.threshold_gt_total'));

    var secretBytes = new TextEncoder().encode(secret);
    if (secretBytes.length > LIMITS.maxSecretBytes) throw new Error(t('validation.secret.too_long', { max: LIMITS.maxSecretBytes }));

    var rawResult = secretToBigInt(secret);
    var rawSecretValue = rawResult.value;
    var byteLength = rawResult.byteLength;
    var secretBits = Math.max(1, byteLength * 8);
    var modBits = calculateModulusBitSize(secretBits, threshold);
    var moduli = null;
    var encodedSecret = null;

    for (var attempt = 0; attempt < 8; attempt++) {
        var bitSizeForAttempt = modBits + attempt * 2;
        if (onProgress) onProgress(t('progress.generating_moduli'), 0, totalShards);
        moduli = await generateModuli(totalShards, bitSizeForAttempt, function (done, total) {
            if (onProgress) onProgress(t('progress.generating_moduli'), done, total);
        });
        var bounds = calculateMignotteBounds(moduli, threshold);
        if (bounds.alpha <= bounds.beta) {
            await yieldToUI();
            continue;
        }
        try {
            encodedSecret = chooseEncodedSecret(rawSecretValue, byteLength, bounds.alpha, bounds.beta);
            break;
        } catch (e) {
            if (attempt === 7) throw e;
            await yieldToUI();
        }
    }

    if (!moduli || encodedSecret === null) throw new Error(t('errors.shard.generate_failed'));

    var checksum = (await hashToHex(secretBytes)).substring(0, 32);
    var challengeId = (await hashToHex(new TextEncoder().encode(secret + '|' + Date.now() + '|' + Math.random()))).substring(0, 16);
    var shards = [];
    for (var i = 0; i < totalShards; i++) {
        var modulus = moduli[i];
        var remainder = ((encodedSecret % modulus) + modulus) % modulus;
        shards.push({
            type: 'shard',
            version: 3,
            challengeId: challengeId,
            shardIndex: i,
            totalShards: totalShards,
            threshold: threshold,
            secretByteLength: byteLength,
            secretChecksum: checksum,
            secretEncoding: 'offset-base256',
            modulus: modulus.toString(),
            remainder: remainder.toString(),
        });
    }
    return shards;
}

async function recoverFromShards(shards) {
    var normalized = normalizeShardCollection(shards);
    var first = normalized[0];
    if (normalized.length < first.threshold) throw new Error(t('errors.shard.need_more', { threshold: first.threshold, count: normalized.length }));

    var seenIndices = new Set();
    var moduli = [];
    var remainders = [];
    for (var i = 0; i < normalized.length; i++) {
        var shard = normalized[i];
        if (seenIndices.has(shard.shardIndex)) throw new Error(t('errors.shard.duplicate_index', { index: shard.shardIndex + 1 }));
        seenIndices.add(shard.shardIndex);
        var modulusBigInt = BigInt(shard.modulus);
        for (var j = 0; j < moduli.length; j++) {
            if (gcd(moduli[j], modulusBigInt) !== 1n) throw new Error(t('errors.shard.moduli_not_coprime'));
        }
        moduli.push(modulusBigInt);
        remainders.push(BigInt(shard.remainder));
    }

    var recovered = solveCRT(remainders, moduli);
    var base = getSecretValueBase(first.secretByteLength);
    var decodedValue = ((recovered % base) + base) % base;
    var secretText = bigIntToSecret(decodedValue, first.secretByteLength);
    if (!(await checksumMatches(secretText, first.secretChecksum))) throw new Error(t('errors.shard.checksum_mismatch'));
    return secretText;
}

async function findVerifiedQuestionRemainder(question, userAnswer, kdf, modulusBigInt) {
    var keyMaterial = await deriveAnswerKeyMaterialPBKDF2(userAnswer, question.saltBytes, kdf.iterations, kdf.dkLen);
    var keyMod = ((keyMaterial.keyBigInt % modulusBigInt) + modulusBigInt) % modulusBigInt;
    for (var i = 0; i < question.xorValuesBigInt.length; i++) {
        var xorVal = question.xorValuesBigInt[i];
        var expectedTag = await computeAnswerVerificationTag(keyMaterial.keyBytes, question.saltBytes, modulusBigInt, xorVal);
        if (expectedTag === question.xorTags[i]) return keyMod ^ xorVal;
    }
    return null;
}

async function decodeRecoveredSecretFromRemainders(remainders, moduli, alpha, beta, secretPayloadByteLength, secretByteLength) {
    var recovered = solveCRT(remainders, moduli);
    if (recovered <= beta || recovered >= alpha) return null;
    var decodedValue = decodeRecoveredSecretValueV3(recovered, secretPayloadByteLength);
    var payloadBytes = bigIntToBytes(decodedValue, secretPayloadByteLength);
    try {
        var decoded = await decodeSecretPayloadV3(payloadBytes);
        if (decoded.secretByteLength !== secretByteLength) return null;
        return decoded.secretText;
    } catch (e) {
        return null;
    }
}

async function recoverSecret(challenge, answers) {
    challenge = validateChallengeData(challenge);
    var threshold = challenge.threshold;
    var secretByteLength = challenge.secretByteLength;
    var questions = challenge.questions;
    var secretPayloadByteLength = challenge.secretPayloadByteLength;
    var kdf = challenge.kdf;
    var answeredQuestions = questions.filter(function (q) {
        return answers[q.id] !== undefined && String(answers[q.id] || '').trim() !== '';
    });
    var answeredCount = answeredQuestions.length;
    if (answeredCount < threshold) return { success: false, error: t('errors.solver.need_at_least', { threshold: threshold, answered: answeredCount }), answeredCount: answeredCount };
    var verifiedEntries = [];
    for (var i = 0; i < answeredQuestions.length; i++) {
        var q = answeredQuestions[i];
        var verifiedRemainder = await findVerifiedQuestionRemainder(q, String(answers[q.id] || ''), kdf, q.modulusBigInt);
        if (verifiedRemainder !== null) {
            verifiedEntries.push({ modulus: q.modulusBigInt, remainder: verifiedRemainder });
            if (verifiedEntries.length % 8 === 0) await yieldToUI();
        }
    }
    if (verifiedEntries.length < threshold) return { success: false, error: t('errors.solver.verify_failed', { suffix: '' }), answeredCount: answeredCount };
    var bounds = calculateMignotteBounds(questions.map(function (q) { return q.modulusBigInt; }), threshold);
    var solvedEntries = verifiedEntries.slice(0, threshold);
    var secretText = await decodeRecoveredSecretFromRemainders(solvedEntries.map(function (item) { return item.remainder; }), solvedEntries.map(function (item) { return item.modulus; }), bounds.alpha, bounds.beta, secretPayloadByteLength, secretByteLength);
    if (secretText === null) return { success: false, error: t('errors.solver.verify_failed', { suffix: '' }), answeredCount: answeredCount };
    return { success: true, secret: secretText, answeredCount: answeredCount, usedCount: threshold };
}

self.onmessage = async function (event) {
    var data = event.data || {};
    messages = data.messages || {};
    try {
        if (data.type === 'generate') {
            postMessage({ type: 'result', result: await generateChallenge(data.payload.secret, data.payload.questions, data.payload.threshold, data.payload.title, data.payload.description) });
            return;
        }
        if (data.type === 'recover') {
            postMessage({ type: 'result', result: await recoverSecret(data.payload.challenge, data.payload.answers || {}) });
            return;
        }
        if (data.type === 'generate-shards') {
            postMessage({ type: 'result', result: await generateShards(data.payload.secret, data.payload.totalShards, data.payload.threshold) });
            return;
        }
        if (data.type === 'recover-shards') {
            postMessage({ type: 'result', result: await recoverFromShards(data.payload.shards || []) });
            return;
        }
        throw new Error('Unknown worker task');
    } catch (e) {
        postMessage({ type: 'error', error: e && e.message ? e.message : String(e) });
    }
};
})();
