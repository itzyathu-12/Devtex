//! Shared, UI-agnostic functionality used by DEVTEX CLI, Desktop, and IDE.
use serde::Serialize;
use std::{fs,path::{Component,Path,PathBuf},process::Command};
pub const VERSION:&str=env!("CARGO_PKG_VERSION");
#[derive(Debug,Clone,PartialEq,Eq,Serialize)]pub struct WorkspaceInfo{pub root:PathBuf,pub name:String}
#[derive(Debug,Clone,PartialEq,Eq,Serialize)]pub struct ProjectEntry{pub name:String,pub path:String,pub kind:String}
pub fn inspect_workspace(path:impl AsRef<Path>)->std::io::Result<WorkspaceInfo>{
 let root=fs::canonicalize(path)?;if !root.is_dir(){return Err(std::io::Error::new(std::io::ErrorKind::NotADirectory,"workspace path is not a directory"));}
 let name=root.file_name().and_then(|p|p.to_str()).unwrap_or("workspace").to_owned();Ok(WorkspaceInfo{root,name})
}
/// List a single directory only; never recursively traverse large dependency folders.
pub fn list_directory(root:&Path,relative:&str)->std::io::Result<Vec<ProjectEntry>>{
 let directory=resolve_inside(root,relative)?;let mut entries=Vec::new();
 for entry in fs::read_dir(directory)?{let entry=entry?;let name=entry.file_name().to_string_lossy().into_owned();if [".git","node_modules","target",".next"].contains(&name.as_str()){continue;}
 let kind=if entry.file_type()?.is_dir(){"directory"}else{"file"};let path=if relative.is_empty(){name.clone()}else{format!("{}/{}",relative.trim_end_matches('/'),name)};
 entries.push(ProjectEntry{name,path,kind:kind.to_owned()});}
 entries.sort_by(|a,b|(b.kind=="directory").cmp(&(a.kind=="directory")).then_with(||a.name.to_lowercase().cmp(&b.name.to_lowercase())));Ok(entries)
}
/// Resolve a relative path inside a project, rejecting traversal and symlink escapes.
pub fn resolve_inside(root:&Path,relative:&str)->std::io::Result<PathBuf>{
 let candidate=Path::new(relative);if candidate.is_absolute()||candidate.components().any(|c|matches!(c,Component::ParentDir|Component::RootDir|Component::Prefix(_))){return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"path must stay inside the project"));}
 let root=fs::canonicalize(root)?;let joined=root.join(candidate);let mut ancestor=joined.as_path();
 while !ancestor.exists(){ancestor=ancestor.parent().ok_or_else(||std::io::Error::new(std::io::ErrorKind::InvalidInput,"invalid path"))?;}
 let canonical=fs::canonicalize(ancestor)?;if !canonical.starts_with(&root){return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"path escapes the project"));}
 let suffix=joined.strip_prefix(ancestor).map_err(|_|std::io::Error::new(std::io::ErrorKind::PermissionDenied,"invalid project path"))?;
 let resolved=canonical.join(suffix);if !resolved.starts_with(&root){return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"path escapes the project"));}Ok(resolved)
}
pub fn git_status(path:impl AsRef<Path>)->std::io::Result<String>{
 let out=Command::new("git").arg("-C").arg(path.as_ref()).args(["status","--short","--branch"]).output()?;
 if !out.status.success(){return Err(std::io::Error::new(std::io::ErrorKind::Other,String::from_utf8_lossy(&out.stderr).trim().to_owned()));}Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}
#[cfg(test)]mod tests{use super::*;#[test]fn version_exists(){assert!(!VERSION.is_empty());}
#[test]fn missing_workspace_is_rejected(){assert!(inspect_workspace("this-path-should-not-exist-devtex").is_err());}
#[test]fn parent_traversal_is_rejected(){assert!(resolve_inside(&std::env::current_dir().unwrap(),"../outside").is_err());}
#[test]fn listing_is_shallow(){let root=std::env::temp_dir().join(format!("devtex-core-{}",std::process::id()));fs::create_dir_all(root.join("nested")).unwrap();fs::write(root.join("file.txt"),"ok").unwrap();let items=list_directory(&root,"").unwrap();assert!(items.iter().any(|e|e.name=="file.txt"));assert!(!items.iter().any(|e|e.path=="nested/file.txt"));let _=fs::remove_dir_all(root);}
}
