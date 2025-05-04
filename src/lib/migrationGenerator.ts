import * as fs from "fs-extra";
import * as path from "path";
import type { SchemaChange } from "./schemaComparer";
import type { ModelField } from "./schemaParser";

/**
 * Represents a migration file
 */
export interface Migration {
  id: string;
  name: string;
  timestamp: string;
  upSql: string;
  downSql: string;
}

/**
 * Maps Prisma types to SQL types
 */
const typeMap: Record<string, string> = {
  String: "TEXT",
  Int: "INTEGER",
  Float: "REAL",
  Boolean: "BOOLEAN",
  DateTime: "TIMESTAMP",
  Json: "JSONB",
};

/**
 * Generates a new migration based on schema changes
 * @param changes List of schema changes
 * @param migrationsDir Directory to store migrations
 * @param migrationName Optional custom name for the migration
 */
export async function generateMigration(
  changes: SchemaChange[],
  migrationsDir: string,
  migrationName?: string
): Promise<Migration | null> {
  if (changes.length === 0) {
    return null; // No changes to migrate
  }

  // Prepare SQL statements
  const upStatements: string[] = [];
  const downStatements: string[] = [];

  // Process each change and generate the appropriate SQL
  for (const change of changes) {
    switch (change.type) {
      case "CREATE_MODEL":
        const { createTableSql, dropTableSql } = generateCreateTableSql(change);
        upStatements.push(createTableSql);
        downStatements.push(dropTableSql);
        break;

      case "DELETE_MODEL":
        const { createTableSqlReverse, dropTableSqlReverse } =
          generateDropTableSql(change);
        upStatements.push(dropTableSqlReverse);
        downStatements.push(createTableSqlReverse);
        break;

      case "CREATE_FIELD":
        const { addColumnSql, dropColumnSql } = generateAddColumnSql(change);
        upStatements.push(addColumnSql);
        downStatements.push(dropColumnSql);
        break;

      case "DELETE_FIELD":
        const { addColumnSqlReverse, dropColumnSqlReverse } =
          generateDropColumnSql(change);
        upStatements.push(dropColumnSqlReverse);
        downStatements.push(addColumnSqlReverse);
        break;

      case "ALTER_FIELD":
        const { alterColumnSql, revertColumnSql } =
          generateAlterColumnSql(change);
        upStatements.push(alterColumnSql);
        downStatements.push(revertColumnSql);
        break;
    }
  }

  // Create migration file
  const timestamp = new Date().toISOString().replace(/[^\d]/g, "").slice(0, 14);
  const migrationId = `${timestamp}${migrationName ? `_${migrationName}` : ""}`;

  // Compose migration content
  const upSql = upStatements.join("\n\n");
  const downSql = downStatements.join("\n\n");

  // Create migration object
  const migration: Migration = {
    id: migrationId,
    name: migrationName || `migration_${timestamp}`,
    timestamp,
    upSql,
    downSql,
  };

  // Save migration files
  await saveMigrationFiles(migration, migrationsDir);

  return migration;
}

/**
 * Save migration files to disk
 * @param migration Migration to save
 * @param migrationsDir Directory to store migrations
 */
async function saveMigrationFiles(
  migration: Migration,
  migrationsDir: string
): Promise<void> {
  const migrationDir = path.join(migrationsDir, migration.id);
  await fs.ensureDir(migrationDir);

  // Save migration metadata
  await fs.writeJson(
    path.join(migrationDir, "migration.json"),
    {
      id: migration.id,
      name: migration.name,
      timestamp: migration.timestamp,
    },
    { spaces: 2 }
  );

  // Save SQL files
  await fs.writeFile(path.join(migrationDir, "up.sql"), migration.upSql);
  await fs.writeFile(path.join(migrationDir, "down.sql"), migration.downSql);
}

/**
 * Generate SQL for creating a table
 */
