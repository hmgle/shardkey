(function (global) {
'use strict';

var DEFAULTS = {
    maxQuestions: 64,
    maxThreshold: 64,
    maxShardCount: 20,
    maxSecretBytes: 1024,
    maxTitleChars: 120,
    maxDescChars: 800,
    maxQuestionTextChars: 400,
    maxHintChars: 300,
    maxBase64UrlChars: 30000,
    maxAnswerVariants: 16,
    pbkdf2Iterations: 120000,
    pbkdf2DkLen: 32,
    pbkdf2SaltLen: 16,
    secretKeyBytes: 32,
    aesGcmIvBytes: 12,
};

function resolveDefaults(options) {
    return Object.assign({}, DEFAULTS, options && options.limits ? options.limits : null);
}

function translate(options, key, params) {
    if (options && typeof options.translate === 'function') {
        return options.translate(key, params);
    }
    var out = String(key);
    if (params && typeof params === 'object') {
        Object.keys(params).forEach(function (name) {
            var placeholder = '{' + name + '}';
            var value = String(params[name]);
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

function fail(options, key, params) {
    throw new Error(translate(options, key, params));
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAnswer(text) {
    text = String(text || '');
    if (typeof text.normalize === 'function') {
        text = text.normalize('NFKC');
    }
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
    return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function bytesToBase64Url(bytes) {
    var CHUNK = 8192;
    var parts = [];
    for (var i = 0; i < bytes.length; i += CHUNK) {
        parts.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
    }
    return btoa(parts.join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(base64url, options) {
    var limits = resolveDefaults(options);
    if (typeof base64url !== 'string' || base64url.length === 0 || base64url.length > limits.maxBase64UrlChars) {
        fail(options, 'errors.base64url.invalid_field');
    }
    if (!/^[0-9A-Za-z_-]+$/.test(base64url)) {
        fail(options, 'errors.base64url.invalid_field');
    }
    var base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function encodeJsonBase64Url(value) {
    var json = JSON.stringify(value);
    var bytes = new TextEncoder().encode(json);
    return bytesToBase64Url(bytes);
}

function decodeJsonBase64Url(value, options) {
    var bytes = base64UrlToBytes(value, options);
    return JSON.parse(new TextDecoder().decode(bytes));
}

function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
}

function getRandomBytes(length) {
    var bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

async function deriveKeyBytesPBKDF2(answer, saltBytes, options) {
    var kdf = options && options.kdf ? options.kdf : resolveDefaults(options);
    var normalized = normalizeAnswer(answer);
    var material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(normalized),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    var bits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            hash: 'SHA-256',
            salt: saltBytes,
            iterations: Number(kdf.iterations || kdf.pbkdf2Iterations || DEFAULTS.pbkdf2Iterations),
        },
        material,
        Number(kdf.dkLen || kdf.pbkdf2DkLen || DEFAULTS.pbkdf2DkLen) * 8
    );
    return new Uint8Array(bits);
}

async function importAesKey(keyBytes, usages) {
    return await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, usages);
}

function toAadBytes(label) {
    return new TextEncoder().encode(String(label || ''));
}

async function aesGcmEncrypt(keyBytes, plaintextBytes, aadLabel, options) {
    var limits = resolveDefaults(options);
    var iv = getRandomBytes(limits.aesGcmIvBytes);
    var key = await importAesKey(keyBytes, ['encrypt']);
    var ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
            additionalData: toAadBytes(aadLabel),
        },
        key,
        plaintextBytes
    ));
    return {
        alg: 'aes-256-gcm',
        iv: bytesToBase64Url(iv),
        ciphertext: bytesToBase64Url(ciphertext),
    };
}

async function aesGcmDecrypt(keyBytes, box, aadLabel, options) {
    var iv = base64UrlToBytes(String(box.iv || ''), options);
    var ciphertext = base64UrlToBytes(String(box.ciphertext || ''), options);
    var key = await importAesKey(keyBytes, ['decrypt']);
    var plaintext = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv,
            additionalData: toAadBytes(aadLabel),
        },
        key,
        ciphertext
    );
    return new Uint8Array(plaintext);
}

function isExpectedDecryptFailure(error) {
    if (!error) {
        return false;
    }
    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
        return true;
    }
    return error.name === 'OperationError' || error.name === 'InvalidAccessError' || error.name === 'DataError';
}

function nextCombination(indices, total) {
    var count = indices.length;
    for (var i = count - 1; i >= 0; i--) {
        if (indices[i] < total - count + i) {
            indices[i] += 1;
            for (var j = i + 1; j < count; j++) {
                indices[j] = indices[j - 1] + 1;
            }
            return true;
        }
    }
    return false;
}

async function decryptSecretFromShares(shares, threshold, secretBox, aadLabel, options) {
    if (!Array.isArray(shares) || shares.length < threshold) {
        fail(options, 'errors.shamir.need_more_shares');
    }
    if (shares.length === threshold || (options && options.assumeAllSharesValid)) {
        var directSecretKey = combineSecretShares(shares.slice(0, threshold), options);
        return await aesGcmDecrypt(directSecretKey, secretBox, aadLabel, options);
    }
    var indices = [];
    for (var i = 0; i < threshold; i++) {
        indices.push(i);
    }
    do {
        var selectedShares = [];
        for (var j = 0; j < indices.length; j++) {
            selectedShares.push(shares[indices[j]]);
        }
        try {
            var secretKey = combineSecretShares(selectedShares, options);
            return await aesGcmDecrypt(secretKey, secretBox, aadLabel, options);
        } catch (e) {
            if (!isExpectedDecryptFailure(e)) {
                throw e;
            }
        }
    } while (shares.length > threshold && nextCombination(indices, shares.length));
    throw new Error('Secret recovery failed');
}

// GF(256) exp/log lookup tables (generator = 3, polynomial 0x11b)
var GF_EXP = new Uint8Array(512);
var GF_LOG = new Uint16Array(256);
(function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_EXP[i + 255] = x;
        GF_LOG[x] = i;
        var x2 = (x << 1) & 0xff;
        if (x & 0x80) x2 ^= 0x1b;
        x = x2 ^ x;
    }
})();

