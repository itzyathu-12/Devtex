use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use devtex_core::{inspect_workspace, VERSION};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(name = "devtex", version = VERSION, about = "DEVTEX developer workspace")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Inspect a local project directory.
    Doctor {
        /// Project directory to inspect (defaults to the current directory).
        #[arg(default_value = ".")]
        path: PathBuf,
    },
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Commands::Doctor { path } => {
            let workspace = inspect_workspace(&path)
                .with_context(|| format!("Could not inspect {}", path.display()))?;
            println!("DEVTEX workspace: {}", workspace.name);
            println!("Location: {}", workspace.root.display());
            println!("Status: directory is accessible");
        }
    }
    Ok(())
}
