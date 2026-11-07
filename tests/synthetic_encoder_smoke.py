#!/usr/bin/env python3
"""Integration smoke test: real FFmpeg encoder -> local FLV file -> ffprobe.

No stream key, internet, or external RTMP ingest server is required.
This tests codecs and muxing, NOT RTMP network delivery or Program capture.
"""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

def main():
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        print("SKIP: FFmpeg/ffprobe unavailable", file=sys.stderr)
        return 2

    with tempfile.TemporaryDirectory(prefix="wmix-encoder-") as directory:
        output = pathlib.Path(directory) / "synthetic.flv"
        command = [
            ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=15",
            "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
            "-t", "2", "-c:v", "libx264", "-preset", "ultrafast",
            "-pix_fmt", "yuv420p", "-b:v", "700k",
            "-c:a", "aac", "-b:a", "96k", "-ar", "48000",
            "-f", "flv", str(output)
        ]
        encoded = subprocess.run(command, capture_output=True, text=True, timeout=40)
        if encoded.returncode:
            print("Encoder failed (output sanitized).", file=sys.stderr)
            return 1
        probe = subprocess.run([
            ffprobe, "-v", "error", "-show_entries",
            "stream=codec_type,codec_name", "-of", "json", str(output)
        ], capture_output=True, text=True, timeout=15)
        if probe.returncode:
            print("ffprobe failed.", file=sys.stderr)
            return 1
        streams = json.loads(probe.stdout)["streams"]
        found = {(stream["codec_type"], stream["codec_name"]) for stream in streams}
        expected = {("video", "h264"), ("audio", "aac")}
        if not expected.issubset(found) or output.stat().st_size < 1024:
            print("Unexpected output streams or empty FLV file.", file=sys.stderr)
            return 1
        print("PASS: FFmpeg encoded H.264 video + AAC audio into FLV.")
        return 0

if __name__ == "__main__":
    sys.exit(main())