function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfInv(a, options) {
    if (a === 0) {
        fail(options, 'errors.shamir.invalid_share');
    }
    return GF_EXP[255 - GF_LOG[a]];
}

function gfDiv(a, b, options) {
    if ((a & 0xff) === 0) {
        return 0;
    }
    return gfMul(a, gfInv(b, options));
}

function evaluatePolynomial(coeffs, x) {
    var y = 0;
    for (var i = coeffs.length - 1; i >= 0; i--) {
        y = gfMul(y, x) ^ coeffs[i];
    }
    return y & 0xff;
}

function splitSecretShares(secretBytes, totalShares, threshold, options) {
    if (!(secretBytes instanceof Uint8Array) || secretBytes.length === 0) {
        fail(options, 'errors.shamir.invalid_secret');
    }
    if (!Number.isInteger(totalShares) || totalShares < 2 || totalShares > 255) {
        fail(options, 'errors.shamir.invalid_total');
    }
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > totalShares) {
        fail(options, 'errors.shamir.invalid_threshold');
    }

    var coefficients = getRandomBytes(secretBytes.length * Math.max(0, threshold - 1));
    var shares = [];
    for (var shareIndex = 0; shareIndex < totalShares; shareIndex++) {
        shares.push({ x: shareIndex + 1, y: new Uint8Array(secretBytes.length) });
    }

    for (var byteIndex = 0; byteIndex < secretBytes.length; byteIndex++) {
        var coeffs = [secretBytes[byteIndex]];
        for (var degree = 1; degree < threshold; degree++) {
            coeffs.push(coefficients[(degree - 1) * secretBytes.length + byteIndex]);
        }
        for (var sharePos = 0; sharePos < shares.length; sharePos++) {
            shares[sharePos].y[byteIndex] = evaluatePolynomial(coeffs, shares[sharePos].x);
        }
    }

    return shares;
}

