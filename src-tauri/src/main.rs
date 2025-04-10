// Prevents additional console window on Windows in release!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::sync::Arc;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use lazy_static::lazy_static;
use log::info;
use rusqlite::Connection;
use rusqlite::params;
use serde_derive::Serialize;
use tauri::utils::config::AppUrl;
use tauri::SystemTray;
use tauri::{AppHandle, Manager, State, SystemTrayEvent, WindowUrl};
use tauri::{CustomMenuItem, SystemTrayMenu};
use tauri_plugin_log::LogTarget;
use tokio::sync::Mutex;

use configuration::settings::Settings;

use crate::bootstrap::{fix_path_env, prerequisites, setup_directories};
use crate::configuration::database;
use crate::configuration::database::drop_database_handle;
use crate::configuration::state::{AppState, ServiceAccess};
use crate::engine::chat_engine::{name_conversation, send_prompt_to_llm};
use crate::engine::chat_engine_openai::{generate_conversation_name, send_prompt_to_openai};
use crate::engine::clean_up_engine::clean_up;
use crate::engine::monitoring_engine;
use crate::engine::similarity_search_engine::SyncSimilaritySearch;
use crate::entity::activity_item::ActivityItem;
use crate::entity::chat_item::{Chat, StoredMessage};
use crate::entity::permission::Permission;
use crate::entity::project::Project;
use crate::entity::setting::Setting;
use crate::permissions::permission_engine::init_permissions;
use crate::repository::activity_log_repository;
use crate::repository::chat_db_repository;
use crate::repository::permissions_repository::{get_permissions, update_permission};
use crate::repository::project_repository::{
    delete_project, fetch_all_projects, add_blank_document, save_project, update_project, 
    get_activity_text_from_project, update_activity_text, update_activity_name, delete_project_document, 
    ensure_unassigned_project, move_document_to_project, mark_document_as_vectorized,
};
use crate::repository::settings_repository::{get_setting, get_settings, insert_or_update_setting, update_setting_async};
use tauri_plugin_autostart::MacosLauncher;

mod bootstrap;
mod configuration;
mod engine;
mod entity;
mod monitoring;
pub mod permissions;
mod repository;
pub mod window_details_collector;

#[derive(Clone, Serialize)]
struct Payload {
    data: bool,
}

#[cfg(debug_assertions)]
const USE_LOCALHOST_SERVER: bool = false;
#[cfg(not(debug_assertions))]
const USE_LOCALHOST_SERVER: bool = true;

lazy_static! {
    static ref HNSW: SyncSimilaritySearch = Arc::new(Mutex::new(None));
    static ref IS_RECORDING: AtomicBool = AtomicBool::new(false);
    static ref RECORDING_PATH: Arc<std::sync::Mutex<Option<String>>> = Arc::new(std::sync::Mutex::new(None));
}

//#[cfg(any(target_os = "macos"))]
//static ACCESSIBILITY_PERMISSIONS_GRANTED: AtomicBool = AtomicBool::new(false);

