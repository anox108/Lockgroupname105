#!/usr/bin/env python3
# send_with_token.py

import sys
import time
import requests
import signal
import os
from datetime import datetime

running = True

def handle_signal(sig, frame):
    global running
    print(f"\n[+] Signal {sig} mila, band ho raha hu...")
    running = False

signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)

def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def load_lines(filename):
    try:
        with open(filename, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    except:
        return []

def write_pid(convo_id):
    pid = os.getpid()
    fname = f"send_with_token_{convo_id}.pid"
    with open(fname, "w", encoding="utf-8") as pf:
        pf.write(str(pid))
    print(f"[{now()}] PID file bana: {fname} (pid={pid})")

def remove_pid(convo_id):
    fname = f"send_with_token_{convo_id}.pid"
    if os.path.exists(fname):
        os.remove(fname)
        print(f"[{now()}] PID file hata diya.")

def send_message(token, convo_id, message):
    url = f"https://graph.facebook.com/v17.0/t_{convo_id}/"
    payload = {"access_token": token, "message": message}
    try:
        r = requests.post(url, json=payload, timeout=15)
        print(f"[{now()}] {token[:6]} -> {message[:50]}... | {r.status_code}")
        return r.ok
    except Exception as e:
        print(f"[{now()}] Error: {e}")
        return False

def uid_mode(convo_id, tokens):
    for t in tokens:
        if not running: break
        send_message(t, convo_id, "✅ UID Test msg")
        time.sleep(1)

def rkb_mode(convo_id, tokens, messages, name):
    speed = 40   # <-- fixed 40 seconds
    if not tokens or not messages:
        print(f"[{now()}] Token/Messages missing.")
        return
    idx = 0
    while running:
        token = tokens[idx % len(tokens)]
        line = messages[idx % len(messages)]
        msg = f"{name} {line}"
        send_message(token, convo_id, msg)
        idx += 1
        slept = 0
        while running and slept < speed:
            time.sleep(1)
            slept += 1

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 send_with_token.py <uid|rkb> <convo_id> [name]")
        return

    mode = sys.argv[1].lower()
    convo = sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else "rkb"

    tokens = load_lines("tokennum.txt")
    messages = load_lines("np.txt")

    write_pid(convo)
    try:
        if mode == "uid":
            uid_mode(convo, tokens)
        elif mode == "rkb":
            rkb_mode(convo, tokens, messages, name)
        else:
            print(f"[{now()}] Galat mode: {mode}")
    finally:
        remove_pid(convo)
        print(f"[{now()}] Worker exit ho gaya.")

if __name__ == "__main__":
    main()