function combineSecretShares(shares, options) {
    if (!Array.isArray(shares) || shares.length < 2) {
        fail(options, 'errors.shamir.need_more_shares');
    }
    var secretLength = -1;
    var seenX = new Set();
    for (var i = 0; i < shares.length; i++) {
        var share = shares[i];
        if (!share || !Number.isInteger(share.x) || share.x < 1 || share.x > 255 || !(share.y instanceof Uint8Array) || share.y.length === 0) {
            fail(options, 'errors.shamir.invalid_share');
        }
        if (seenX.has(share.x)) {
            fail(options, 'errors.shamir.duplicate_share');
        }
        seenX.add(share.x);
        if (secretLength === -1) {
            secretLength = share.y.length;
        } else if (share.y.length !== secretLength) {
            fail(options, 'errors.shamir.invalid_share');
        }
    }

    var secret = new Uint8Array(secretLength);
    for (var byteIndex = 0; byteIndex < secretLength; byteIndex++) {
        var accum = 0;
        for (var shareIndex = 0; shareIndex < shares.length; shareIndex++) {
            var basis = 1;
            var xi = shares[shareIndex].x;
            for (var otherIndex = 0; otherIndex < shares.length; otherIndex++) {
                if (otherIndex === shareIndex) continue;
                var xj = shares[otherIndex].x;
                basis = gfMul(basis, gfDiv(xj, xj ^ xi, options));
            }
            accum ^= gfMul(shares[shareIndex].y[byteIndex], basis);
        }
        secret[byteIndex] = accum & 0xff;
    }
    return secret;
}

function getDefaultChallengeKdf() {
    return {
        type: 'pbkdf2-sha256',
        hash: 'SHA-256',
        iterations: DEFAULTS.pbkdf2Iterations,
        dkLen: DEFAULTS.pbkdf2DkLen,
        saltLen: DEFAULTS.pbkdf2SaltLen,
    };
}

function cloneBox(box) {
    return {
        alg: 'aes-256-gcm',
        iv: String(box.iv || ''),
        ciphertext: String(box.ciphertext || ''),
    };
}

function makeQuestionShareAad(shareIndex) {
    return 'shardkey:v4:question-share:' + shareIndex;
}

function makeSecretBoxAad() {
    return 'shardkey:v4:secret-box';
}

function validateKdf(kdf, options) {
    if (!isPlainObject(kdf)) {
        fail(options, 'errors.challenge.kdf_invalid');
    }
    var type = String(kdf.type || '');
    var hash = String(kdf.hash || '');
    var iterations = Number(kdf.iterations);
    var dkLen = Number(kdf.dkLen);
    var saltLen = Number(kdf.saltLen);
    if (type !== 'pbkdf2-sha256' || hash !== 'SHA-256') {
        fail(options, 'errors.challenge.kdf_invalid');
    }
    if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 2000000) {
        fail(options, 'errors.challenge.kdf_iterations_invalid');
    }
    if (!Number.isInteger(dkLen) || dkLen < 16 || dkLen > 64) {
        fail(options, 'errors.challenge.kdf_dklen_invalid');
    }
    if (!Number.isInteger(saltLen) || saltLen < 8 || saltLen > 32) {
        fail(options, 'errors.challenge.kdf_saltlen_invalid');
    }
    return { type: type, hash: hash, iterations: iterations, dkLen: dkLen, saltLen: saltLen };
}

function validateSecretBox(secretBox, options) {
    if (!isPlainObject(secretBox)) {
        fail(options, 'errors.challenge.secret_box_invalid');
    }
    var alg = String(secretBox.alg || 'aes-256-gcm');
    if (alg !== 'aes-256-gcm') {
        fail(options, 'errors.challenge.secret_box_invalid');
    }
    var iv = String(secretBox.iv || '');
    var ciphertext = String(secretBox.ciphertext || '');
    var ivBytes = base64UrlToBytes(iv, options);
    var ciphertextBytes = base64UrlToBytes(ciphertext, options);
    if (ivBytes.length !== DEFAULTS.aesGcmIvBytes || ciphertextBytes.length <= 16) {
        fail(options, 'errors.challenge.secret_box_invalid');
    }
    return { alg: alg, iv: iv, ciphertext: ciphertext };
}

