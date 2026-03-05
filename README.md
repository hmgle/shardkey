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

### Multiple acceptable answers (per question)

When creating a challenge, each question can accept multiple valid answers: separate variants with newlines or `|`. Examples:

- `42|fourty two` (typo example)
- `42|forty two`
- Put `42` and `四十二` on separate lines

## Technical Notes

- Pure HTML/CSS/JavaScript, no external dependencies
- BigInt-based large integer arithmetic
- SHA-256 via Web Crypto API
- Answers are hardened via PBKDF2 (per-question salt)
- Fully local execution in browser (supports `file://`)

## Security Notes

- Shared data does not include the plaintext secret, correct answers, or answer hashes
- The threshold scheme prevents recovery with insufficient correct answers
- The recovered secret is validated by an embedded checksum and avoids false unlocks

### Important limitations

- Weak/guessable answers are vulnerable to offline dictionary attacks. PBKDF2 hardening slows guessing down, but does not prevent it.
- Allowing multiple valid answers per question reduces the difficulty of “guessing any acceptable variant”; keep variants minimal and non-obvious.
- Use a high-entropy secret if you need real confidentiality (e.g. append a random suffix), and prefer higher thresholds.
- Mignotte/CRT is not Shamir secret sharing and does not provide perfect secrecy; do not treat this tool as a substitute for vetted cryptographic secret sharing.
