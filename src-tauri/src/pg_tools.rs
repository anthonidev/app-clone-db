use std::fs;
use std::path::PathBuf;

use crate::command_helper::create_command;

/// Encuentra todas las versiones de PostgreSQL instaladas en Windows
/// Retorna las rutas ordenadas de mayor a menor versión
fn find_pg_install_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if cfg!(windows) {
        // Buscar en Program Files
        let program_files = vec![
            "C:\\Program Files\\PostgreSQL",
            "C:\\Program Files (x86)\\PostgreSQL",
        ];

        for base in program_files {
            if let Ok(entries) = fs::read_dir(base) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        // Verificar si es un directorio de versión (número)
                        if let Some(name) = path.file_name() {
                            if let Some(name_str) = name.to_str() {
                                // Verificar si el nombre es un número (versión)
                                if name_str.parse::<u32>().is_ok() {
                                    let bin_path = path.join("bin");
                                    if bin_path.exists() {
                                        dirs.push(bin_path);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Ordenar por versión descendente (más reciente primero)
        dirs.sort_by(|a, b| {
            let version_a = a
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);
            let version_b = b
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);
            version_b.cmp(&version_a)
        });
    }

    dirs
}

/// Encuentra el ejecutable psql
/// Primero intenta encontrarlo en el PATH, luego busca en las instalaciones de PostgreSQL
pub fn find_psql() -> Option<String> {
    // Primero intentar en el PATH
    if let Some(path) = find_in_path("psql") {
        return Some(path);
    }

    // Buscar en instalaciones de PostgreSQL (Windows)
    if cfg!(windows) {
        for bin_dir in find_pg_install_dirs() {
            let psql_path = bin_dir.join("psql.exe");
            if psql_path.exists() {
                if let Some(path_str) = psql_path.to_str() {
                    // Verificar que funciona
                    if create_command(path_str).arg("--version").output().is_ok() {
                        return Some(path_str.to_string());
                    }
                }
            }
        }
    } else {
        // Linux/macOS rutas comunes
        let unix_paths = vec![
            "/usr/bin/psql",
            "/usr/local/bin/psql",
            "/opt/homebrew/bin/psql",
            "/usr/local/pgsql/bin/psql",
        ];

        for path in unix_paths {
            if std::path::Path::new(path).exists() {
                if create_command(path).arg("--version").output().is_ok() {
                    return Some(path.to_string());
                }
            }
        }
    }

    None
}

/// Encuentra el ejecutable pg_dump
/// Primero intenta encontrarlo en el PATH, luego busca en las instalaciones de PostgreSQL
pub fn find_pg_dump() -> Option<String> {
    // Primero intentar en el PATH
    if let Some(path) = find_in_path("pg_dump") {
        return Some(path);
    }

    // Buscar en instalaciones de PostgreSQL (Windows)
    if cfg!(windows) {
        for bin_dir in find_pg_install_dirs() {
            let pg_dump_path = bin_dir.join("pg_dump.exe");
            if pg_dump_path.exists() {
                if let Some(path_str) = pg_dump_path.to_str() {
                    // Verificar que funciona
                    if create_command(path_str).arg("--version").output().is_ok() {
                        return Some(path_str.to_string());
                    }
                }
            }
        }
    } else {
        // Linux/macOS rutas comunes
        let unix_paths = vec![
            "/usr/bin/pg_dump",
            "/usr/local/bin/pg_dump",
            "/opt/homebrew/bin/pg_dump",
            "/usr/local/pgsql/bin/pg_dump",
        ];

        for path in unix_paths {
            if std::path::Path::new(path).exists() {
                if create_command(path).arg("--version").output().is_ok() {
                    return Some(path.to_string());
                }
            }
        }
    }

    None
}

/// Intenta encontrar un ejecutable en el PATH del sistema
fn find_in_path(executable: &str) -> Option<String> {
    let output = if cfg!(windows) {
        create_command("where").arg(executable).output()
    } else {
        create_command("which").arg(executable).output()
    };

    if let Ok(output) = output {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();

            if !path.is_empty() {
                // Verificar que el ejecutable funciona
                let check = create_command(&path).arg("--version").output();

                if check.is_ok() {
                    return Some(path);
                }
            }
        }
    }

    None
}

/// Obtiene la versión del cliente PostgreSQL instalado
pub fn get_pg_client_version() -> Option<String> {
    let psql = find_psql()?;

    let output = create_command(&psql).arg("--version").output().ok()?;

    if output.status.success() {
        let version_str = String::from_utf8_lossy(&output.stdout);
        // Formato típico: "psql (PostgreSQL) 16.1"
        Some(version_str.trim().to_string())
    } else {
        None
    }
}

/// Verifica si las herramientas de PostgreSQL están disponibles
pub fn check_tools_available() -> bool {
    find_psql().is_some() && find_pg_dump().is_some()
}
