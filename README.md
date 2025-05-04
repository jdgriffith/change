# DB Migrations

A lightweight database migration library that automatically creates migrations from Prisma schema file changes.

## Features

- 📝 Uses Prisma schema files as the source of truth
- 👀 Watches schema files for changes
- 🔄 Automatically generates SQL migrations
- ⏱️ Smart naming based on the changes detected
- 🔙 Includes both up and down migrations
- 🛠️ Simple CLI commands
- 💾 Tracks schema changes between CLI invocations

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

2. You can either watch for changes continuously:

```bash
bun run db:migration:watch
```

Or check for changes whenever you run the CLI:

```bash
bun run db:migration:check
```

3. When changes are detected, generate migrations:

```bash
bun run db:migration:generate my_migration_name
```

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
- `bun run db:migration:watch` - Watch the schema file for changes continuously
- `bun run db:migration:check` - Check for schema changes since last run
- `bun run db:migration:check --generate` - Check for changes and generate migrations if detected
- `bun run db:migration:generate [name]` - Generate migration from current schema changes
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

// Check for changes since last run
const hasChanges = await manager.checkForChanges();

if (hasChanges) {
  // Generate a migration
  const migration = await manager.handleSchemaChangeFromCli("my_migration");
  console.log(`Created migration: ${migration.id}`);
}

// Or you can watch for changes continuously
await manager.watch();

// Later, when you want to stop watching
await manager.stop();
```

## How It Works

1. The library parses your Prisma schema into a structured representation
2. When changes are detected (either through watching or checking), it compares the new schema with the previous version
3. SQL migrations are automatically generated based on the differences
4. Migrations are stored in your specified directory with appropriate up/down commands
5. A cached version of the schema is saved between runs to detect changes when running CLI commands

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
