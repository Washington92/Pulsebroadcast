#!/usr/bin/env python3
"""MVP gate: WebM (VP8/Opus) fragmented stdin -> FFmpeg -> H264/AAC FLV.
This validates the bridge's codec/container pipeline, not the Tauri IPC or
actual browser camera/microphone capture.
"""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile


def main():
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        print("FAIL: ffmpeg/ffprobe missing", file=sys.stderr)
        return 1
    with tempfile.TemporaryDirectory(prefix="wmix-program-mvp-") as temp:
        directory = pathlib.Path(temp)
        source = directory / "program.webm"
        result = directory / "program.flv"
        create = subprocess.run([
            ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=15",
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
            "-t", "3", "-c:v", "libvpx", "-b:v", "400k",
            "-c:a", "libopus", "-b:a", "64k", "-f", "webm", str(source)
        ], capture_output=True, timeout=40)
        if create.returncode:
            print(create.stderr.decode(errors="replace"), file=sys.stderr)
            return 1
        encoder = subprocess.Popen([
            ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
            "-f", "webm", "-i", "pipe:0",
            "-map", "0:v:0", "-map", "0:a:0?",
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-b:v", "600k", "-c:a", "aac", "-b:a", "128k",
            "-ar", "48000", "-f", "flv", str(result)
        ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            with source.open("rb") as media:
                while chunk := media.read(8192):
                    encoder.stdin.write(chunk)
            encoder.stdin.close()
            errors = encoder.stderr.read()
            status = encoder.wait(timeout=30)
            if status:
                raise RuntimeError("Encoder failed: " + errors.decode(errors="replace"))
            if result.stat().st_size < 2048:
                raise RuntimeError("Encoded output too small")
            probe = subprocess.run([
                ffprobe, "-v", "error", "-show_entries",
                "stream=codec_type,codec_name", "-of", "json", str(result)
            ], capture_output=True, text=True, check=True, timeout=15)
            codecs = {(s["codec_type"], s["codec_name"]) for s in json.loads(probe.stdout)["streams"]}
            if not {("video", "h264"), ("audio", "aac")}.issubset(codecs):
                raise RuntimeError(f"Expected H264/AAC, got {codecs}")
            print("PASS: fragmented WebM Program input transcoded to H264/AAC FLV")
            return 0
        finally:
            if encoder.poll() is None:
                encoder.kill()
            encoder.wait(timeout=10)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
