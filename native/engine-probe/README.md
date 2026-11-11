# wMix engine-probe (Windows x64)

Standalone libobs life test. Does **not** start OBS Studio or integrate Tauri.

## Prerequisites
- Windows 10/11 x64; Visual Studio 2022 C++ tools, CMake.
- Installed OBS Studio x64, plus **matching-version** OBS source headers.
- Check the installed OBS version in OBS Studio > Help > About, and check out the **same tag** in obsproject/obs-studio. Check API signatures in that tag's `libobs/obs.h` and `libobs/obs-properties.h`.
- Some OBS header releases require generated headers from the corresponding OBS build tree; supply `OBS_BUILD_HEADERS` if needed. **Do not mix OBS releases.**
- This probe dynamically resolves functions from the installed libobs.dll to avoid requiring an import .lib; this does **not** make mismatched headers safe.

## Build (Developer PowerShell for VS 2022)
```powershell
cmake -S native/engine-probe -B native/engine-probe/build -G "Visual Studio 17 2022" -A x64 -DOBS_HEADERS="C:/src/obs-studio/libobs" -DOBS_BUILD_HEADERS="C:/src/obs-build/config"
cmake --build native/engine-probe/build --config Release
& "native/engine-probe/build/Release/engine-probe.exe" --obs-dir "C:\Program Files\obs-studio"
```

Expected **format only** (NOT a real execution log): `[startup] OK`, `[video] video OK`, `[audio] audio OK`, `[modules] discovered=N loaded=M`, `[webcams] count=K`.

The executable prints runtime libobs version, paths, error codes and webcam name/id. If D3D11 fails, check GPU/driver and `data/libobs` shaders. If module loading fails, check `obs-plugins/64bit` and `data/obs-plugins/%module%`. This probe does not yet report per-plugin failure reasons individually; consult libobs logging for that diagnostic.

No Windows/MSVC/OBS runtime was available to the authoring environment: build, ABI compatibility, enumeration and leak behavior remain **unverified**. No invented execution log is supplied. The actual runtime log must be captured on a Windows host.
