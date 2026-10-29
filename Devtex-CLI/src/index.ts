#!/usr/bin/env node

import process from "node:process";
import { Command } from "commander";

const program = new Command();

program
    .name("devtex")
    .description("DEVTEX — Developer Workspace CLI")
    .version("0.1.0");

program
    .command("init")
    .description("Initialize DEVTEX in the current project")
    .action(() => {
        console.log("🚀 Initializing DEVTEX...");
        console.log("📂 Project:", process.cwd());
        console.log("✅ DEVTEX initialization command is working.");
    });

program
    .command("doctor")
    .description("Check the local development environment")
    .action(() => {
        console.log("🩺 DEVTEX Doctor");
        console.log("Node.js:", process.version);
        console.log("Platform:", process.platform);
        console.log("Architecture:", process.arch);
        console.log("✅ Basic environment check complete.");
    });

program.parse();
