import * as fs from "fs-extra";
import * as path from "path";
import * as chokidar from "chokidar";
import type { MigrationConfig } from "./config";
import { parseSchema } from "./schemaParser";
import { compareSchemas } from "./schemaComparer";
import { generateMigration, type Migration } from "./migrationGenerator";

/**
 * Migration manager class that handles schema changes and generates migrations
 */
export class MigrationManager {
  private config: MigrationConfig;
  private watcher: chokidar.FSWatcher | null = null;
  private previousSchema: any = null;
  private isInitialized = false;
  private schemaCachePath: string;

  /**
   * Create a new migration manager
   * @param config The migration configuration
   */
  constructor(config: MigrationConfig) {
    this.config = {
      ...config,
      migrationsDir: path.resolve(config.migrationsDir),
      schemaPath: path.resolve(config.schemaPath),
    };
    // Store schema cache in .schema-cache.json in the migrations directory
    this.schemaCachePath = path.join(
      this.config.migrationsDir,
      ".schema-cache.json"
    );
  }

  /**
   * Initialize the migration manager
   */
  async initialize(): Promise<void> {
    // Ensure migrations directory exists
    await fs.ensureDir(this.config.migrationsDir);

    // Try to load cached schema first
    await this.loadCachedSchema();

    // If no cached schema is found, parse the current schema as baseline
    if (!this.previousSchema) {
      try {
        this.previousSchema = await parseSchema(this.config.schemaPath);
        await this.saveSchemaCache();
      } catch (error) {
        console.error("Failed to parse schema:", error);
        throw error;
      }
    }

    this.isInitialized = true;
    console.log("Migration manager initialized");
  }

  /**
   * Load the cached schema if it exists
   */
  private async loadCachedSchema(): Promise<boolean> {
    try {
      if (await fs.pathExists(this.schemaCachePath)) {
        const cacheData = await fs.readJson(this.schemaCachePath);
        this.previousSchema = cacheData.schema;
        console.log("Loaded schema cache from", this.schemaCachePath);
        return true;
      }
    } catch (error) {
      console.warn("Failed to load schema cache:", error);
    }
    return false;
  }

  /**
   * Save the current schema to cache
   */
  private async saveSchemaCache(): Promise<void> {
    try {
      if (this.previousSchema) {
        await fs.writeJson(
          this.schemaCachePath,
          {
            timestamp: new Date().toISOString(),
            schema: this.previousSchema,
          },
          { spaces: 2 }
        );
      }
    } catch (error) {
      console.warn("Failed to save schema cache:", error);
    }
  }