function validateQuestionAnswerBoxes(answerBoxes, shareIndex, options) {
    var limits = resolveDefaults(options);
    if (!Array.isArray(answerBoxes) || answerBoxes.length === 0 || answerBoxes.length > limits.maxAnswerVariants) {
        fail(options, 'errors.challenge.answer_variants_count_invalid');
    }
    return answerBoxes.map(function (box) {
        if (!isPlainObject(box)) {
            fail(options, 'errors.challenge.answer_box_invalid');
        }
        var normalized = cloneBox(box);
        var ivBytes = base64UrlToBytes(normalized.iv, options);
        var ciphertextBytes = base64UrlToBytes(normalized.ciphertext, options);
        if (ivBytes.length !== DEFAULTS.aesGcmIvBytes || ciphertextBytes.length <= 16) {
            fail(options, 'errors.challenge.answer_box_invalid');
        }
        return normalized;
    });
}

function validateChallengeData(challenge, options) {
    var limits = resolveDefaults(options);
    if (!isPlainObject(challenge)) {
        fail(options, 'errors.challenge.invalid_format');
    }
    if (String(challenge.type || 'challenge') !== 'challenge') {
        fail(options, 'errors.challenge.invalid_format');
    }
    var version = Number(challenge.version);
    if (!Number.isInteger(version) || version !== 4) {
        fail(options, 'errors.challenge.only_v4');
    }
    var threshold = Number(challenge.threshold);
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > limits.maxThreshold) {
        fail(options, 'errors.challenge.threshold_invalid');
    }
    var kdf = validateKdf(challenge.kdf, options);
    var questions = challenge.questions;
    if (!Array.isArray(questions) || questions.length < threshold || questions.length > limits.maxQuestions) {
        fail(options, 'errors.challenge.questions_list_invalid');
    }
    var usedIds = new Set();
    var usedShareIndices = new Set();
    var normalizedQuestions = questions.map(function (question, index) {
        if (!isPlainObject(question)) {
            fail(options, 'errors.challenge.question_field_invalid');
        }
        var id = Number(question.id);
        if (!Number.isInteger(id) || id < 0) {
            fail(options, 'errors.challenge.question_id_invalid');
        }
        if (usedIds.has(id)) {
            fail(options, 'errors.challenge.question_id_duplicate');
        }
        usedIds.add(id);

        var text = typeof question.text === 'string' ? question.text : '';
        var hint = typeof question.hint === 'string' ? question.hint : '';
        if (!text.trim() || text.length > limits.maxQuestionTextChars) {
            fail(options, 'errors.challenge.question_text_too_long');
        }
        if (hint.length > limits.maxHintChars) {
            fail(options, 'errors.challenge.question_hint_too_long');
        }

        var shareIndex = Number(question.shareIndex);
        if (!Number.isInteger(shareIndex) || shareIndex < 1 || shareIndex > 255) {
            fail(options, 'errors.challenge.question_share_index_invalid');
        }
        if (usedShareIndices.has(shareIndex)) {
            fail(options, 'errors.challenge.question_share_index_duplicate');
        }
        usedShareIndices.add(shareIndex);

        var salt = String(question.salt || '');
        var saltBytes = base64UrlToBytes(salt, options);
        if (saltBytes.length !== kdf.saltLen) {
            fail(options, 'errors.challenge.question_salt_invalid');
        }

        return {
            id: id,
            text: text,
            hint: hint,
            shareIndex: shareIndex,
            salt: salt,
            saltBytes: saltBytes,
            answerBoxes: validateQuestionAnswerBoxes(question.answerBoxes, shareIndex, options),
        };
    });

    var title = typeof challenge.title === 'string' ? challenge.title : translate(options, 'defaults.challenge_title');
    var description = typeof challenge.description === 'string' ? challenge.description : '';
    if (title.length > limits.maxTitleChars) {
        fail(options, 'errors.challenge.title_too_long');
    }
    if (description.length > limits.maxDescChars) {
        fail(options, 'errors.challenge.desc_too_long');
    }

    return {
        type: 'challenge',
        version: 4,
        title: title,
        description: description,
        threshold: threshold,
        kdf: kdf,
        secretBox: validateSecretBox(challenge.secretBox, options),
        questions: normalizedQuestions,
        createdAt: typeof challenge.createdAt === 'string' ? challenge.createdAt : '',
    };
}

