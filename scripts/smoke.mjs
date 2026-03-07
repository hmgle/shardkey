import fs from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const DOMExceptionShim = globalThis.DOMException || class DOMException extends Error {
  constructor(message, name = 'DOMException') {
    super(message);
    this.name = name;
  }
};

async function loadCore() {
  const source = await fs.readFile(new URL('../js/core.js', import.meta.url), 'utf8');
  const context = {
    self: {},
    window: {},
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    DOMException: DOMExceptionShim,
    console,
    Set,
    Uint8Array,
    Array,
    Object,
    Number,
    String,
    Date,
    Math,
    JSON,
    RegExp,
  };
  context.self = context;
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'js/core.js' });
  return context.ShardKeyCore;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTest(name, fn) {
  await fn();
  console.log(`ok - ${name}`);
}

const Core = await loadCore();

await runTest('classic challenge generate/recover', async () => {
  const challenge = await Core.generateChallenge(
    'secret-123',
    [
      { question: 'q1', answers: ['a1'] },
      { question: 'q2', answers: ['a2'] },
      { question: 'q3', answers: ['a3'] },
    ],
    2,
    'title',
    'desc'
  );

  const success = await Core.recoverSecret(challenge, { 0: 'a1', 2: 'a3' });
  const failure = await Core.recoverSecret(challenge, { 0: 'wrong', 2: 'a3' });
  const insufficient = await Core.recoverSecret(challenge, { 1: 'a2' });

  assert(success.success === true, 'expected successful recovery');
  assert(success.secret === 'secret-123', 'unexpected recovered secret');
  assert(failure.success === false, 'expected wrong answer recovery failure');
  assert(insufficient.success === false, 'expected insufficient-answer failure');
});

await runTest('challenge pack/unpack', async () => {
  const challenge = await Core.generateChallenge(
    'packed-secret',
    [
      { question: 'alpha', answers: ['one'] },
      { question: 'beta', answers: ['two'] },
    ],
    2,
    'pack-title',
    'pack-desc'
  );

  const packed = Core.packChallengeForShare(challenge);
  const unpacked = Core.unpackChallengeFromShare(packed);
  const result = await Core.recoverSecret(unpacked, { 0: 'one', 1: 'two' });

  assert(result.success === true, 'packed challenge should recover');
  assert(result.secret === 'packed-secret', 'packed challenge recovered wrong secret');
});

await runTest('group shards generate/recover', async () => {
  const shards = await Core.generateShards('group-secret', 5, 3);
  const recovered = await Core.recoverFromShards([shards[0], shards[2], shards[4]]);
  assert(recovered === 'group-secret', 'group recovery returned wrong secret');
});

await runTest('shard pack/unpack', async () => {
  const shards = await Core.generateShards('packed-group-secret', 4, 2);
  const packed = Core.packShardForShare(shards[1]);
  const unpacked = Core.unpackShardFromShare(packed);
  const recovered = await Core.recoverFromShards([shards[0], unpacked]);
  assert(recovered === 'packed-group-secret', 'packed shard recovered wrong secret');
});

await runTest('recovery still succeeds with enough good shards beyond 1024 combinations', async () => {
  const shards = await Core.generateShards('combo-secret', 14, 7);
  const bad = shards.slice(0, 7).map((shard, index) => ({
    ...shard,
    shardIndex: index,
    share: Core.bytesToBase64Url(webcrypto.getRandomValues(new Uint8Array(32))),
  }));
  const good = shards.slice(7).map((shard, index) => ({
    ...shard,
    shardIndex: index + 7,
  }));
  const recovered = await Core.recoverFromShards(bad.concat(good));
  assert(recovered === 'combo-secret', 'expected exhaustive shard recovery to succeed');
});

console.log('All smoke tests passed.');
