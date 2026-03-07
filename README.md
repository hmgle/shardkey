# ShardKey

[中文](README.zh-CN.md)

ShardKey is a browser-only offline secret-sharing helper with two modes:

- `Classic Q&A`: define questions, answers, and a threshold; the secret unlocks only when enough answers are correct.
- `Group Recovery`: split one secret into `N` shard links/JSON payloads, then recover it after collecting at least `K` shards.

Think of it as a shareable offline challenge format, not as a full-strength secret-sharing system.

## Quick Start

Open `index.html` directly:

```bash
open index.html
```

Or run a local static server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Language

- Use the top-right language selector to switch UI language (English / 日本語 / 简体中文 / 繁體中文).
- You can also force the UI language via `?lang=` (supported: `en`, `ja`, `zh-CN`, `zh-TW`). The preference is saved in `localStorage`.

## Core Features

1. Create a challenge: set a secret, questions/answers, and threshold.
2. Share a challenge: copy a compact self-contained link or export JSON.
3. Solve a challenge: import link/JSON, answer questions, and unlock.

### Group recovery mode

1. Switch to `Group Recovery`.
2. Enter the secret, total shard count `N`, and threshold `K`.
3. Generate shard links and send each shard to a different person or storage location.
4. On the recovery side, open any shard link or import shard JSON, then paste additional shards until at least `K` are present.
5. Recover the secret locally in the browser.

### Multiple acceptable answers (per question)

When creating a challenge, each question can accept multiple valid answers: click “+ 添加备选答案” (Add alternative answer) to add more answer inputs. Any one of them being correct counts (case-insensitive).

Answer text can contain any characters (including `|`). The app no longer uses separators to split multiple answers.

## Technical Notes

- Pure HTML/CSS/JavaScript, no external dependencies
- AES-256-GCM via Web Crypto API encrypts the shared secret
- Shamir Secret Sharing over GF(256) splits a random content key into threshold shares
- Answers are hardened via PBKDF2 (per-question salt)
- In `Classic Q&A`, each correct answer decrypts one encrypted Shamir share
- Share links use a compact packed format to reduce URL length for forwarding and reposting
- Fully local execution in browser (supports `file://`)
- Uses a Web Worker when available to keep generation and recovery off the main UI thread

## Security Notes

- ShardKey is positioned as an offline Q&A unlocker, not as a replacement for audited cryptographic secret-sharing systems.
- Shared data does not include the plaintext secret, correct answers, or answer hashes
- The threshold logic is meant to gate offline unlocking, not to protect high-value secrets like a password vault
- The secret is recovered only after enough shares reconstruct the AES key and the AEAD check succeeds

### Important limitations

- Weak/guessable answers are vulnerable to offline dictionary attacks. PBKDF2 hardening slows guessing down, but does not prevent it.
- Allowing multiple valid answers per question reduces the difficulty of “guessing any acceptable variant”; keep variants minimal and non-obvious.
- For robustness, the app enforces practical size limits (currently: secret ≤ 1024 bytes, questions ≤ 64, threshold ≤ 64). Larger challenges should be split up.
- Use a high-entropy secret if you need real confidentiality (e.g. append a random suffix), and prefer higher thresholds.
- `Classic Q&A` still depends on answer strength. A weak answer can let an attacker recover one encrypted share offline.
- If you need strong cryptographic protection, use an audited secret-sharing system or a password manager instead of relying on challenge questions alone.