#[tokio::main]
async fn main() {
    let port = 5173;
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_oauth::init());

    fix_path_env::fix_all_vars().expect("Failed to load env");
    let tray = build_system_tray();

    let mut context = tauri::generate_context!();

    let url = format!("http://localhost:{}", port).parse().unwrap();
    let window_url = WindowUrl::External(url);

    if USE_LOCALHOST_SERVER == true {
        context.config_mut().build.dist_dir = AppUrl::Url(window_url.clone());
        context.config_mut().build.dev_path = AppUrl::Url(window_url.clone());
        builder = builder.plugin(tauri_plugin_localhost::Builder::new(port).build());
    }

    builder
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([LogTarget::Stdout, LogTarget::Webview])
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_positioner::init())
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            // Ensure the window is toggled when the tray icon is clicked
            SystemTrayEvent::LeftClick { .. } => {
                let window = app.get_window("main").unwrap();
                if window.is_visible().unwrap() {
                    window.hide().unwrap();
                } else {
                    window.show().unwrap();
                    window.set_focus().unwrap();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "start_stop_recording" => {
                    let wrapped_window = app.get_window("main");
                    if let Some(window) = wrapped_window {
                        window
                            .emit("toggle_recording", Payload { data: true })
                            .unwrap();
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            refresh_activity_log,
            update_settings,
            get_latest_settings,
            send_prompt_to_llm,
            send_prompt_to_openai,
            generate_conversation_name,
            record_single_activity,
            name_conversation,
            create_chat,
            get_all_chats,
            create_message,
            get_messages_by_chat_id,
            update_chat_name,
            update_app_permissions,
            get_app_permissions,
            get_projects,
            save_app_project,
            update_app_project,
            delete_app_project,
            delete_chat,
            prompt_for_accessibility_permissions,
            get_activity_history,
            delete_activity,
            get_activity_full_text_by_id,
            get_app_project_activity_text,
            update_project_activity_text,
            add_project_blank_activity,
            update_project_activity_name,
            delete_project_activity,
            ensure_unassigned_activity,
            update_project_activity_content,
            save_audio_file,
            transcribe_audio,
            start_audio_recording,
            stop_audio_recording,
            read_audio_file,
            get_openai_api_key,
            extract_document_text,
        ])
        .manage(AppState {
            db: Default::default(),
        })
        .on_window_event(|event| match event.event() {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                event.window().hide().unwrap(); // Hide window on close
            }
            _ => {}
        })
        .setup(move |app| {
            let args: Vec<String> = env::args().collect();
            let should_start_minimized = args.contains(&"--minimized".to_string());

            let window = app.get_window("main").unwrap();

            if should_start_minimized {
                window.hide().unwrap();
            } else {
                window.show().unwrap();
            }

            let app_handle = app.handle();
            let _ = setup_directories::setup_dirs(
                app_handle
                    .path_resolver()
                    .app_data_dir()
                    .unwrap()
                    .to_str()
                    .unwrap(),
            );
            prerequisites::check_and_install_prerequisites(
                app_handle
                    .path_resolver()
                    .resource_dir()
                    .unwrap()
                    .to_str()
                    .unwrap(),
            );
            clean_up(app_handle.path_resolver().app_data_dir().unwrap());
            setup_keypress_listener(&app_handle);
            init_app_permissions(app_handle);
            Ok(())
        })
        .run(context)
        .expect("error while running tauri application");
    drop_database_handle().await;
}

fn build_system_tray() -> SystemTray {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let start_stop_recording =
        CustomMenuItem::new("start_stop_recording".to_string(), "Start/Stop");
    let tray_menu = SystemTrayMenu::new()
      //  .add_item(start_stop_recording)
        .add_item(quit);
    SystemTray::new().with_menu(tray_menu)
}

fn setup_keypress_listener(app_handle: &AppHandle) {
    let app_state: State<AppState> = app_handle.state();

    let db: Connection =
        database::initialize_database(&app_handle).expect("Database initialization failed!");
    *app_state.db.lock().unwrap() = Some(db);
}

#[tauri::command]
fn refresh_activity_log(app_handle: AppHandle, _action: &str) -> Result<Vec<ActivityItem>, ()> {
    return Ok(get_latest_activity_log(app_handle.clone()));
}

#[tauri::command]
fn get_latest_settings(app_handle: AppHandle) -> Result<Vec<Setting>, ()> {
    let settings = app_handle.db(|db| get_settings(db).unwrap());
    return Ok(settings);
}

