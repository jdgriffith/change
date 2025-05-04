# DB Migrations

A lightweight database migration library that automatically creates migrations from Prisma schema file changes.

## Features

- 📝 Uses Prisma schema files as the source of truth
- 👀 Watches schema files for changes
- 🔄 Automatically generates SQL migrations
- ⏱️ Smart naming based on the changes detected
- 🔙 Includes both up and down migrations
- 🛠️ Simple CLI commands

## Installation

```bash
# Install via npm
npm install db-migrations

# Or using Yarn
yarn add db-migrations

# Or using Bun
bun add db-migrations
```

## Quick Start

1. Initialize the migration system:

```bash
bun run db:migration:init
```

2. Start watching your Prisma schema for changes:

```bash
bun run db:migration:watch
```

3. Edit your Prisma schema file and save it. Migrations will be automatically generated!

## Configuration

Create a `migration-config.json` file in your project root:

```json
{
  "schemaPath": "./prisma/schema.prisma",
  "migrationsDir": "./src/migrations",
  "autoApply": false,
  "databaseUrl": "postgresql://username:password@localhost:5432/dbname"
}
```

## CLI Commands

- `bun run db:migration:init` - Initialize the migration system
- `bun run db:migration:watch` - Watch the schema file for changes
- `bun run db:migration:create [name]` - Create a new migration (interactive)
- `bun run db:migration:apply [name]` - Apply pending migration
- `bun run db:migration:list` - List all migrations

## Programmatic Usage

```typescript
import { MigrationManager } from "db-migrations";

const manager = new MigrationManager({
  schemaPath: "./prisma/schema.prisma",
  migrationsDir: "./src/migrations",
  autoApply: false,
});

// Initialize the manager
await manager.initialize();

// Start watching for changes
await manager.watch();

// Later, when you want to stop watching
await manager.stop();
```

## How It Works

1. The library parses your Prisma schema into a structured representation
2. When changes are detected, it compares the new schema with the previous version
3. SQL migrations are automatically generated based on the differences
4. Migrations are stored in your specified directory with appropriate up/down commands

## Migration File Structure

Each migration is stored in its own directory with the following structure:

```
migrations/
  ├── 20250504123456_add_user_model/
  │   ├── migration.json   # Metadata about the migration
  │   ├── up.sql           # SQL to apply the migration
  │   └── down.sql         # SQL to roll back the migration
  └── 20250504124567_add_profile_field_to_user/
      ├── migration.json
      ├── up.sql
      └── down.sql
```

## License

MIT
