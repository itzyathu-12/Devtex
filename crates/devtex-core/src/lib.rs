//! Shared, UI-agnostic functionality for DEVTEX.
//! Keep this crate independent from Tauri, Electron, and terminal UI concerns.

use std::path::{Path, PathBuf};

/// Current DEVTEX workspace version.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Basic information about a local project directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceInfo {
    pub root: PathBuf,
    pub name: String,
}

/// Resolve a project directory without recursively scanning or mutating it.
pub fn inspect_workspace(path: impl AsRef<Path>) -> std::io::Result<WorkspaceInfo> {
    let root = std::fs::canonicalize(path)?;
    if !root.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotADirectory,
            "workspace path is not a directory",
        ));
    }
    let name = root.file_name().and_then(|part| part.to_str())
        .unwrap_or("workspace").to_owned();
    Ok(WorkspaceInfo { root, name })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_workspace_version() {
        assert!(!VERSION.is_empty());
    }

    #[test]
    fn rejects_missing_workspace() {
        assert!(inspect_workspace("this-path-should-not-exist-devtex").is_err());
    }
}
