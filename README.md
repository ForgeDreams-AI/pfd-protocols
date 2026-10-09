# PFD Protocols

Private, searchable Phoenix Fire Department EMS protocol reference for paramedics.
Mobile-first, built for use on scene. **Zero backend, zero accounts, zero cost.**

**Privacy architecture (read this before touching anything):**
- The repo contains NO readable protocol content. `protocols.enc.json` is
  AES-256-GCM ciphertext — without the access code it is random noise.
- The access code unlocks the app in the browser: the key is derived with
  PBKDF2-HMAC-SHA256 (210,000 iterations) via WebCrypto and the protocols are
  decrypted in memory only.
- The derived key is kept in tab-scoped `sessionStorage`. Closing the tab
  re-locks the app. The code itself is never stored anywhere, and the
  plaintext protocols never touch `localStorage` or disk.
- The seed file (`../seed/protocols.json`, gitignored) lives only on the
  maintainer's machine.

## Rotating the access code

One command. The code comes from the `PFD_CODE` env var — never a file,
never a shell history entry:

```sh
cd repo
PFD_CODE='new-code-here' python3 tools/encrypt.py
git add protocols.enc.json && git commit -m "Rotate access code" && git push
```

The old code stops working the moment the new blob is live.

## Updating protocol content

1. Re-extract / edit `../seed/protocols.json` (167 cards, schema unchanged).
2. Re-run the encrypt command above with the current code.
3. Commit + push.

## Serving

Any static host works (GitHub Pages: Settings → Pages → Deploy from branch
`main`, `/`). Live: https://forgedreams-ai.github.io/pfd-protocols/

A scheduled check reviews the department SharePoint treatment guidelines for
updates every 30 days.
