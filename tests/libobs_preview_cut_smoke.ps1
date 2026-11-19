param(
    [string]$ObsRoot = 'C:\Program Files\obs-studio',
    [switch]$CompileOnly
)

$ErrorActionPreference = 'Stop'
if (-not $CompileOnly) {
    $ObsRoot = (Resolve-Path -LiteralPath $ObsRoot).Path
    $dll = Join-Path $ObsRoot 'bin/64bit/obs.dll'
    $version = (Get-Item -LiteralPath $dll).VersionInfo.ProductVersion
    if ($version -notmatch '^33\.0\.1(?:$|[^0-9])') {
        throw "This probe uses the OBS 33.0.1 ABI. Found: $version"
    }
}

# Run with PowerShell 7 x64 in a separate process from wMix.
Add-Type -TypeDefinition @'
using System;
using System.Threading;
using System.Runtime.InteropServices;
using System.IO;
public static class ObsDisplayProbe {
 [DllImport("kernel32",CharSet=CharSet.Unicode)] static extern IntPtr LoadLibraryExW(string p,IntPtr r,uint f);
 [DllImport("kernel32")] static extern IntPtr GetProcAddress(IntPtr h,string n);
 [DllImport("kernel32")] static extern bool FreeLibrary(IntPtr h);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return:MarshalAs(UnmanagedType.I1)] delegate bool Start(string s,IntPtr p,IntPtr q);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Stop();
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void PathAdd(string s);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Reset(ref Video v);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate uint Frames();
 [StructLayout(LayoutKind.Sequential)] struct Video {
 public IntPtr module;
 public uint num,den,bw,bh,ow,oh;
 public int format;
 public uint adapter;
 [MarshalAs(UnmanagedType.I1)] public bool gpu;
 public int cs,range,scale;
 }
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return:MarshalAs(UnmanagedType.I1)] delegate bool ResetAudio(ref Audio audio);
 [StructLayout(LayoutKind.Sequential)] struct Audio { public uint samplesPerSec; public int speakers; }
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void AddModulePath(string binary,string data);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void LoadModules();
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr Create(string id,string name,IntPtr settings,IntPtr hotkeys);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Output(uint channel,IntPtr source);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Release(IntPtr source);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Frame(IntPtr state,IntPtr video);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Connect(IntPtr conversion,Frame callback,IntPtr state);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Disconnect(Frame callback,IntPtr state);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowExW(uint ex,string cls,string title,uint style,int x,int y,int w,int h,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr param);
 [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr hwnd);
 // OBS 33.0.1 gs_init_data: gs_window(hwnd), cx, cy, num_backbuffers, format, zsformat, adapter.
 [StructLayout(LayoutKind.Sequential)] struct DisplayInfo { public IntPtr hwnd; public uint w,h,buffers; public int format,depth; public uint adapter; }
 // OBS 33.0.1: obs_display_create(gs_init_data*, uint32_t background_color).
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr DisplayCreate(ref DisplayInfo data,uint backgroundColor);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DisplayBackground(IntPtr display,uint color);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void SourceVisibility(IntPtr source);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Draw(IntPtr param,uint width,uint height);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void RegisterDraw(IntPtr display,Draw callback,IntPtr param);
 static T Get<T>(IntPtr h,string n) where T:Delegate => Marshal.GetDelegateForFunctionPointer<T>(GetProcAddress(h,n));
 public static void Run(string root){

 var h=LoadLibraryExW(root+@"\bin\64bit\obs.dll",IntPtr.Zero,0x1100);
 if(h==IntPtr.Zero)throw new Exception("LoadLibrary failed");
 try {
 if(!Get<Start>(h,"obs_startup")("pt-BR",IntPtr.Zero,IntPtr.Zero))throw new Exception("startup failed");
 try {
 Get<PathAdd>(h,"obs_add_data_path")(root+@"\data\libobs/");
 // obs_video_info.graphics_module expects the module identifier, not a DLL path.
 var module=Marshal.StringToCoTaskMemUTF8("libobs-d3d11");
 try {
 var v=new Video{module=module,num=30,den=1,bw=1280,bh=720,ow=1280,oh=720,format=2,gpu=true,cs=2,range=1};
 int rc=Get<Reset>(h,"obs_reset_video")(ref v);
 Console.WriteLine("obs_reset_video="+rc);
 if(rc!=0)throw new Exception("Video reset failed");
 var audio=new Audio{samplesPerSec=48000,speakers=2}; // SPEAKERS_STEREO
 if(!Get<ResetAudio>(h,"obs_reset_audio")(ref audio)) throw new Exception("Audio reset failed");
 string pluginBin=root+@"\obs-plugins\64bit";
 string pluginData=root+@"\data\obs-plugins\%module%";
 if(!Directory.Exists(pluginBin)||!Directory.Exists(root+@"\data\obs-plugins"))
     throw new Exception("OBS plugin directories are missing");
 Get<AddModulePath>(h,"obs_add_module_path")(pluginBin,pluginData);
 Get<LoadModules>(h,"obs_load_all_modules")();
 Get<LoadModules>(h,"obs_post_load_modules")();
 var source=Get<Create>(h,"obs_source_create")("color_source_v3","wMix Color Test",IntPtr.Zero,IntPtr.Zero);
 if(source==IntPtr.Zero) throw new Exception("color_source_v3 unavailable; check image-source module loading");
 try {
 var incShowing=Get<SourceVisibility>(h,"obs_source_inc_showing");
 var decShowing=Get<SourceVisibility>(h,"obs_source_dec_showing");
 incShowing(source);
 try {
 var hwnd=CreateWindowExW(0,"STATIC","wMix preview probe",0x80000000,0,0,320,180,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
 if(hwnd==IntPtr.Zero) throw new Exception("Cannot create window");
 try {
 var info=new DisplayInfo{hwnd=hwnd,w=320,h=180,buffers=1,format=3};
 var display=Get<DisplayCreate>(h,"obs_display_create")(ref info,0);
 if(display==IntPtr.Zero) throw new Exception("Cannot create OBS display");
 Get<DisplayBackground>(h,"obs_display_set_background_color")(display,0);
 int draws=0;
 var render=Get<Release>(h,"obs_source_video_render");
 Draw draw=(param,w,h2)=>{render(source);Interlocked.Increment(ref draws);};
 Get<RegisterDraw>(h,"obs_display_add_draw_callback")(display,draw,IntPtr.Zero);
 try{
 int luma=-1;
 Frame callback=(state,video)=> {
   var plane=Marshal.ReadIntPtr(video);
   if(plane!=IntPtr.Zero) Volatile.Write(ref luma,Marshal.ReadByte(plane,32));
 };
 var output=Get<Output>(h,"obs_set_output_source");
 var disconnect=Get<Disconnect>(h,"obs_remove_raw_video_callback");
 Get<Connect>(h,"obs_add_raw_video_callback")(IntPtr.Zero,callback,IntPtr.Zero);
 try {
 Thread.Sleep(500);
 int before=Volatile.Read(ref luma);
 int previewBefore=Volatile.Read(ref draws);
 output(0,source);
 Thread.Sleep(500);
 int after=Volatile.Read(ref luma);
 Console.WriteLine("Program luma before="+before+" after="+after);
 Console.WriteLine("Preview draw callbacks before CUT="+previewBefore); if(previewBefore==0||before!=16||after<=before) throw new Exception("No measured color change");
 } finally {disconnect(callback,IntPtr.Zero);output(0,IntPtr.Zero);}
 }finally{Get<RegisterDraw>(h,"obs_display_remove_draw_callback")(display,draw,IntPtr.Zero);Get<Release>(h,"obs_display_destroy")(display);}
 }finally{DestroyWindow(hwnd);}
 } finally { decShowing(source); }
 }finally{Get<Release>(h,"obs_source_release")(source);}
 uint frames=Get<Frames>(h,"obs_get_total_frames")();
 Console.WriteLine("obs_get_total_frames="+frames);
 if(frames==0)throw new Exception("No video frames");
 }finally{Marshal.FreeCoTaskMem(module);}
 }finally{Get<Stop>(h,"obs_shutdown")();}
 }finally{FreeLibrary(h);}
 }
}
'@
if ($CompileOnly) {
    Write-Host 'C# libobs interop declarations compiled successfully; native OBS execution skipped.'
    return
}
[ObsDisplayProbe]::Run($ObsRoot)