function validateShardData(shard, options) {
    var limits = resolveDefaults(options);
    if (!isPlainObject(shard)) {
        fail(options, 'errors.shard.invalid_format');
    }
    if (String(shard.type || '') !== 'shard') {
        fail(options, 'errors.shard.type_invalid');
    }
    var version = Number(shard.version);
    if (!Number.isInteger(version) || version !== 4) {
        fail(options, 'errors.shard.only_v4');
    }
    var challengeId = String(shard.challengeId || '').toLowerCase();
    if (!/^[0-9a-f]{8,64}$/.test(challengeId)) {
        fail(options, 'errors.shard.challenge_id_invalid');
    }
    var totalShards = Number(shard.totalShards);
    if (!Number.isInteger(totalShards) || totalShards < 2 || totalShards > limits.maxShardCount) {
        fail(options, 'errors.shard.total_invalid', { max: limits.maxShardCount });
    }
    var threshold = Number(shard.threshold);
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > totalShards) {
        fail(options, 'errors.shard.threshold_invalid');
    }
    var shardIndex = Number(shard.shardIndex);
    if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= totalShards) {
        fail(options, 'errors.shard.index_invalid');
    }
    var shareIndex = Number(shard.shareIndex);
    if (!Number.isInteger(shareIndex) || shareIndex < 1 || shareIndex > 255) {
        fail(options, 'errors.shard.share_index_invalid');
    }
    var share = String(shard.share || '');
    var shareBytes = base64UrlToBytes(share, options);
    if (shareBytes.length !== DEFAULTS.secretKeyBytes) {
        fail(options, 'errors.shard.share_invalid');
    }
    return {
        type: 'shard',
        version: 4,
        challengeId: challengeId,
        shardIndex: shardIndex,
        totalShards: totalShards,
        threshold: threshold,
        shareIndex: shareIndex,
        share: share,
        shareBytes: shareBytes,
        secretBox: validateSecretBox(shard.secretBox, options),
    };
}

function normalizeShardCollection(shards, options) {
    if (!Array.isArray(shards) || shards.length === 0) {
        fail(options, 'errors.shard.collection_empty');
    }
    var normalized = shards.map(function (shard) {
        return validateShardData(shard, options);
    });
    var first = normalized[0];
    for (var i = 1; i < normalized.length; i++) {
        var shard = normalized[i];
        if (
            shard.challengeId !== first.challengeId ||
            shard.threshold !== first.threshold ||
            shard.totalShards !== first.totalShards ||
            shard.secretBox.iv !== first.secretBox.iv ||
            shard.secretBox.ciphertext !== first.secretBox.ciphertext
        ) {
            fail(options, 'errors.shard.mixed_collection');
        }
    }
    return normalized;
}

async function createEncryptedSecret(secretText, options) {
    var limits = resolveDefaults(options);
    var secretBytes = new TextEncoder().encode(String(secretText || ''));
    if (secretBytes.length > limits.maxSecretBytes) {
        fail(options, 'validation.secret.too_long', { max: limits.maxSecretBytes });
    }
    var keyBytes = getRandomBytes(limits.secretKeyBytes);
    var secretBox = await aesGcmEncrypt(keyBytes, secretBytes, makeSecretBoxAad(), options);
    return { keyBytes: keyBytes, secretBox: secretBox, secretBytes: secretBytes };
}

function normalizeQuestionInput(question, index, options) {
    var limits = resolveDefaults(options);
    if (!isPlainObject(question)) {
        fail(options, 'errors.question.invalid', { n: index + 1 });
    }
    var text = typeof question.question === 'string' ? question.question : typeof question.text === 'string' ? question.text : '';
    var hint = typeof question.hint === 'string' ? question.hint : '';
    if (!text.trim() || text.length > limits.maxQuestionTextChars) {
        fail(options, 'validation.question.text_required', { n: index + 1 });
    }
    if (hint.length > limits.maxHintChars) {
        fail(options, 'validation.question.hint_too_long', { n: index + 1, max: limits.maxHintChars });
    }
    var rawAnswers = Array.isArray(question.answers) ? question.answers : [question.answer];
    var answers = rawAnswers
        .map(function (answer) { return String(answer || '').trim(); })
        .filter(function (answer) { return !!answer; });
    if (answers.length === 0) {
        fail(options, 'errors.question.missing_answer', { n: index + 1 });
    }
    if (answers.length > limits.maxAnswerVariants) {
        fail(options, 'errors.question.too_many_answers', { n: index + 1, max: limits.maxAnswerVariants });
    }
    return {
        id: Number.isInteger(question.id) ? question.id : index,
        text: text,
        hint: hint,
        answers: answers,
    };
}

