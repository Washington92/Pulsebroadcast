#include <windows.h>
#include <obs.h>
#include <obs-properties.h>
#include <util/bmem.h>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>
#include <stdexcept>

namespace fs = std::filesystem;
static void log(const char* step, const std::string& message) {
    std::cout << "[" << step << "] " << message << std::endl;
}
static std::string utf8(const fs::path& p) {
    auto s = p.u8string();
    return std::string(s.begin(), s.end());
}
static std::string winerror(DWORD error) {
    return "Win32=" + std::to_string(error);
}
template<typename T> static T load(HMODULE dll, const char* name) {
    auto p = GetProcAddress(dll, name);
    if (!p) throw std::runtime_error(std::string("Missing libobs export: ") + name);
    return reinterpret_cast<T>(p);
}
struct Api {
    decltype(&obs_startup) startup;
    decltype(&obs_shutdown) shutdown;
    decltype(&obs_reset_video) reset_video;
    decltype(&obs_reset_audio) reset_audio;
    decltype(&obs_add_data_path) add_data_path;
    decltype(&obs_add_module_path) add_module_path;
    decltype(&obs_load_all_modules) load_modules;
    decltype(&obs_post_load_modules) post_modules;
    decltype(&obs_enum_modules) enum_modules;
    decltype(&obs_get_version_string) version;
    decltype(&obs_source_create) source_create;
    decltype(&obs_source_properties) source_properties;
    decltype(&obs_source_release) source_release;
    decltype(&obs_properties_get) properties_get;
    decltype(&obs_properties_destroy) properties_destroy;
    decltype(&obs_property_list_item_count) item_count;
    decltype(&obs_property_list_item_name) item_name;
    decltype(&obs_property_list_item_string) item_string;
    decltype(&obs_property_get_type) property_type;
    decltype(&obs_property_list_format) property_format;
    decltype(&obs_get_latest_input_type_id) latest_input;
    decltype(&obs_find_modules2) find_modules;
};
static void count_module(void* p, obs_module_t*) { ++*static_cast<size_t*>(p); }
static void found_module(void* p, const obs_module_info2*) { ++*static_cast<size_t*>(p); }

