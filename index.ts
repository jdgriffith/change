#!/usr/bin/env bun
import * as path from "path";
import * as fs from "fs-extra";
import { MigrationManager } from "./src/lib/migrationManager";
import { MigrationConfig } from "./src/lib/config";
import { parseSchema } from "./src/lib/schemaParser";
import { compareSchemas } from "./src/lib/schemaComparer";
import { generateMigration } from "./src/lib/migrationGenerator";

// Export library components for programmatic use
export { MigrationManager } from "./src/lib/migrationManager";
export { MigrationConfig } from "./src/lib/config";
export { parseSchema } from "./src/lib/schemaParser";
export { compareSchemas } from "./src/lib/schemaComparer";
export { generateMigration } from "./src/lib/migrationGenerator";

// CLI implementation
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Default configuration
  const defaultConfig: MigrationConfig = {
    schemaPath: path.join(process.cwd(), "prisma", "schema.prisma"),
    migrationsDir: path.join(process.cwd(), "src", "migrations"),
    autoApply: false,
  };

  // Check for config file
  let config = defaultConfig;
  const configPath = path.join(process.cwd(), "migration-config.json");

  if (await fs.pathExists(configPath)) {
    try {
      const userConfig = await fs.readJson(configPath);
      config = { ...defaultConfig, ...userConfig };
    } catch (error) {
      console.error("Error reading config file:", error);
    }
  }

  const manager = new MigrationManager(config);

  switch (command) {
    case "init":
      // Initialize the migration system
      await fs.ensureDir(config.migrationsDir);

      // Save current schema as baseline
      await manager.initialize();
      console.log("Migration system initialized");
      break;

    case "watch":
      // Watch for schema changes
      console.log(`Starting to watch ${config.schemaPath} for changes...`);
      await manager.initialize();
      await manager.watch();

      // Keep process running
      process.stdin.resume();

      // Handle process termination
      process.on("SIGINT", async () => {
        console.log("Stopping migration watcher...");
        await manager.stop();
        process.exit(0);
      });
      break;

    case "create":
      // Create a new migration manually
      const migrationName = args[1] || "migration";

      // Initialize manager
      await manager.initialize();

      // Parse the current schema
      const currentSchema = await parseSchema(config.schemaPath);

      // Create a backup of the current schema
      const backupPath = path.join(
        process.cwd(),
        "prisma",
        ".schema.prisma.backup"
      );
      await fs.writeFile(
        backupPath,
        await fs.readFile(config.schemaPath, "utf-8")
      );

      console.log(
        "Schema backed up. Please edit the schema.prisma file with your changes."
      );
      console.log("When done, run: bun run db:migration:apply");
      break;

    case "apply":
      // Apply pending migration after manual create
      const backupSchemaPath = path.join(
        process.cwd(),
        "prisma",
        ".schema.prisma.backup"
      );

      if (!(await fs.pathExists(backupSchemaPath))) {
        console.error('No backup schema found. Run "create" first.');
        process.exit(1);
      }

      // Parse both schemas
      const oldSchema = await parseSchema(backupSchemaPath);
      const newSchema = await parseSchema(config.schemaPath);

      // Compare schemas
      const changes = compareSchemas(oldSchema, newSchema);

      if (changes.length === 0) {
        console.log("No changes detected in the schema.");
        process.exit(0);
      }

      console.log(`Detected ${changes.length} changes in schema`);

      // Generate migration
      const manualMigrationName = args[1] || "manual_migration";
      const migration = await generateMigration(
        changes,
        config.migrationsDir,
        manualMigrationName
      );

      if (migration) {
        console.log(`Created migration: ${migration.id}`);
        console.log(
          `Migration files created in ${path.join(
            config.migrationsDir,
            migration.id
          )}`
        );

        // Remove backup
        await fs.remove(backupSchemaPath);
      }
      break;

    case "list":
      // List all migrations
      await manager.initialize();
      const migrations = await manager.getMigrations();

      console.log(`Found ${migrations.length} migrations:`);
      for (const migration of migrations) {
        console.log(`- ${migration.id}: ${migration.name}`);
      }
      break;

    case "help":
    default:
      console.log(`
DB Migration CLI

Commands:
  init                Initialize the migration system
  watch               Watch the schema file for changes
  create [name]       Create a new migration (interactive)
  apply [name]        Apply pending migration
  list                List all migrations
  help                Show this help message
`);
      break;
  }
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