async function generateChallenge(secret, questions, threshold, title, description, options) {
    var limits = resolveDefaults(options);
    if (!String(secret || '').trim()) {
        fail(options, 'errors.secret.empty');
    }
    if (!Array.isArray(questions) || questions.length < threshold) {
        fail(options, 'errors.questions.less_than_threshold', { count: Array.isArray(questions) ? questions.length : 0, threshold: threshold });
    }
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > limits.maxThreshold) {
        fail(options, 'errors.threshold.min2');
    }
    if (questions.length > limits.maxQuestions) {
        fail(options, 'validation.questions.too_many', { max: limits.maxQuestions });
    }
    if (String(title || '').length > limits.maxTitleChars) {
        fail(options, 'validation.title.too_long', { max: limits.maxTitleChars });
    }
    if (String(description || '').length > limits.maxDescChars) {
        fail(options, 'validation.desc.too_long', { max: limits.maxDescChars });
    }
    var normalizedQuestions = questions.map(function (question, index) {
        return normalizeQuestionInput(question, index, options);
    });
    var kdf = getDefaultChallengeKdf();
    var created = await createEncryptedSecret(secret, options);
    var shares = splitSecretShares(created.keyBytes, normalizedQuestions.length, threshold, options);
    var questionEntries = [];
    if (options && typeof options.onProgress === 'function') {
        options.onProgress('progress.encrypting_shares', 0, normalizedQuestions.length);
    }
    for (var i = 0; i < normalizedQuestions.length; i++) {
        var q = normalizedQuestions[i];
        var saltBytes = getRandomBytes(kdf.saltLen);
        var answerBoxes = [];
        for (var j = 0; j < q.answers.length; j++) {
            var wrapKeyBytes = await deriveKeyBytesPBKDF2(q.answers[j], saltBytes, { kdf: kdf, translate: options && options.translate });
            answerBoxes.push(await aesGcmEncrypt(wrapKeyBytes, shares[i].y, makeQuestionShareAad(shares[i].x), options));
        }
        questionEntries.push({
            id: q.id,
            text: q.text,
            hint: q.hint,
            shareIndex: shares[i].x,
            salt: bytesToBase64Url(saltBytes),
            answerBoxes: answerBoxes,
        });
        if (options && typeof options.onProgress === 'function') {
            options.onProgress('progress.encrypting_shares', i + 1, normalizedQuestions.length);
        }
    }
    return {
        type: 'challenge',
        version: 4,
        title: title || translate(options, 'defaults.challenge_title'),
        description: description || translate(options, 'defaults.challenge_desc'),
        threshold: threshold,
        kdf: kdf,
        secretBox: created.secretBox,
        questions: questionEntries,
        createdAt: new Date().toISOString(),
    };
}

async function decryptQuestionShare(question, answer, challenge, options) {
    var keyBytes = await deriveKeyBytesPBKDF2(answer, question.saltBytes, { kdf: challenge.kdf, translate: options && options.translate });
    for (var i = 0; i < question.answerBoxes.length; i++) {
        try {
            var shareBytes = await aesGcmDecrypt(keyBytes, question.answerBoxes[i], makeQuestionShareAad(question.shareIndex), options);
            if (shareBytes.length !== DEFAULTS.secretKeyBytes) {
                continue;
            }
            return shareBytes;
        } catch (e) {
            if (!isExpectedDecryptFailure(e)) {
                throw e;
            }
        }
    }
    return null;
}