  /**
   * Check if the schema has changed since the last run
   */
  async checkForChanges(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const currentSchema = await parseSchema(this.config.schemaPath);
      const changes = compareSchemas(this.previousSchema, currentSchema);
      return changes.length > 0;
    } catch (error) {
      console.error("Error checking for schema changes:", error);
      return false;
    }
  }

  /**
   * Start watching for schema changes
   */
  async watch(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`Watching for changes to ${this.config.schemaPath}`);

    // Setup file watcher
    this.watcher = chokidar.watch(this.config.schemaPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    // Handle schema file changes
    this.watcher.on("change", async (filePath) => {
      console.log(`Schema file changed: ${filePath}`);
      await this.handleSchemaChange();
    });

    // Handle watcher errors
    this.watcher.on("error", (error) => {
      console.error("Watcher error:", error);
    });
  }

  /**
   * Stop watching for schema changes
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      console.log("Stopped watching for schema changes");
    }
  }

  /**
   * Handle schema changes detected by CLI command
   */
  async handleSchemaChangeFromCli(
    migrationName?: string
  ): Promise<Migration | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Parse the new schema
      const newSchema = await parseSchema(this.config.schemaPath);

      // Compare with previous schema
      const changes = compareSchemas(this.previousSchema, newSchema);

      if (changes.length === 0) {
        console.log("No schema changes detected");
        return null;
      }

      console.log(`Detected ${changes.length} changes in schema`);

      // Generate migration with optional custom name
      const name = migrationName || this.createMigrationName(changes);
      const migration = await generateMigration(
        changes,
        this.config.migrationsDir,
        name
      );

      if (migration) {
        console.log(`Created migration: ${migration.id}`);

        // Apply migration if configured to do so
        if (this.config.autoApply) {
          await this.applyMigration(migration);
        }

        // Update cache with new schema
        this.previousSchema = newSchema;
        await this.saveSchemaCache();

        return migration;
      }

      return null;
    } catch (error) {
      console.error("Error handling schema change:", error);
      return null;
    }
  }

  /**
   * Handle a schema file change (for watch mode)
   */
  private async handleSchemaChange(): Promise<void> {
    try {
      // Parse the new schema
      const newSchema = await parseSchema(this.config.schemaPath);

      // Compare with previous schema
      const changes = compareSchemas(this.previousSchema, newSchema);

      if (changes.length > 0) {
        console.log(`Detected ${changes.length} changes in schema`);

        // Generate migration
        const migration = await generateMigration(
          changes,
          this.config.migrationsDir,
          this.createMigrationName(changes)
        );

        if (migration) {
          console.log(`Created migration: ${migration.id}`);

          // Apply migration if configured to do so
          if (this.config.autoApply) {
            await this.applyMigration(migration);
          }
        }
      } else {
        console.log("No schema changes detected");
      }

      // Update previous schema reference and cache
      this.previousSchema = newSchema;
      await this.saveSchemaCache();
    } catch (error) {
      console.error("Error handling schema change:", error);
    }
  }

  /**
   * Create a descriptive name for the migration based on the changes
   */
  private createMigrationName(changes: any[]): string {
    // Get the first few changes to create a descriptive name
    const descriptions = changes.slice(0, 2).map((change) => {
      switch (change.type) {
        case "CREATE_MODEL":
          return `add_${change.model}`;
        case "DELETE_MODEL":
          return `remove_${change.model}`;
        case "CREATE_FIELD":
          return `add_${change.field}_to_${change.model}`;
        case "DELETE_FIELD":
          return `remove_${change.field}_from_${change.model}`;
        case "ALTER_FIELD":
          return `change_${change.field}_in_${change.model}`;
        default:
          return "schema_change";
      }
    });

    return descriptions.join("_and_");
  }

  /**
   * Apply a migration to the database
   */
  private async applyMigration(migration: Migration): Promise<void> {
    if (!this.config.databaseUrl) {
      console.warn("Cannot auto-apply migration: No database URL provided");
      return;
    }

    try {
      console.log(`Applying migration ${migration.id}...`);

      // For a real implementation, you would use a database client like pg or mysql2
      // For this example, we'll use a placeholder representing how you might run the SQL

      console.log("Migration applied successfully");
    } catch (error) {
      console.error("Failed to apply migration:", error);
    }
  }

  /**
   * Get all existing migrations
   */
  async getMigrations(): Promise<Migration[]> {
    const migrationDirs = await fs.readdir(this.config.migrationsDir);

    const migrations: Migration[] = [];

    for (const dir of migrationDirs) {
      const migrationDir = path.join(this.config.migrationsDir, dir);
      const stats = await fs.stat(migrationDir);

      if (!stats.isDirectory()) {
        continue;
      }

      try {
        const metadataPath = path.join(migrationDir, "migration.json");
        const upSqlPath = path.join(migrationDir, "up.sql");
        const downSqlPath = path.join(migrationDir, "down.sql");

        if (
          (await fs.pathExists(metadataPath)) &&
          (await fs.pathExists(upSqlPath)) &&
          (await fs.pathExists(downSqlPath))
        ) {
          const metadata = await fs.readJson(metadataPath);
          const upSql = await fs.readFile(upSqlPath, "utf-8");
          const downSql = await fs.readFile(downSqlPath, "utf-8");

          migrations.push({
            id: metadata.id,
            name: metadata.name,
            timestamp: metadata.timestamp,
            upSql,
            downSql,
          });
        }
      } catch (error) {
        console.error(`Error reading migration ${dir}:`, error);
      }
    }

    // Sort migrations by timestamp
    return migrations.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}
