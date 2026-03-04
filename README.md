# ShardKey

[中文](README.zh-CN.md)

ShardKey is a browser-only tool for unlocking secrets by answering questions.
You define questions, answers, and a threshold (minimum correct answers required). The app generates a shareable link or JSON challenge, and the secret can only be recovered when enough answers are correct.

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

## Core Features

1. Create a challenge: set a secret, questions/answers, and threshold.
2. Share a challenge: copy a self-contained link or export JSON.
3. Solve a challenge: import link/JSON, answer questions, and unlock.

## Technical Notes

- Pure HTML/CSS/JavaScript, no external dependencies
- BigInt-based large integer arithmetic
- SHA-256 via Web Crypto API
- v3 challenges harden answers via PBKDF2 (per-question salt)
- Fully local execution in browser (supports `file://`)

## Security Notes

- Shared data does not include the plaintext secret, correct answers, or answer hashes
- The threshold scheme prevents recovery with insufficient correct answers
- A checksum validates recovered results and avoids false unlocks

### Important limitations

- Legacy (v1/v2) challenges publish a checksum that can be used as an **offline guessing oracle** for low-entropy secrets (e.g. short PINs, phone numbers). v3 avoids publishing this, but you should still use a high-entropy secret for real confidentiality.
- Legacy (v1/v2) challenges use fast SHA-256 for answers; weak/guessable answers are vulnerable to offline dictionary attacks. v3 uses PBKDF2 hardening, but weak answers can still be guessed given enough time/resources.
- Mignotte/CRT is not Shamir secret sharing and does not provide perfect secrecy; do not treat this tool as a substitute for vetted cryptographic secret sharing.