async function recoverSecret(challenge, answers, options) {
    var normalized = validateChallengeData(challenge, options);
    var answeredQuestions = normalized.questions.filter(function (question) {
        return answers && answers[question.id] !== undefined && String(answers[question.id] || '').trim() !== '';
    });
    var answeredCount = answeredQuestions.length;
    if (answeredCount < normalized.threshold) {
        return {
            success: false,
            error: translate(options, 'errors.solver.need_at_least', { threshold: normalized.threshold, answered: answeredCount }),
            answeredCount: answeredCount,
        };
    }
    var shares = [];
    for (var i = 0; i < answeredQuestions.length; i++) {
        var question = answeredQuestions[i];
        var shareBytes = await decryptQuestionShare(question, String(answers[question.id] || ''), normalized, options);
        if (shareBytes) {
            shares.push({ x: question.shareIndex, y: shareBytes });
        }
    }
    if (shares.length < normalized.threshold) {
        return {
            success: false,
            error: translate(options, 'errors.solver.verify_failed', { suffix: '' }),
            answeredCount: answeredCount,
        };
    }
    try {
        var secretBytes = await decryptSecretFromShares(
            shares,
            normalized.threshold,
            normalized.secretBox,
            makeSecretBoxAad(),
            Object.assign({}, options || {}, { assumeAllSharesValid: true })
        );
        return {
            success: true,
            secret: new TextDecoder().decode(secretBytes),
            answeredCount: answeredCount,
            usedCount: normalized.threshold,
        };
    } catch (e) {
        return {
            success: false,
            error: translate(options, 'errors.solver.verify_failed', { suffix: '' }),
            answeredCount: answeredCount,
        };
    }
}

async function generateShards(secret, totalShards, threshold, options) {
    var limits = resolveDefaults(options);
    if (!String(secret || '').trim()) {
        fail(options, 'errors.shard.secret_empty');
    }
    if (!Number.isInteger(totalShards) || totalShards < 2 || totalShards > limits.maxShardCount) {
        fail(options, 'errors.shard.total_invalid', { max: limits.maxShardCount });
    }
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > totalShards) {
        fail(options, threshold > totalShards ? 'errors.shard.threshold_gt_total' : 'errors.shard.threshold_invalid');
    }
    if (totalShards > 255) {
        fail(options, 'errors.shamir.invalid_total');
    }
    var created = await createEncryptedSecret(secret, options);
    var shares = splitSecretShares(created.keyBytes, totalShards, threshold, options);
    var challengeId = bytesToHex(getRandomBytes(8));
    var shards = [];
    if (options && typeof options.onProgress === 'function') {
        options.onProgress('progress.splitting_secret', 0, totalShards);
    }
    for (var i = 0; i < shares.length; i++) {
        shards.push({
            type: 'shard',
            version: 4,
            challengeId: challengeId,
            shardIndex: i,
            totalShards: totalShards,
            threshold: threshold,
            shareIndex: shares[i].x,
            share: bytesToBase64Url(shares[i].y),
            secretBox: cloneBox(created.secretBox),
        });
        if (options && typeof options.onProgress === 'function') {
            options.onProgress('progress.splitting_secret', i + 1, totalShards);
        }
    }
    return shards;
}

async function recoverFromShards(shards, options) {
    var normalized = normalizeShardCollection(shards, options);
    var first = normalized[0];
    if (normalized.length < first.threshold) {
        fail(options, 'errors.shard.need_more', { threshold: first.threshold, count: normalized.length });
    }
    var seenShardIndices = new Set();
    var seenShareIndices = new Set();
    var shares = [];
    for (var i = 0; i < normalized.length; i++) {
        var shard = normalized[i];
        if (seenShardIndices.has(shard.shardIndex) || seenShareIndices.has(shard.shareIndex)) {
            fail(options, 'errors.shard.duplicate_index', { index: shard.shardIndex + 1 });
        }
        seenShardIndices.add(shard.shardIndex);
        seenShareIndices.add(shard.shareIndex);
        shares.push({ x: shard.shareIndex, y: shard.shareBytes });
    }
    try {
        var secretBytes = await decryptSecretFromShares(shares, first.threshold, first.secretBox, makeSecretBoxAad(), options);
        return new TextDecoder().decode(secretBytes);
    } catch (e) {
        fail(options, 'errors.shard.recovery_failed');
    }
}

