#!/usr/bin/env python3
"""Encrypt the PFD Protocols seed data with the access code.

Reads the access code ONLY from the PFD_CODE environment variable —
never from a file, never from argv (both leak into logs/history).

    PFD_CODE='your-code-here' python3 tools/encrypt.py

Key derivation: PBKDF2-HMAC-SHA256, 210,000 iterations, random 16-byte salt.
Encryption: AES-256-GCM, random 12-byte IV.

Output: protocols.enc.json  { v, kdf, iter, salt, iv, ct }  (all base64)
Commit the output. The access code is never written anywhere.

To rotate the code later: run this again with the new code in PFD_CODE,
commit, push. Old code stops working immediately.
"""
import argparse, base64, hashlib, json, os, secrets, sys

ITERATIONS = 210_000
KEY_LEN = 32

def b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")

def main():
    ap = argparse.ArgumentParser(description="Encrypt protocols.json with the access code.")
    ap.add_argument("--in", dest="inp", default=None,
                    help="input protocols.json (default: ../seed/protocols.json)")
    ap.add_argument("--out", dest="out", default=None,
                    help="output file (default: protocols.enc.json next to repo root)")
    args = ap.parse_args()

    code = os.environ.get("PFD_CODE")
    if not code:
        sys.exit("ERROR: set the PFD_CODE environment variable first.\n"
                 "  PFD_CODE='...' python3 tools/encrypt.py")

    here = os.path.dirname(os.path.abspath(__file__))          # repo/tools
    repo_root = os.path.dirname(here)                          # repo/
    inp = args.inp or os.path.join(os.path.dirname(repo_root), "seed", "protocols.json")
    out = args.out or os.path.join(repo_root, "protocols.enc.json")

    with open(inp, "rb") as f:
        plaintext = f.read()

    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(12)
    key = hashlib.pbkdf2_hmac("sha256", code.encode("utf-8"), salt, ITERATIONS, KEY_LEN)
    ct = AESGCM(key).encrypt(iv, plaintext, None)

    blob = {
        "v": 1,
        "kdf": "PBKDF2-HMAC-SHA256",
        "iter": ITERATIONS,
        "salt": b64(salt),
        "iv": b64(iv),
        "ct": b64(ct),
    }
    with open(out, "w") as f:
        json.dump(blob, f)

    # sanity: confirm no protocol plaintext leaked into the output
    probe = b"Epinephrine"
    assert probe not in open(out, "rb").read(), "plaintext leak in output!"
    print(f"encrypted {len(plaintext)} bytes -> {out} ({os.path.getsize(out)} bytes)")

if __name__ == "__main__":
    main()
