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
 [DllImport("kernel32",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool SetDefaultDllDirectories(uint flags);
 [DllImport("kernel32",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr AddDllDirectory(string path);
 [DllImport("kernel32",SetLastError=true)] static extern bool RemoveDllDirectory(IntPtr cookie);
 [DllImport("kernel32",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool SetCurrentDirectoryW(string path);
 [DllImport("kernel32",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr LoadLibraryExW(string p,IntPtr r,uint f);
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
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return:MarshalAs(UnmanagedType.I1)] delegate bool LoadCoreModules();
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void PostLoadModules();
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr Create(string id,string name,IntPtr settings,IntPtr hotkeys);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr DataCreate();
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DataSetInt(IntPtr data,string name,long value);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DataRelease(IntPtr data);
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
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DisplayDestroy(IntPtr display);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void SourceVisibility(IntPtr source);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Draw(IntPtr param,uint width,uint height);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void RegisterDraw(IntPtr display,Draw callback,IntPtr param);
 static T Get<T>(IntPtr h,string n) where T:Delegate => Marshal.GetDelegateForFunctionPointer<T>(GetProcAddress(h,n));
 public static void Run(string root){
 string bin=Path.Combine(root,"bin","64bit");
 string coreImageSource=Path.Combine(root,"core","image-source","image-source.dll");
 string graphicsDll=Path.Combine(bin,"libobs-d3d11.dll");
 if(!Directory.Exists(bin)||!File.Exists(graphicsDll)||!File.Exists(coreImageSource))
     throw new Exception("OBS 33.0.1 runtime layout is incomplete. bin="+bin+"; D3D11="+graphicsDll+"; image-source="+coreImageSource);
 if(!SetDefaultDllDirectories(0x1000))
     throw new Exception("SetDefaultDllDirectories failed: "+Marshal.GetLastWin32Error());
 IntPtr binCookie=AddDllDirectory(bin);
 if(binCookie==IntPtr.Zero)
     throw new Exception("AddDllDirectory(bin) failed: "+Marshal.GetLastWin32Error());
 try {
 if(!SetCurrentDirectoryW(bin))
     throw new Exception("SetCurrentDirectoryW failed: "+Marshal.GetLastWin32Error());
 var h=LoadLibraryExW(Path.Combine(bin,"obs.dll"),IntPtr.Zero,0x1100);
 if(h==IntPtr.Zero)throw new Exception("LoadLibrary failed: "+Marshal.GetLastWin32Error());
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
 // OBS 33.0.1 moved first-party modules to the core loader. The deprecated
 // obs_load_all_modules export is a no-op in this release.
 if(!Get<LoadCoreModules>(h,"obs_load_core_modules")())
     throw new Exception("obs_load_core_modules failed; verify the OBS core module package");
 Get<PostLoadModules>(h,"obs_post_load_modules")();
 var dataCreate=Get<DataCreate>(h,"obs_data_create");
 var dataSetInt=Get<DataSetInt>(h,"obs_data_set_int");
 var dataRelease=Get<DataRelease>(h,"obs_data_release");
 var sourceCreate=Get<Create>(h,"obs_source_create");
 IntPtr CreateColorSource(string name,long color) {
   var settings=dataCreate();
   if(settings==IntPtr.Zero) throw new Exception("obs_data_create failed");
   try {
     dataSetInt(settings,"color",color);
     dataSetInt(settings,"width",1920);
     dataSetInt(settings,"height",1080);
     var created=sourceCreate("color_source_v3",name,settings,IntPtr.Zero);
     if(created==IntPtr.Zero) throw new Exception("color_source_v3 unavailable; check image-source module loading");
     return created;
   } finally { dataRelease(settings); }
 }
 IntPtr programSource=IntPtr.Zero;
 IntPtr previewSource=IntPtr.Zero;
 IntPtr hwndPreview=IntPtr.Zero;
 IntPtr hwndProgram=IntPtr.Zero;
 IntPtr displayPreview=IntPtr.Zero;
 IntPtr displayProgram=IntPtr.Zero;
 bool programShowing=false;
 bool previewShowing=false;
 Draw previewDraw=null;
 Draw programDraw=null;
 bool previewDrawAdded=false;
 bool programDrawAdded=false;
 var incShowing=Get<SourceVisibility>(h,"obs_source_inc_showing");
 var decShowing=Get<SourceVisibility>(h,"obs_source_dec_showing");
 var releaseSource=Get<Release>(h,"obs_source_release");
 var destroyDisplay=Get<DisplayDestroy>(h,"obs_display_destroy");
 var addDraw=Get<RegisterDraw>(h,"obs_display_add_draw_callback");
 var removeDraw=Get<RegisterDraw>(h,"obs_display_remove_draw_callback");
 try {
   // White is the initial Program output; black is the Preview source.
   programSource=CreateColorSource("wMix Program Test",unchecked((long)0xFFFFFFFFu));
   previewSource=CreateColorSource("wMix Preview Test",unchecked((long)0xFF000000u));
   incShowing(programSource); programShowing=true;
   incShowing(previewSource); previewShowing=true;

   hwndPreview=CreateWindowExW(0,"STATIC","wMix Preview probe",0x80000000,0,0,320,180,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
   if(hwndPreview==IntPtr.Zero) throw new Exception("Cannot create Preview window");
   hwndProgram=CreateWindowExW(0,"STATIC","wMix Program probe",0x80000000,0,0,320,180,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
   if(hwndProgram==IntPtr.Zero) throw new Exception("Cannot create Program window");

   var infoPreview=new DisplayInfo{hwnd=hwndPreview,w=320,h=180,buffers=1,format=3};
   var infoProgram=new DisplayInfo{hwnd=hwndProgram,w=320,h=180,buffers=1,format=3};
   var createDisplay=Get<DisplayCreate>(h,"obs_display_create");
   displayPreview=createDisplay(ref infoPreview,0);
   if(displayPreview==IntPtr.Zero) throw new Exception("Cannot create Preview OBS display");
   displayProgram=createDisplay(ref infoProgram,0);
   if(displayProgram==IntPtr.Zero) throw new Exception("Cannot create Program OBS display");
   var setBackground=Get<DisplayBackground>(h,"obs_display_set_background_color");
   setBackground(displayPreview,0);
   setBackground(displayProgram,0);

   var render=Get<Release>(h,"obs_source_video_render");
   int previewDraws=0;
   int programDraws=0;
   IntPtr currentProgramSource=programSource;
   previewDraw=(param,w,h2)=>{render(previewSource);Interlocked.Increment(ref previewDraws);};
   programDraw=(param,w,h2)=>{render(currentProgramSource);Interlocked.Increment(ref programDraws);};
   addDraw(displayPreview,previewDraw,IntPtr.Zero); previewDrawAdded=true;
   addDraw(displayProgram,programDraw,IntPtr.Zero); programDrawAdded=true;

   int luma=-1;
   Frame callback=(state,video)=> {
     var plane=Marshal.ReadIntPtr(video);
     if(plane!=IntPtr.Zero) Volatile.Write(ref luma,Marshal.ReadByte(plane,32));
   };
   var output=Get<Output>(h,"obs_set_output_source");
   var connect=Get<Connect>(h,"obs_add_raw_video_callback");
   var disconnect=Get<Disconnect>(h,"obs_remove_raw_video_callback");
   connect(IntPtr.Zero,callback,IntPtr.Zero);
   try {
     output(0,programSource);
     Thread.Sleep(750);
     int before=Volatile.Read(ref luma);
     int previewBefore=Volatile.Read(ref previewDraws);
     int programBefore=Volatile.Read(ref programDraws);

     // CUT: Program changes to the source already visible in the independent Preview display.
     currentProgramSource=previewSource;
     output(0,previewSource);
     Thread.Sleep(750);
     int after=Volatile.Read(ref luma);
     int previewAfter=Volatile.Read(ref previewDraws);
     int programAfter=Volatile.Read(ref programDraws);
     Console.WriteLine("Preview draw callbacks before/after CUT="+previewBefore+"/"+previewAfter);
     Console.WriteLine("Program draw callbacks before/after CUT="+programBefore+"/"+programAfter);
     Console.WriteLine("Program luma before/after CUT="+before+"/"+after);
     if(previewBefore==0||programBefore==0||previewAfter<=previewBefore||programAfter<=programBefore||before<200||after>40)
       throw new Exception("Dual-display CUT smoke test failed: expected two active displays and white-to-black Program output");
   } finally {
     disconnect(callback,IntPtr.Zero);
     output(0,IntPtr.Zero);
   }
 } finally {
   if(displayProgram!=IntPtr.Zero) {
     if(programDrawAdded) removeDraw(displayProgram,programDraw,IntPtr.Zero);
     destroyDisplay(displayProgram);
   }
   if(displayPreview!=IntPtr.Zero) {
     if(previewDrawAdded) removeDraw(displayPreview,previewDraw,IntPtr.Zero);
     destroyDisplay(displayPreview);
   }
   if(hwndProgram!=IntPtr.Zero) DestroyWindow(hwndProgram);
   if(hwndPreview!=IntPtr.Zero) DestroyWindow(hwndPreview);
   if(previewShowing) decShowing(previewSource);
   if(programShowing) decShowing(programSource);
   if(previewSource!=IntPtr.Zero) releaseSource(previewSource);
   if(programSource!=IntPtr.Zero) releaseSource(programSource);
 }
 uint frames=Get<Frames>(h,"obs_get_total_frames")();
 Console.WriteLine("obs_get_total_frames="+frames);
 if(frames==0)throw new Exception("No video frames");
 }finally{Marshal.FreeCoTaskMem(module);}
 }finally{Get<Stop>(h,"obs_shutdown")();}
 }finally{FreeLibrary(h);}
 } finally {
     RemoveDllDirectory(binCookie);
 }
 }
}
'@
if ($CompileOnly) {
    Write-Host 'C# libobs interop declarations compiled successfully; native OBS execution skipped.'
    return
}
[ObsDisplayProbe]::Run($ObsRoot)