function generateCreateTableSql(change: SchemaChange): {
  createTableSql: string;
  dropTableSql: string;
} {
  const model = change.newValue;
  const tableName = model.name.toLowerCase();

  // Generate column definitions
  const columnDefinitions = model.fields
    .map((field: ModelField) => {
      const sqlType = typeMap[field.type] || "TEXT";
      const constraints: string[] = [];

      // Handle constraints based on attributes
      for (const attr of field.attributes) {
        if (attr.includes("@id")) constraints.push("PRIMARY KEY");
        if (attr.includes("@unique")) constraints.push("UNIQUE");
        if (!attr.includes("?") && !attr.includes("@default"))
          constraints.push("NOT NULL");
      }

      return `  ${field.name} ${sqlType} ${constraints.join(" ")}`;
    })
    .join(",\n");

  // Create table SQL
  const createTableSql = `CREATE TABLE ${tableName} (\n${columnDefinitions}\n);`;

  // Drop table SQL (for down migration)
  const dropTableSql = `DROP TABLE IF EXISTS ${tableName};`;

  return { createTableSql, dropTableSql };
}

/**
 * Generate SQL for dropping a table
 */
function generateDropTableSql(change: SchemaChange): {
  createTableSqlReverse: string;
  dropTableSqlReverse: string;
} {
  const tableName = change.model?.toLowerCase() || "";

  // Drop table SQL
  const dropTableSqlReverse = `DROP TABLE IF EXISTS ${tableName};`;

  // This would need model information to create a proper reverse migration
  // For now, we'll just add a comment
  const createTableSqlReverse = `-- To properly reverse this migration, you need to recreate the table with its original structure
-- CREATE TABLE ${tableName} (...);`;

  return { createTableSqlReverse, dropTableSqlReverse };
}

/**
 * Generate SQL for adding a column
 */
function generateAddColumnSql(change: SchemaChange): {
  addColumnSql: string;
  dropColumnSql: string;
} {
  const tableName = change.model?.toLowerCase() || "";
  const field = change.newValue;

  const sqlType = typeMap[field.type] || "TEXT";
  const constraints: string[] = [];

  // Handle constraints based on attributes
  for (const attr of field.attributes) {
    if (attr.includes("@id")) constraints.push("PRIMARY KEY");
    if (attr.includes("@unique")) constraints.push("UNIQUE");
    if (!attr.includes("?") && !attr.includes("@default"))
      constraints.push("NOT NULL");
  }

  // Add column SQL
  const addColumnSql = `ALTER TABLE ${tableName} ADD COLUMN ${
    field.name
  } ${sqlType} ${constraints.join(" ")};`;

  // Drop column SQL (for down migration)
  const dropColumnSql = `ALTER TABLE ${tableName} DROP COLUMN ${field.name};`;

  return { addColumnSql, dropColumnSql };
}

/**
 * Generate SQL for dropping a column
 */
function generateDropColumnSql(change: SchemaChange): {
  addColumnSqlReverse: string;
  dropColumnSqlReverse: string;
} {
  const tableName = change.model?.toLowerCase() || "";
  const fieldName = change.field || "";

  // Drop column SQL
  const dropColumnSqlReverse = `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;

  // This would need field information to create a proper reverse migration
  // For now, we'll just add a comment
  const addColumnSqlReverse = `-- To properly reverse this migration, you need to add the column back with its original definition
-- ALTER TABLE ${tableName} ADD COLUMN ${fieldName} ...;`;

  return { addColumnSqlReverse, dropColumnSqlReverse };
}

/**
 * Generate SQL for altering a column
 */
function generateAlterColumnSql(change: SchemaChange): {
  alterColumnSql: string;
  revertColumnSql: string;
} {
  const tableName = change.model?.toLowerCase() || "";
  const oldField = change.oldValue;
  const newField = change.newValue;

  // Extract types
  const oldSqlType = typeMap[oldField.type] || "TEXT";
  const newSqlType = typeMap[newField.type] || "TEXT";

  // Alter column SQL
  const alterColumnSql = `ALTER TABLE ${tableName} ALTER COLUMN ${newField.name} TYPE ${newSqlType};
-- Additional constraints may need to be modified separately`;

  // Revert column SQL (for down migration)
  const revertColumnSql = `ALTER TABLE ${tableName} ALTER COLUMN ${oldField.name} TYPE ${oldSqlType};
-- Additional constraints may need to be modified separately`;

  return { alterColumnSql, revertColumnSql };
}
