# ShardKey

[简体中文](README.zh-CN.md)

> Share a secret, and recover it only when enough people — or enough right answers — come together.

ShardKey is a browser-based threshold secret-sharing tool.

It runs entirely on the client side, works offline, and can be opened directly from `index.html` without a build step, backend service, or external dependency.

## Why ShardKey

Most secret-sharing tools are built for engineers, infrastructure, or formal key management.

ShardKey is intentionally lighter:

- Easy to open and use in a browser
- Easy to share as a link or JSON file
- Easy to explain to non-technical users
- Easy to run offline, including via `file://`

It is a good fit when you want a practical recovery flow, not a full-blown secrets platform.

## Two Recovery Modes

### `Classic Q&A`

Protect a secret behind threshold-style questions.

Example:

- 5 questions in total
- 3 correct answers required to unlock

This mode is useful when the secret should be recoverable by someone who knows enough context, shared history, or private facts.

### `Group Recovery`

Split one secret into `N` shards and recover it with at least `K` shards.

If `Classic Q&A` feels like passing a challenge, `Group Recovery` feels a bit like collecting enough Dragon Balls to summon the dragon: each shard is only a fragment, but once enough valid pieces are gathered, the secret comes back locally in the browser.

This mode is useful when trust is distributed across multiple people, devices, or storage locations.

## Highlights

- Fully local execution in the browser
- No external dependencies and no server required
- Works with `file://` and static hosting
- Self-contained links and JSON import/export
- Multiple acceptable answers per question
- Web Worker support for background processing
- Built-in UI languages: English, 日本語, 简体中文, 繁體中文

## Quick Start

Open the app directly:

```bash
open index.html
```

Or serve it as a static site:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Typical Use Cases

- Sharing emergency contact details behind personal questions
- Creating a lightweight break-glass recovery flow for a small team
- Distributing one secret across several people or devices
- Giving family or collaborators a recoverable secret without setting up backend infrastructure
- Packaging a recovery workflow into a single static page

## How It Works

At a high level, ShardKey combines familiar cryptographic building blocks into a browser-friendly recovery flow.

### 1. The secret is encrypted locally

Your secret is encrypted in the browser with `AES-256-GCM` using the Web Crypto API.

### 2. A random content key is split with threshold recovery

ShardKey generates a random key and splits it using `Shamir Secret Sharing` over `GF(256)`.

That means:

- Fewer than the threshold shares are not enough
- Any valid set of shares meeting the threshold can reconstruct the key

### 3. Each mode delivers shares differently

In `Classic Q&A`:

- Each answer is normalized before use
- The normalized answer is hardened with `PBKDF2-SHA-256`
- Default cost is `120,000` iterations per answer
- A correct answer unlocks one encrypted share

In `Group Recovery`:

- Each shard carries one threshold share
- Recovery succeeds after enough valid shards are collected

### 4. Recovery happens fully offline

Once enough valid shares are available, the original key is reconstructed locally and used to decrypt the secret.

Because the secret is wrapped with `AES-256-GCM`, recovery also depends on authenticated decryption succeeding: if the reconstructed key or recovery data is wrong, the integrity check fails and the secret is not accepted.

No server is needed during generation or recovery.

## Security Philosophy

ShardKey is designed as a practical offline recovery tool, not as a replacement for audited secret-management systems.

What it does well:

- Keeps processing local to the browser
- Avoids embedding the plaintext secret in shared payloads
- Uses modern browser cryptography primitives
- Supports threshold-based recovery without backend coordination

What you should keep in mind:

- Weak answers are still vulnerable to offline guessing
- Q&A mode is only as strong as the answers people choose
- High-value or long-term secrets are better handled by a password manager or audited secret-sharing tools
- If a share link becomes too large for practical use, JSON export is the better choice

## Practical Security Tips

- Prefer strong secrets, especially for long-lived or high-impact use cases
- If needed, append a random suffix to the secret to increase entropy
- Prefer higher thresholds when recovery should require broader agreement
- Keep alternative answers minimal and non-obvious, since every accepted variant slightly widens the guessing surface
- Use JSON export when links become too large to share reliably

## What ShardKey Is Not

ShardKey is not:

- A hosted secrets manager
- A replacement for audited enterprise key custody
- A guarantee against poor answer choices
- A long-term vault for high-value secrets

If you need strong operational controls, access logs, rotation workflows, or hardware-backed key protection, use a dedicated system.

## Practical Limits

Current built-in limits include:

- Secret length: up to `1024` bytes
- Questions: up to `64`
- Threshold: from `2` up to `64`
- Questions must be greater than or equal to the threshold
- Total shards: up to `20`
- Answer variants per question: up to `16`

## FAQ

### Are answers case-sensitive?

No. Answers are normalized before derivation, including case folding and whitespace cleanup, so simple formatting differences are less likely to break recovery.

### Can one question have multiple valid answers?

Yes. Each question can include multiple acceptable answers, and any one of them counts as correct.

### Does the shared payload contain the plaintext secret?

No. Shared links and JSON exports are designed to carry encrypted recovery data, not the plaintext secret itself, and they do not include the correct answers or answer hashes.

### When should I use JSON instead of links?

Use JSON when the shared data becomes too large for a practical URL, or when file-based sharing is easier for your workflow.

### Can I run it without a server?

Yes. ShardKey supports direct browser opening via `file://` as well as static hosting.

## Language Support

Use the top-right language menu to switch UI language.

You can also force a language with `?lang=`:

- `en`
- `ja`
- `zh-CN`
- `zh-TW`

The selected language is stored in `localStorage`.

## Development

ShardKey is a small static web app. There is no build pipeline for normal development.

Project files:

- `index.html` — app shell
- `css/style.css` — UI styles
- `js/core.js` — crypto and share/recovery core
- `js/app.js` — browser UI logic
- `js/i18n.js` — translations and language handling
- `js/worker.js` — background worker
- `scripts/smoke.mjs` — smoke tests

Validation commands:

```bash
node --check js/core.js
node --check js/app.js
node --check js/i18n.js
node --check js/worker.js
node scripts/smoke.mjs
```

## Deployment

Because the app is static, you can deploy it to any static hosting environment, or simply distribute the files directly.

Examples:

- GitHub Pages
- Cloudflare Pages
- Vercel static hosting
- Internal static file servers
- Local files shared inside an organization

## License

Released under the `MIT` License. See `LICENSE`.
