#!/usr/bin/env python3
"""Loopback RTMP transport smoke test with synthetic H.264/AAC.

Uses FFmpeg as a one-client RTMP listener. Does not test RTMPS, reconnection,
the Tauri command or the real Program media bridge.
"""
import json
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time

def main():
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        print("FFmpeg and ffprobe required", file=sys.stderr)
        return 1
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="wmix-rtmp-") as directory:
        output = pathlib.Path(directory) / "received.flv"
        url = f"rtmp://127.0.0.1:{port}/live/test"
        receiver = subprocess.Popen([
            ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "quiet", "-y",
            "-listen", "1", "-i", url, "-t", "2", "-c", "copy", str(output)
        ], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            time.sleep(0.6)
            if receiver.poll() is not None:
                raise RuntimeError("RTMP listener failed to start")
            sender = subprocess.run([
                ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "quiet",
                "-re", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=10",
                "-re", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
                "-t", "2", "-c:v", "libx264", "-preset", "ultrafast",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-f", "flv", url
            ], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
               stderr=subprocess.DEVNULL, timeout=30)
            if sender.returncode != 0:
                raise RuntimeError("RTMP sender failed")
            receiver.wait(timeout=12)
            if not output.exists() or output.stat().st_size < 1024:
                raise RuntimeError("RTMP receiver did not produce media")
            probe = subprocess.run([
                ffprobe, "-v", "error", "-show_entries",
                "stream=codec_type,codec_name", "-of", "json", str(output)
            ], capture_output=True, text=True, timeout=10, check=True)
            streams = json.loads(probe.stdout)["streams"]
            codecs = {(s["codec_type"], s["codec_name"]) for s in streams}
            if not {("video", "h264"), ("audio", "aac")}.issubset(codecs):
                raise RuntimeError("RTMP receiver missing video or audio")
            print("PASS: local RTMP receiver got H.264 video and AAC audio")
            return 0
        except (RuntimeError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
            print(f"FAIL: {type(exc).__name__}: {exc}", file=sys.stderr)
            return 1
        finally:
            if receiver.poll() is None:
                receiver.kill()
            receiver.wait(timeout=10)

if __name__ == "__main__":
    sys.exit(main())
