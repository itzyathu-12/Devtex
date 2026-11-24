#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use devtex_core::{git_status,inspect_workspace,list_directory,resolve_inside,WorkspaceInfo};
use std::{fs,path::PathBuf,sync::Mutex};
use tauri::State;
struct ActiveWorkspace(Mutex<Option<PathBuf>>);
#[tauri::command] fn runtime_version()->&'static str{devtex_core::VERSION}
#[tauri::command] fn inspect_project(path:String)->Result<WorkspaceInfo,String>{inspect_workspace(path).map_err(|e|e.to_string())}
#[tauri::command] fn project_open(path:String,state:State<'_,ActiveWorkspace>)->Result<WorkspaceInfo,String>{
 let info=inspect_workspace(path).map_err(|e|e.to_string())?;*state.0.lock().map_err(|e|e.to_string())?=Some(info.root.clone());Ok(info)
}
#[tauri::command] fn project_root(state:State<'_,ActiveWorkspace>)->Result<Option<String>,String>{Ok(state.0.lock().map_err(|e|e.to_string())?.as_ref().map(|p|p.to_string_lossy().into_owned()))}
#[tauri::command] fn project_tree(directory:String,state:State<'_,ActiveWorkspace>)->Result<Vec<devtex_core::ProjectEntry>,String>{
 let guard=state.0.lock().map_err(|e|e.to_string())?;list_directory(guard.as_ref().ok_or("No project is open")?,&directory).map_err(|e|e.to_string())
}
#[tauri::command] fn project_read(relative_path:String,state:State<'_,ActiveWorkspace>)->Result<String,String>{
 let guard=state.0.lock().map_err(|e|e.to_string())?;let root=guard.as_ref().ok_or("No project is open")?;
 fs::read_to_string(resolve_inside(root,&relative_path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())
}
#[tauri::command] fn project_write(relative_path:String,content:String,state:State<'_,ActiveWorkspace>)->Result<bool,String>{
 if content.len()>2_000_000{return Err("File content exceeds the 2 MB safety limit".into());}
 let guard=state.0.lock().map_err(|e|e.to_string())?;let root=guard.as_ref().ok_or("No project is open")?;
 fs::write(resolve_inside(root,&relative_path).map_err(|e|e.to_string())?,content).map_err(|e|e.to_string())?;Ok(true)
}
#[tauri::command] fn project_create(relative_path:String,kind:String,state:State<'_,ActiveWorkspace>)->Result<Vec<devtex_core::ProjectEntry>,String>{
 let guard=state.0.lock().map_err(|e|e.to_string())?;let root=guard.as_ref().ok_or("No project is open")?;
 let path=resolve_inside(root,&relative_path).map_err(|e|e.to_string())?;
 match kind.as_str(){"directory"=>fs::create_dir_all(&path).map_err(|e|e.to_string())?,"file"=>{if let Some(p)=path.parent(){fs::create_dir_all(p).map_err(|e|e.to_string())?;}fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e|e.to_string())?;},_=>return Err("kind must be file or directory".into())}
 let parent=PathBuf::from(&relative_path).parent().unwrap_or(std::path::Path::new("")).to_string_lossy().into_owned();
 list_directory(root,if parent=="."{""}else{&parent}).map_err(|e|e.to_string())
}
#[tauri::command] fn git_status_for_project(path:String)->Result<String,String>{git_status(path).map_err(|e|e.to_string())}
fn main(){tauri::Builder::default().plugin(tauri_plugin_dialog::init()).manage(ActiveWorkspace(Mutex::new(None)))
 .invoke_handler(tauri::generate_handler![runtime_version,inspect_project,project_open,project_root,project_tree,project_read,project_write,project_create,git_status_for_project])
 .run(tauri::generate_context!()).expect("error while running DEVTEX Desktop");}
