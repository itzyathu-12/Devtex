use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use devtex_core::{git_status, inspect_workspace, list_directory, VERSION};
use std::path::PathBuf;
#[derive(Debug, Parser)]
#[command(name = "devtex", version = VERSION, about = "DEVTEX developer workspace")]
struct Cli { #[command(subcommand)] command: Commands }
#[derive(Debug, Subcommand)]
enum Commands {
    /// Inspect a local project directory.
    Doctor { #[arg(default_value = ".")] path: PathBuf },
    /// Show a shallow, filtered project tree.
    Inspect { #[arg(default_value = ".")] path: PathBuf, #[arg(default_value = "")] directory: String },
    /// Show Git working-tree status.
    Status { #[arg(default_value = ".")] path: PathBuf },
}
fn main() -> Result<()> {
    match Cli::parse().command {
        Commands::Doctor { path } => {
            let w = inspect_workspace(&path).with_context(|| format!("Could not inspect {}", path.display()))?;
            println!("DEVTEX workspace: {}\nLocation: {}\nStatus: directory is accessible", w.name, w.root.display());
        }
        Commands::Inspect { path, directory } => {
            let w = inspect_workspace(&path).with_context(|| format!("Could not inspect {}", path.display()))?;
            for e in list_directory(&w.root, &directory)? { println!("{}  {}", if e.kind == "directory" { "DIR " } else { "FILE" }, e.path); }
        }
        Commands::Status { path } => print!("{}", git_status(path)?),
    }
    Ok(())
}