#[tauri::command]
async fn update_settings(app_handle: AppHandle, settings: Settings) {
    info!("update_settings: {:?}", settings);

    // Update interval
    update_setting_async(
        &app_handle,
        Setting {
            setting_key: String::from("interval"),
            setting_value: format!("{}", settings.interval),
        },
    ).await.unwrap_or(());

    // Update is_dev_mode
    update_setting_async(
        &app_handle,
        Setting {
            setting_key: String::from("is_dev_mode"),
            setting_value: format!("{}", settings.is_dev_mode),
        },
    ).await.unwrap_or(());

    // Update auto_start
    update_setting_async(
        &app_handle,
        Setting {
            setting_key: String::from("auto_start"),
            setting_value: format!("{}", settings.auto_start),
        },
    ).await.unwrap_or(());

    // Update api_choice
    update_setting_async(
        &app_handle,
        Setting {
            setting_key: String::from("api_choice"),
            setting_value: format!("{}", settings.api_choice),
        },
    ).await.unwrap_or(());

    // Update api_key_claude
    update_setting_async(
        &app_handle,
        Setting {
            setting_key: String::from("api_key_claude"),
            setting_value: format!("{}", settings.api_key_claude),
        },
    ).await.unwrap_or(());

    // Update api_key_open_ai
    update_setting_async(
        &app_handle,
        Setting {
            setting_key: String::from("api_key_open_ai"),
            setting_value: format!("{}", settings.api_key_open_ai),
        },
    ).await.unwrap_or(());
    
    // Update vectorization_enabled
    update_setting_async(
        &app_handle,
        Setting {
            setting_key: String::from("vectorization_enabled"),
            setting_value: format!("{}", settings.vectorization_enabled),
        },
    ).await.unwrap_or(());
}

#[tauri::command]
fn init_app_permissions(app_handle: AppHandle) {
    init_permissions(app_handle);
}

#[tauri::command]
fn update_app_permissions(app_handle: AppHandle, app_path: String, allow: bool) {
    app_handle.db(|database| {
        update_permission(database, app_path, allow).expect("Failed to update permission");
    })
}

#[tauri::command]
fn get_app_permissions(app_handle: AppHandle) -> Result<Vec<Permission>, ()> {
    let permissions = app_handle.db(|database| get_permissions(database).unwrap());
    return Ok(permissions);
}

#[tauri::command]
fn get_projects(app_handle: AppHandle) -> Result<Vec<Project>, ()> {
    let projects = app_handle.db(|database| fetch_all_projects(database).unwrap());
    return Ok(projects);
}

#[tauri::command]
fn save_app_project(
    app_handle: AppHandle,
    name: &str,
    activities: Vec<i64>,
) -> Result<Vec<i64>, ()> {
    app_handle.db(|database| save_project(database, name, &activities).unwrap());
    return Ok(activities);
}

#[tauri::command]
fn update_app_project(
    app_handle: AppHandle,
    id: i64,
    name: &str,
    activities: Vec<i64>,
) -> Result<Vec<i64>, ()> {
    app_handle.db(|database| update_project(database, id, name, &activities).unwrap());
    return Ok(activities);
}

#[tauri::command]
fn delete_app_project(app_handle: AppHandle, project_id: i64) -> Result<i64, ()> {
    app_handle.db(|database| delete_project(database, project_id).unwrap());
    return Ok(project_id);
}

#[tauri::command]
async fn record_single_activity(
    app_handle: AppHandle,
    user: &str,
) -> Result<Vec<ActivityItem>, ()> {
    if user.is_empty() {
        return Ok(vec![]);
    }

    let mut activity_item = monitoring_engine::start_a_monitoring_cycle(
        app_handle.clone(),
        app_handle
            .path_resolver()
            .app_data_dir()
            .unwrap()
            .to_str()
            .unwrap(),
    )
    .await;
    activity_item.user_id = String::from(user);
    app_handle.db(|db| {
        let setting = get_setting(db, "interval").expect("Failed on interval");
        activity_item.interval_length = setting.setting_value.parse().unwrap_or(20);
    });
    info!("USER_ID: {}", activity_item.user_id);
    app_handle
        .db(|db| activity_log_repository::save_activity_item(&activity_item.clone(), db))
        .expect("Failed to save activity log");
    let last_insert_rowid = app_handle
        .db(|db| activity_log_repository::save_activity_full_text(&activity_item.clone(), db))
        .expect("Failed to save activity full text");

    let settings =
        app_handle.db(|db| get_setting(db, "api_key_open_ai").expect("Failed on api_key_open_ai"));
    match last_insert_rowid {
        Some(rowid) => {
            info!("Getting ready to add record to OasysDB, row={}", rowid);
            let mut oasys_db = database::get_vector_db(&app_handle)
                .await
                .expect("Database initialization failed!");
            activity_log_repository::save_activity_full_text_into_vector_db(
                &mut oasys_db,
                &activity_item,
                rowid,
                &settings.setting_value,
            )
            .await
            .unwrap_or(());
        }
        None => info!("No last insert rowid available"),
    }

    return Ok(get_latest_activity_log(app_handle.clone()));
}