int wmain(int argc, wchar_t** argv) {
    if (argc != 3 || std::wstring(argv[1]) != L"--obs-dir") {
        std::cerr << "Usage: engine-probe.exe --obs-dir \"C:\\Program Files\\obs-studio\"\n";
        return 2;
    }
    HMODULE dll = nullptr;
    bool started = false;
    obs_source_t* source = nullptr;
    obs_properties_t* props = nullptr;
    int result = 1;
    try {
        const fs::path root = fs::absolute(argv[2]);
        const fs::path bin = root / "bin" / "64bit";
        const fs::path dllpath = bin / "libobs.dll";
        const fs::path data = root / "data" / "libobs";
        const fs::path plugins = root / "obs-plugins" / "64bit";
        const fs::path plugdata = root / "data" / "obs-plugins" / "%module%";
        for (const auto& p : {dllpath, data, plugins}) {
            if (!fs::exists(p)) throw std::runtime_error("Required path missing: " + utf8(p));
        }
        if (!SetCurrentDirectoryW(bin.c_str()))
            throw std::runtime_error("SetCurrentDirectory failed " + winerror(GetLastError()));
        if (!SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_DEFAULT_DIRS | LOAD_LIBRARY_SEARCH_USER_DIRS))
            throw std::runtime_error("SetDefaultDllDirectories failed " + winerror(GetLastError()));
        if (!AddDllDirectory(bin.c_str()) || !AddDllDirectory(plugins.c_str()))
            throw std::runtime_error("AddDllDirectory failed " + winerror(GetLastError()));
        dll = LoadLibraryExW(dllpath.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        if (!dll) throw std::runtime_error("LoadLibraryEx libobs.dll failed " + winerror(GetLastError()) +
                                           " (missing dependency or incompatible architecture)");
#define SYM(field, name) load<decltype(Api::field)>(dll, name)
        Api a{SYM(startup,"obs_startup"), SYM(shutdown,"obs_shutdown"),
              SYM(reset_video,"obs_reset_video"), SYM(reset_audio,"obs_reset_audio"),
              SYM(add_data_path,"obs_add_data_path"), SYM(add_module_path,"obs_add_module_path"),
              SYM(load_modules,"obs_load_all_modules"), SYM(post_modules,"obs_post_load_modules"),
              SYM(enum_modules,"obs_enum_modules"), SYM(version,"obs_get_version_string"),
              SYM(source_create,"obs_source_create"), SYM(source_properties,"obs_source_properties"),
              SYM(source_release,"obs_source_release"), SYM(properties_get,"obs_properties_get"),
              SYM(properties_destroy,"obs_properties_destroy"), SYM(item_count,"obs_property_list_item_count"),
              SYM(item_name,"obs_property_list_item_name"), SYM(item_string,"obs_property_list_item_string"),
              SYM(property_type,"obs_property_get_type"), SYM(property_format,"obs_property_list_format"),
              SYM(latest_input,"obs_get_latest_input_type_id"), SYM(find_modules,"obs_find_modules2")};
#undef SYM
        log("version", std::string("runtime libobs: ") + a.version() +
            "; verify installed OBS and source headers are the SAME release before relying on ABI");
        if (!a.startup("pt-BR", nullptr, nullptr))
            throw std::runtime_error("obs_startup returned false");
        started = true;
        log("startup", "OK");
        obs_video_info ovi{};
        ovi.graphics_module = "libobs-d3d11";
        ovi.fps_num = 30; ovi.fps_den = 1;
        ovi.base_width = 1920; ovi.base_height = 1080;
        ovi.output_width = 1920; ovi.output_height = 1080;
        ovi.output_format = VIDEO_FORMAT_NV12;
        ovi.gpu_conversion = true;
        ovi.colorspace = VIDEO_CS_709;
        ovi.range = VIDEO_RANGE_PARTIAL;
        ovi.adapter = 0;
        const int v = a.reset_video(&ovi);
        if (v != OBS_VIDEO_SUCCESS)
            throw std::runtime_error("obs_reset_video code=" + std::to_string(v) +
                                     " (check data/libobs shaders/effects, D3D11 driver and GPU)");
        log("video", "video OK");
        obs_audio_info oai{};
        oai.samples_per_sec = 48000;
        oai.speakers = SPEAKERS_STEREO;
        if (!a.reset_audio(&oai))
            throw std::runtime_error("obs_reset_audio returned false (audio device/initialization)");
        log("audio", "audio OK");
        const std::string data_s = utf8(data);
        const std::string bin_s = utf8(plugins);
        const std::string plugdata_s = utf8(plugdata);
        a.add_data_path(data_s.c_str());
        a.add_module_path(bin_s.c_str(), plugdata_s.c_str());
        log("paths", "data=" + data_s + "; modules=" + bin_s + "; module-data=" + plugdata_s);
        size_t discovered = 0;
        a.find_modules(found_module, &discovered);
        a.load_modules();
        a.post_modules();
        size_t loaded = 0;
        a.enum_modules(count_module, &loaded);
        log("modules", "discovered=" + std::to_string(discovered) + " loaded=" + std::to_string(loaded) +
            " (individual module failures: inspect libobs stderr/log)");
        if (!loaded) throw std::runtime_error("No modules loaded (check obs-plugins/64bit and data/obs-plugins)");
        const char* source_id = a.latest_input("dshow_input");
        if (!source_id) source_id = "dshow_input";
        source = a.source_create(source_id, "wMix webcam probe", nullptr, nullptr);
        if (!source) throw std::runtime_error(std::string("obs_source_create failed: ") + source_id +
            " (obs-dshow plugin may not be loaded)");
        props = a.source_properties(source);
        if (!props) throw std::runtime_error("obs_source_properties returned null");
        auto* devices = a.properties_get(props, "video_device_id");
        if (!devices || a.property_type(devices) != OBS_PROPERTY_LIST ||
            a.property_format(devices) != OBS_COMBO_FORMAT_STRING)
            throw std::runtime_error("video_device_id missing or not a string list (obs-dshow version/plugin mismatch)");
        const size_t count = a.item_count(devices);
        log("webcams", "count=" + std::to_string(count));
        for (size_t i = 0; i < count; ++i) {
            const char* name = a.item_name(devices, i);
            const char* id = a.item_string(devices, i);
            std::cout << "  " << i + 1 << ". " << (name ? name : "") << " | " << (id ? id : "") << "\n";
        }
        if (!count) log("webcams", "No cameras enumerated (check Windows privacy settings and devices)");
        result = 0;
        a.properties_destroy(props); props = nullptr;
        a.source_release(source); source = nullptr;
        a.shutdown(); started = false;
        log("shutdown", "OK (allocation counters are not a reliable leak verdict across OBS versions)");
    } catch (const std::exception& e) {
        log("ERROR", e.what());
    }
    // In a failure path, the libobs module may remain loaded; release via exported symbols.
    if (dll) {
        if (props) {
            auto fn = GetProcAddress(dll, "obs_properties_destroy");
            if (fn) reinterpret_cast<decltype(&obs_properties_destroy)>(fn)(props);
        }
        if (source) {
            auto fn = GetProcAddress(dll, "obs_source_release");
            if (fn) reinterpret_cast<decltype(&obs_source_release)>(fn)(source);
        }
        if (started) {
            auto fn = GetProcAddress(dll, "obs_shutdown");
            if (fn) reinterpret_cast<decltype(&obs_shutdown)>(fn)();
        }
        FreeLibrary(dll);
    }
    return result;
}
