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
- Fully local execution in browser (supports `file://`)

## Security Notes

- Shared data does not include the plaintext secret, correct answers, or answer hashes
- The threshold scheme prevents recovery with insufficient correct answers
- A checksum validates recovered results and avoids false unlocks

### Important limitations

- The published checksum can be used as an **offline guessing oracle** for low-entropy secrets (e.g. short PINs, phone numbers). Use a high-entropy secret (or add a random suffix) if you need real confidentiality.
- Answer verification uses fast SHA-256; weak/guessable answers are vulnerable to offline dictionary attacks.
- Mignotte/CRT is not Shamir secret sharing and does not provide perfect secrecy; do not treat this tool as a substitute for vetted cryptographic secret sharing.