fn get_latest_activity_log(app_handle: AppHandle) -> Vec<ActivityItem> {
    return app_handle
        .db(|db| activity_log_repository::get_all_activity_logs(db))
        .unwrap();
}

#[tauri::command]
fn create_chat(app_handle: AppHandle, name: &str) -> Result<i64, String> {
    app_handle
        .db(|db| chat_db_repository::create_chat(db, name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_chats(app_handle: AppHandle) -> Result<Vec<Chat>, String> {
    app_handle
        .db(|db| chat_db_repository::get_all_chats(db))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_message(
    app_handle: AppHandle,
    chat_id: i64,
    role: &str,
    content: &str,
) -> Result<i64, String> {
    app_handle
        .db(|db| chat_db_repository::create_message(db, chat_id, role, content))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_messages_by_chat_id(
    app_handle: AppHandle,
    chat_id: i64,
) -> Result<Vec<StoredMessage>, String> {
    app_handle
        .db(|db| chat_db_repository::get_messages_by_chat_id(db, chat_id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_chat_name(app_handle: AppHandle, chat_id: i64, name: &str) -> Result<bool, String> {
    app_handle
        .db(|db| chat_db_repository::update_chat(db, chat_id, name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_chat(app_handle: AppHandle, chat_id: i64) -> Result<bool, String> {
    app_handle
        .db(|db| chat_db_repository::delete_chat(db, chat_id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_activity_history(
    app_handle: AppHandle,
    offset: usize,
    limit: usize,
) -> Result<Vec<(i64, String, String)>, String> {
    app_handle
        .db(|db: &Connection| {
            crate::activity_log_repository::get_activity_history(db, offset, limit)
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_activity(app_handle: AppHandle, id: i64) -> Result<bool, String> {
    app_handle
        .db(|db: &Connection| crate::activity_log_repository::delete_activity(db, id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_activity_full_text_by_id(
    app_handle: tauri::AppHandle,
    id: i64,
) -> Result<Option<(String, String)>, String> {
    app_handle
        .db(|db| crate::activity_log_repository::get_activity_full_text_by_id(db, id, None))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_project_activity_text(
    app_handle: AppHandle,
    activity_id: i64,
) -> Result<Option<(String, String)>, String> {
    app_handle
        .db(|database| get_activity_text_from_project(database, activity_id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_project_activity_content(
    app_handle: AppHandle,
    document_id: i64,
    target_project_id: i64,
) -> Result<(), String> {
    app_handle
        .db(|database| {
            move_document_to_project(database, document_id, target_project_id)
                .map_err(|e| e.to_string())
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_project_activity_text(
    app_handle: AppHandle,
    activity_id: i64,
    text: &str,
) -> Result<(), String> {
    info!("Updating text for project activity ID: {}, length: {}", activity_id, text.len());
    
    // Update the document text and check if vectorization is needed
    let needs_vectorization = app_handle
        .db(|db| update_activity_text(db, activity_id, text))
        .map_err(|e| e.to_string())?;
    
    if needs_vectorization {
        info!("Document ID: {} meets conditions for vectorization, checking settings", activity_id);
        
        // Check if vectorization is enabled in settings
        let setting_result = app_handle
            .db(|db| get_setting(db, "vectorization_enabled"));
        
        let vectorization_enabled = match setting_result {
            Ok(setting) => setting.setting_value == "true",
            Err(_) => true // Default to enabled if setting doesn't exist
        };
        
        // Get API key
        let api_key_result = app_handle
            .db(|db| get_setting(db, "api_key_open_ai"))
            .map_err(|e| e.to_string());
        
        let api_key = match api_key_result {
            Ok(setting) => setting.setting_value,
            Err(_) => String::new()
        };
        
        // Only proceed with vectorization if it's enabled and API key exists
        if !vectorization_enabled {
            info!("Vectorization disabled in settings, skipping for document ID: {}", activity_id);
            return Ok(());
        }
        
        // Skip if API key is missing or empty
        if api_key.is_empty() {
            info!("API key missing or empty, skipping vectorization for document ID: {}", activity_id);
            return Ok(());
        }
        
        // Get document name for vector DB
        let document_name = app_handle
            .db(|db| {
                db.query_row(
                    "SELECT document_name FROM projects_activities WHERE id = ?1",
                    params![activity_id],
                    |row| row.get::<_, String>(0)
                )
            })
            .map_err(|e| e.to_string())?;
        
        // Initialize vector DB - exactly as in record_single_activity
        info!("Initializing vector database for document ID: {}", activity_id);
        let mut oasys_db = database::get_vector_db(&app_handle)
            .await
            .expect("Database initialization failed!");
        
        // Add to vector DB
        info!("Adding document ID: {} to vector DB", activity_id);
        activity_log_repository::save_project_document_into_vector_db(
            &mut oasys_db,
            activity_id,
            &document_name,
            text,
            &api_key,
        )
        .await
        .unwrap_or(());
        
        // Mark as vectorized
        app_handle
            .db(|db| mark_document_as_vectorized(db, activity_id))
            .map_err(|e| e.to_string())?;
        
        info!("Successfully vectorized document ID: {}", activity_id);
    } else {
        info!("Document ID: {} does not need vectorization", activity_id);
    }
    
    Ok(())
}

#[tauri::command]
fn add_project_blank_activity(
    app_handle: AppHandle,
    project_id: i64,
) -> Result<i64, String> {
    app_handle
        .db(|db| add_blank_document(db, project_id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn ensure_unassigned_activity(app_handle: AppHandle) -> Result<i64, String> {
  app_handle
    .db(|db| {
      // First ensure unassigned project exists
      let unassigned_project_id = ensure_unassigned_project(db)?;
      // Then add blank document to it
      add_blank_document(db, unassigned_project_id)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_project_activity_name(
    app_handle: AppHandle,
    activity_id: i64,
    name: &str,
) -> Result<(), String> {
    app_handle
        .db(|db| update_activity_name(db, activity_id, name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_project_activity(
    app_handle: AppHandle,
    activity_id: i64,
) -> Result<(), String> {
    app_handle
        .db(|db| delete_project_document(db, activity_id))
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn prompt_for_accessibility_permissions() {
    unsafe {
        crate::window_details_collector::macos::macos_accessibility_engine::prompt_for_accessibility_permissions();
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn prompt_for_accessibility_permissions() {
    // No-op for non-macOS platforms
}

#[tauri::command]
fn save_audio_file(
    app_handle: AppHandle,
    file_path: String,
    audio_data: Vec<u8>,
) -> Result<(), String> {
    println!("Saving audio file to: {}", file_path);
    
    // Ensure the directory exists
    if let Some(parent) = Path::new(&file_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    // Write the audio data to the file
    let mut file = File::create(&file_path).map_err(|e| e.to_string())?;
    file.write_all(&audio_data).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn transcribe_audio(
    app_handle: AppHandle,
    file_path: String,
) -> Result<String, String> {
    println!("Transcribing audio file: {}", file_path);
    
    // Get the OpenAI API key from settings, as it's needed regardless of which transcription method we use
    let openai_api_key = app_handle
        .db(|db| get_setting(db, "api_key_open_ai"))
        .map_err(|e| e.to_string())?
        .setting_value;
    
    if openai_api_key.is_empty() {
        return Err("OpenAI API key is required for audio transcription".to_string());
    }
    
    // Set the environment variable for the transcription engine
    std::env::set_var("OPENAI_API_KEY", &openai_api_key);
    
    // Determine which API to use based on settings
    let api_choice = app_handle
        .db(|db| get_setting(db, "api_choice"))
        .map_err(|e| e.to_string())?
        .setting_value;
    
    let transcription = if api_choice == "openai" {
        // Use OpenAI Whisper API for transcription
        crate::engine::transcription_engine::transcribe_with_openai(
            &file_path,
            &openai_api_key,
        )
        .await
        .map_err(|e| e.to_string())?
    } else {
        // Use Claude API for transcription (which will internally fall back to OpenAI Whisper)
        let api_key = app_handle
            .db(|db| get_setting(db, "api_key_claude"))
            .map_err(|e| e.to_string())?
            .setting_value;
        
        if api_key.is_empty() {
            return Err("Claude API key is not set".to_string());
        }
        
        // Call the Claude API (which will use OpenAI Whisper internally)
        crate::engine::transcription_engine::transcribe_with_claude(
            &file_path,
            &api_key,
        )
        .await
        .map_err(|e| e.to_string())?
    };
    
    // Delete the audio file after successful transcription
    if let Err(err) = std::fs::remove_file(&file_path) {
        println!("Warning: Failed to delete audio file {}: {}", file_path, err);
        // Continue even if deletion fails - we already have the transcription
    } else {
        println!("Successfully deleted audio file: {}", file_path);
    }
    
    Ok(transcription)
}

#[tauri::command]
async fn start_audio_recording(app_handle: AppHandle) -> Result<String, String> {
    // Check if already recording
    if IS_RECORDING.load(Ordering::SeqCst) {
        return Err("Already recording".to_string());
    }

    // Create a temporary file path
    let app_data_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| "Failed to get app data directory".to_string())?;
    
    // Create a timestamped file name
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let file_path = app_data_dir.join(format!("recording_{}.wav", timestamp));
    let file_path_str = file_path.to_str()
        .ok_or_else(|| "Failed to convert path to string".to_string())?
        .to_string();
    
    // Store the recording path
    let mut path_guard = RECORDING_PATH.lock().unwrap();
    *path_guard = Some(file_path_str.clone());
    drop(path_guard);

    // Start recording in a separate thread
    let file_path_clone = file_path_str.clone();
    std::thread::spawn(move || {
        if let Err(err) = record_audio(&file_path_clone) {
            eprintln!("Error recording audio: {}", err);
            IS_RECORDING.store(false, Ordering::SeqCst);
        }
    });

    IS_RECORDING.store(true, Ordering::SeqCst);
    Ok(file_path_str)
}

#[tauri::command]
async fn stop_audio_recording() -> Result<String, String> {
    // Check if recording
    if !IS_RECORDING.load(Ordering::SeqCst) {
        return Err("Not recording".to_string());
    }

    // Stop recording
    IS_RECORDING.store(false, Ordering::SeqCst);

    // Wait a moment for the recording thread to finish
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Return the recording path
    let path_guard = RECORDING_PATH.lock().unwrap();
    let path = path_guard.clone().unwrap_or_default();
    
    Ok(path)
}

// Simple audio recording function with mono output for smaller file size
fn record_audio(file_path: &str) -> Result<(), String> {
    use hound::{WavSpec, WavWriter};
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    
    // Get default host and input device
    let host = cpal::default_host();
    let device = host.default_input_device()
        .ok_or_else(|| "No input device available".to_string())?;
    
    // Get supported config
    let config = device.default_input_config()
        .map_err(|e| format!("Default config not supported: {}", e))?;
    
    // Set up WAV writer - using mono (1 channel) instead of stereo
    let spec = WavSpec {
        channels: 1, // Force mono recording
        sample_rate: config.sample_rate().0,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    
    let writer = Arc::new(std::sync::Mutex::new(
        WavWriter::create(file_path, spec)
            .map_err(|e| format!("Failed to create WAV file: {}", e))?
    ));
    
    // Create a modified configuration that forces mono
    let stream_config = cpal::StreamConfig {
        channels: 1, // Force mono
        sample_rate: config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    
    // Set up stream
    let err_fn = move |err| {
        eprintln!("an error occurred on stream: {}", err);
    };
    
    let writer_clone = writer.clone();
    let stream = match config.sample_format() {
        cpal::SampleFormat::I16 => device.build_input_stream(
            &stream_config, // Use our mono config
            move |data: &[i16], _: &_| {
                if IS_RECORDING.load(Ordering::SeqCst) {
                    let mut writer = writer_clone.lock().unwrap();
                    for &sample in data {
                        writer.write_sample(sample).unwrap();
                    }
                }
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::F32 => device.build_input_stream(
            &stream_config, // Use our mono config
            move |data: &[f32], _: &_| {
                if IS_RECORDING.load(Ordering::SeqCst) {
                    let mut writer = writer_clone.lock().unwrap();
                    for &sample in data {
                        // Convert f32 to i16
                        let sample = (sample * 32767.0) as i16;
                        writer.write_sample(sample).unwrap();
                    }
                }
            },
            err_fn,
            None,
        ),
        _ => return Err("Unsupported sample format".to_string()),
    }.map_err(|e| format!("Failed to build input stream: {}", e))?;
    
    // Start the stream
    stream.play().map_err(|e| format!("Failed to play stream: {}", e))?;
    
    // Record until IS_RECORDING is set to false
    while IS_RECORDING.load(Ordering::SeqCst) {
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    
    // The stream will be stopped when it goes out of scope
    drop(stream);
    
    Ok(())
}

#[tauri::command]
fn read_audio_file(file_path: String) -> Result<Vec<u8>, String> {
    // Read the file into a byte vector
    std::fs::read(&file_path)
        .map_err(|err| format!("Failed to read audio file: {}", err))
}

#[tauri::command]
fn get_openai_api_key(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    // Get the OpenAI API key from settings
    let api_key = app_handle
        .db(|db| get_setting(db, "api_key_open_ai"))
        .map_err(|e| e.to_string())?
        .setting_value;
    
    // Return as a JSON object
    let response = serde_json::json!({
        "api_key_open_ai": api_key
    });
    
    Ok(response)
}

#[tauri::command]
async fn extract_document_text(file_path: String) -> Result<String, String> {
    println!("Extracting text from document: {}", file_path);
    
    // Determine file type based on extension
    let path = Path::new(&file_path);
    let extension = path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .unwrap_or_default();
    
    match extension.as_str() {
        "pdf" => extract_text_from_pdf(&file_path),
        "docx" => extract_text_from_docx(&file_path),
        "txt" | "md" | "rtf" => read_text_file(&file_path),
        _ => Err(format!("Unsupported file format: {}", extension))
    }
}

fn extract_text_from_pdf(file_path: &str) -> Result<String, String> {
    // Use the pdf-extract crate to extract text from PDFs
    match pdf_extract::extract_text(file_path) {
        Ok(text) => Ok(text),
        Err(err) => Err(format!("Failed to extract text from PDF: {}", err))
    }
}

fn extract_text_from_docx(file_path: &str) -> Result<String, String> {
    // Create a simple fallback message for now
    let bytes = std::fs::read(file_path).map_err(|e| e.to_string())?;
    
    // For now, we'll use a more basic approach for DOCX files
    // This is a temporary solution until we can properly integrate docx-rs
    // or find an alternative library
    let content = String::from_utf8_lossy(&bytes);
    
    // Look for text content within XML elements
    let mut extracted_text = String::new();
    let mut in_text = false;
    let mut current_text = String::new();
    
    for c in content.chars() {
        if c == '<' {
            if !current_text.is_empty() {
                extracted_text.push_str(&current_text);
                extracted_text.push('\n');
                current_text.clear();
            }
            in_text = false;
        } else if c == '>' {
            in_text = true;
        } else if in_text {
            current_text.push(c);
        }
    }
    
    // If we got any useful text
    if !extracted_text.is_empty() {
        Ok(extracted_text)
    } else {
        // Fallback message
        Ok("This DOCX file could not be fully parsed. Please try converting it to a text format first.".to_string())
    }
}

fn read_text_file(file_path: &str) -> Result<String, String> {
    // Simple text file reading
    std::fs::read_to_string(file_path).map_err(|e| e.to_string())
}
