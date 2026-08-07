// Codevi — Tauri backend entry point.
//
// Phase 1 intentionally ships no custom commands: there is no parser,
// execution engine, or memory model yet (see the "Do NOT Implement" list
// in the Phase 1 prompt). This file's only job right now is to open the
// main window with the frontend loaded into it.
//
// Future phases will register their commands here via
// `.invoke_handler(tauri::generate_handler![...])`, roughly:
//   - Phase 2 (Parser):            parse_source, get_diagnostics
//   - Phase 3 (Execution Engine):  compile_and_run, step, pause, reset, set_breakpoint
//   - Phase 4+ (Memory):           get_memory_snapshot
// matching the Component Communication design in the Phase 0 blueprint
// (section 5).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
