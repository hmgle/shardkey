importScripts('core.js');

(function () {
'use strict';

var messages = {};

function t(key, params) {
    var template = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : key;
    var out = String(template);
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

var LIMITS = Object.assign({}, ShardKeyCore.DEFAULTS);

function coreOptions(onProgress) {
    return {
        translate: t,
        limits: LIMITS,
        onProgress: typeof onProgress === 'function' ? onProgress : null,
    };
}

self.onmessage = async function (event) {
    var data = event.data || {};
    messages = data.messages || {};
    try {
        if (data.type === 'generate') {
            postMessage({
                type: 'result',
                result: await ShardKeyCore.generateChallenge(
                    data.payload.secret,
                    data.payload.questions,
                    data.payload.threshold,
                    data.payload.title,
                    data.payload.description,
                    coreOptions(function (msgKey, done, total) {
                        postMessage({ type: 'progress', msg: t(msgKey), done: done, total: total });
                    })
                ),
            });
            return;
        }
        if (data.type === 'recover') {
            postMessage({
                type: 'result',
                result: await ShardKeyCore.recoverSecret(data.payload.challenge, data.payload.answers || {}, coreOptions()),
            });
            return;
        }
        if (data.type === 'generate-shards') {
            postMessage({
                type: 'result',
                result: await ShardKeyCore.generateShards(
                    data.payload.secret,
                    data.payload.totalShards,
                    data.payload.threshold,
                    coreOptions(function (msgKey, done, total) {
                        postMessage({ type: 'progress', msg: t(msgKey), done: done, total: total });
                    })
                ),
            });
            return;
        }
        if (data.type === 'recover-shards') {
            postMessage({
                type: 'result',
                result: await ShardKeyCore.recoverFromShards(data.payload.shards || [], coreOptions()),
            });
            return;
        }
        throw new Error('Unknown worker task');
    } catch (e) {
        postMessage({ type: 'error', error: e && e.message ? e.message : String(e) });
    }
};
})();