function packChallengeForShare(challenge, options) {
    var normalized = validateChallengeData(challenge, options);
    return [
        4,
        normalized.title,
        normalized.description,
        normalized.threshold,
        normalized.createdAt,
        normalized.kdf.iterations,
        normalized.kdf.dkLen,
        normalized.kdf.saltLen,
        [normalized.secretBox.iv, normalized.secretBox.ciphertext],
        normalized.questions.map(function (question) {
            return [
                question.id,
                question.text,
                question.hint,
                question.shareIndex,
                question.salt,
                question.answerBoxes.map(function (box) {
                    return [box.iv, box.ciphertext];
                }),
            ];
        }),
    ];
}

function unpackChallengeFromShare(payload, options) {
    if (!Array.isArray(payload) || payload.length !== 10 || payload[0] !== 4 || !Array.isArray(payload[9])) {
        fail(options, 'errors.link.invalid_data');
    }
    return validateChallengeData({
        type: 'challenge',
        version: 4,
        title: typeof payload[1] === 'string' ? payload[1] : translate(options, 'defaults.challenge_title'),
        description: typeof payload[2] === 'string' ? payload[2] : '',
        threshold: Number(payload[3]),
        createdAt: typeof payload[4] === 'string' ? payload[4] : '',
        kdf: {
            type: 'pbkdf2-sha256',
            hash: 'SHA-256',
            iterations: Number(payload[5]),
            dkLen: Number(payload[6]),
            saltLen: Number(payload[7]),
        },
        secretBox: {
            alg: 'aes-256-gcm',
            iv: payload[8] && payload[8][0],
            ciphertext: payload[8] && payload[8][1],
        },
        questions: payload[9].map(function (question) {
            if (!Array.isArray(question) || question.length !== 6 || !Array.isArray(question[5])) {
                fail(options, 'errors.link.invalid_data');
            }
            return {
                id: Number(question[0]),
                text: typeof question[1] === 'string' ? question[1] : '',
                hint: typeof question[2] === 'string' ? question[2] : '',
                shareIndex: Number(question[3]),
                salt: String(question[4] || ''),
                answerBoxes: question[5].map(function (box) {
                    if (!Array.isArray(box) || box.length !== 2) {
                        fail(options, 'errors.link.invalid_data');
                    }
                    return { alg: 'aes-256-gcm', iv: box[0], ciphertext: box[1] };
                }),
            };
        }),
    }, options);
}

function packShardForShare(shard, options) {
    var normalized = validateShardData(shard, options);
    return [
        4,
        normalized.challengeId,
        normalized.shardIndex,
        normalized.totalShards,
        normalized.threshold,
        normalized.shareIndex,
        normalized.share,
        [normalized.secretBox.iv, normalized.secretBox.ciphertext],
    ];
}

function unpackShardFromShare(payload, options) {
    if (!Array.isArray(payload) || payload.length !== 8 || payload[0] !== 4) {
        fail(options, 'errors.shard.link.invalid_data');
    }
    return validateShardData({
        type: 'shard',
        version: 4,
        challengeId: payload[1],
        shardIndex: Number(payload[2]),
        totalShards: Number(payload[3]),
        threshold: Number(payload[4]),
        shareIndex: Number(payload[5]),
        share: String(payload[6] || ''),
        secretBox: {
            alg: 'aes-256-gcm',
            iv: payload[7] && payload[7][0],
            ciphertext: payload[7] && payload[7][1],
        },
    }, options);
}

var api = {
    DEFAULTS: DEFAULTS,
    normalizeAnswer: normalizeAnswer,
    bytesToBase64Url: bytesToBase64Url,
    base64UrlToBytes: base64UrlToBytes,
    encodeJsonBase64Url: encodeJsonBase64Url,
    decodeJsonBase64Url: decodeJsonBase64Url,
    getDefaultChallengeKdf: getDefaultChallengeKdf,
    validateChallengeData: validateChallengeData,
    validateShardData: validateShardData,
    normalizeShardCollection: normalizeShardCollection,
    generateChallenge: generateChallenge,
    recoverSecret: recoverSecret,
    generateShards: generateShards,
    recoverFromShards: recoverFromShards,
    packChallengeForShare: packChallengeForShare,
    unpackChallengeFromShare: unpackChallengeFromShare,
    packShardForShare: packShardForShare,
    unpackShardFromShare: unpackShardFromShare,
};

global.ShardKeyCore = api;
})(typeof self !== 'undefined' ? self : window);
