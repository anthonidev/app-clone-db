# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DB Clone is a desktop PostgreSQL database cloning application built with Tauri 2.x (Rust backend + React frontend). It allows users to clone databases (structure, data, or both), manage connection profiles, organize with color-coded tags, and save/replay clone operations.

## Development Commands

```bash
# Install dependencies
bun install

# Development - run the full Tauri app
bun run tauri dev

# Frontend only development
bun run dev

# Build for production
bun run build && bun run tauri build

# TypeScript type checking
task typecheck

# Rust commands
task rust:check      # Cargo check
task rust:test       # Run Rust tests
task rust:fmt        # Format Rust code
task rust:clippy     # Lint with clippy (warnings as errors)

# Clean build artifacts
task clean:web       # Remove dist/
task clean:tauri     # Cargo clean
```

## Architecture

```
React Frontend (src/)
        ↓ invoke()
   Tauri IPC Bridge
        ↓
  Rust Backend (src-tauri/src/)
        ↓
PostgreSQL Client Tools (psql, pg_dump)
```

### Frontend (src/)

- **State Management**: React Context API (`PgToolsContext` for PostgreSQL tools availability)
- **Routing**: React Router DOM with pages in `src/pages/`
- **UI Components**: Radix UI primitives wrapped in `src/components/ui/`
- **Tauri Integration**: Custom hooks in `src/hooks/use-tauri.ts`
- **Path Alias**: `@/*` maps to `./src/*`

Key pages:
- `Home.tsx` - Connection profile management
- `Clone.tsx` - Main clone operation interface
- `History.tsx` - Clone operation history
- `Settings.tsx` - App settings and updates

### Backend (src-tauri/src/)

Modular Rust architecture with separate concerns:

- `lib.rs` - Tauri setup, command exports (17 IPC commands)
- `types.rs` - Data structures (ConnectionProfile, Tag, CloneHistoryEntry, SavedOperation)
- `clone.rs` - Core cloning logic with pg_dump/psql orchestration
- `profiles.rs` - Profile and tag CRUD operations
- `connection.rs` - Connection testing and validation
- `pg_tools.rs` - PostgreSQL client tool detection
- `storage.rs` - JSON persistence layer

### Data Storage

JSON file (`db-clone-data.json`) stored in platform-specific data directory:
- macOS: `~/Library/Application Support/db-clone-app/`
- Linux: `~/.local/share/db-clone-app/`
- Windows: `%APPDATA%/db-clone-app/`

## IPC Commands

Frontend calls backend via `invoke()`. Commands are organized by category:

- **Profiles**: `get_profiles`, `save_profile`, `update_profile`, `delete_profile`, `get_profile_databases`, `get_database_info`
- **Tags**: `get_tags`, `create_tag`, `update_tag`, `delete_tag`
- **Saved Operations**: `get_saved_operations`, `save_operation`
- **Connection**: `test_connection`, `check_pg_tools`, `get_pg_tools_paths`
- **Clone**: `clone_database`, related progress/status commands

## Tech Stack

- **Frontend**: React 19, TypeScript 5.8, Vite 7, Tailwind CSS 3, Radix UI
- **Backend**: Rust 2021, Tauri 2.x, Tokio async runtime
- **Package Manager**: Bun
- **Task Runner**: Task (Taskfile.yml)

## Release Process

Releases are automated via GitHub Actions on tag push (v*). Builds for:
- Windows (x86_64)
- macOS Intel (x86_64)
- macOS Apple Silicon (aarch64)

App includes auto-updater configured with GitHub Releases.
