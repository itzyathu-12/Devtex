#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use devtex_core::{inspect_workspace,list_directory,resolve_inside,WorkspaceInfo};
use std::{fs,path::PathBuf,sync::Mutex};
use tauri::State;
use tauri_plugin_dialog::DialogExt;
struct ActiveWorkspace(Mutex<Option<PathBuf>>);
#[tauri::command]
fn project_open(app:tauri::AppHandle,state:State<'_,ActiveWorkspace>)->Result<Option<WorkspaceInfo>,String>{
 let Some(selected)=app.dialog().file().blocking_pick_folder() else{return Ok(None);};
 let selected=selected.into_path().map_err(|e|e.to_string())?;
 let info=inspect_workspace(selected).map_err(|e|e.to_string())?;
 *state.0.lock().map_err(|e|e.to_string())?=Some(info.root.clone());Ok(Some(info))
}
#[tauri::command]fn project_set_root(path:String,state:State<'_,ActiveWorkspace>)->Result<WorkspaceInfo,String>{
 let info=inspect_workspace(path).map_err(|e|e.to_string())?;*state.0.lock().map_err(|e|e.to_string())?=Some(info.root.clone());Ok(info)
}
#[tauri::command]fn project_root(state:State<'_,ActiveWorkspace>)->Result<Option<String>,String>{Ok(state.0.lock().map_err(|e|e.to_string())?.as_ref().map(|p|p.to_string_lossy().into_owned()))}
#[tauri::command]fn project_tree(directory:String,state:State<'_,ActiveWorkspace>)->Result<Vec<devtex_core::ProjectEntry>,String>{
 let guard=state.0.lock().map_err(|e|e.to_string())?;list_directory(guard.as_ref().ok_or("No project is open")?,&directory).map_err(|e|e.to_string())
}
#[tauri::command]fn file_read(relative_path:String,state:State<'_,ActiveWorkspace>)->Result<String,String>{
 let guard=state.0.lock().map_err(|e|e.to_string())?;let root=guard.as_ref().ok_or("No project is open")?;
 fs::read_to_string(resolve_inside(root,&relative_path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())
}
#[tauri::command]fn file_write(relative_path:String,content:String,state:State<'_,ActiveWorkspace>)->Result<bool,String>{
 if content.len()>2_000_000{return Err("File content exceeds the 2 MB safety limit".into());}
 let guard=state.0.lock().map_err(|e|e.to_string())?;let root=guard.as_ref().ok_or("No project is open")?;
 fs::write(resolve_inside(root,&relative_path).map_err(|e|e.to_string())?,content).map_err(|e|e.to_string())?;Ok(true)
}
#[tauri::command]fn file_create(relative_path:String,kind:String,state:State<'_,ActiveWorkspace>)->Result<Vec<devtex_core::ProjectEntry>,String>{
 let guard=state.0.lock().map_err(|e|e.to_string())?;let root=guard.as_ref().ok_or("No project is open")?;
 let path=resolve_inside(root,&relative_path).map_err(|e|e.to_string())?;
 match kind.as_str(){"directory"=>fs::create_dir_all(&path).map_err(|e|e.to_string())?,"file"=>{if let Some(p)=path.parent(){fs::create_dir_all(p).map_err(|e|e.to_string())?;}fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e|e.to_string())?;},_=>return Err("kind must be file or directory".into())}
 let parent=PathBuf::from(&relative_path).parent().unwrap_or(std::path::Path::new("")).to_string_lossy().into_owned();
 list_directory(root,if parent=="."{""}else{&parent}).map_err(|e|e.to_string())
}
fn main(){tauri::Builder::default().plugin(tauri_plugin_dialog::init()).manage(ActiveWorkspace(Mutex::new(None)))
 .invoke_handler(tauri::generate_handler![project_open,project_set_root,project_root,project_tree,file_read,file_write,file_create])
 .run(tauri::generate_context!()).expect("error while running DEVTEX IDE");}
