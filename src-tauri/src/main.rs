// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(all(target_os = "windows", not(debug_assertions)), windows_subsystem = "windows")]

fn main() {
  app_lib::run();
}
