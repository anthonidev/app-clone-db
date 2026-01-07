# DB Clone

Aplicación de escritorio para clonar bases de datos PostgreSQL.

## Requisitos

- [Bun](https://bun.sh/) >= 1.0
- [Rust](https://rustup.rs/) >= 1.70
- [PostgreSQL](https://www.postgresql.org/download/) (cliente: `psql`, `pg_dump`)
- [Task](https://taskfile.dev/) (opcional)

## Instalación

```bash
# Instalar dependencias
bun install
```

## Desarrollo

```bash
# Ejecutar en modo desarrollo
bun run tauri dev

# O con Task
task tauri:dev
```

## Build

```bash
# Generar ejecutable
bun run tauri build

# O con Task
task tauri:build
```

El instalador se genera en `src-tauri/target/release/bundle/`.

## Estructura

```
├── src/                 # Frontend React
├── src-tauri/          # Backend Rust
│   ├── src/
│   │   ├── lib.rs      # Entry point Tauri
│   │   ├── types.rs    # Tipos de datos
│   │   ├── profiles.rs # CRUD conexiones y tags
│   │   ├── clone.rs    # Lógica de clonación
│   │   └── pg_tools.rs # Detección PostgreSQL
│   └── tauri.conf.json
├── Taskfile.yml
└── package.json
```

## Funcionalidades

- Gestión de conexiones PostgreSQL
- Clonación de bases de datos (estructura, datos o ambos)
- Organización con tags de colores
- Historial de operaciones
- Temas claro/oscuro
