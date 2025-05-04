import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs-extra";
import * as path from "path";
import { parseSchema } from "../src/lib/schemaParser";
import { compareSchemas } from "../src/lib/schemaComparer";
import { generateMigration } from "../src/lib/migrationGenerator";
import { MigrationManager } from "../src/lib/migrationManager";

const TEST_DIR = path.join(process.cwd(), "tests", "temp");
const SCHEMA_PATH = path.join(TEST_DIR, "schema.prisma");
const MIGRATIONS_DIR = path.join(TEST_DIR, "migrations");

// Sample schema files for testing
const INITIAL_SCHEMA = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  createdAt DateTime @default(now())
}
`;

const MODIFIED_SCHEMA = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int       @id @default(autoincrement())
  email     String    @unique
  name      String
  bio       String?
  posts     Post[]
  createdAt DateTime  @default(now())
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  Int
  createdAt DateTime @default(now())
}
`;

beforeEach(async () => {
  // Set up test directory
  await fs.ensureDir(TEST_DIR);
  await fs.ensureDir(MIGRATIONS_DIR);
});

afterEach(async () => {
  // Clean up test directory
  await fs.remove(TEST_DIR);
});

describe("Schema Parser", () => {
  test("should parse a Prisma schema file", async () => {
    // Write the test schema file
    await fs.writeFile(SCHEMA_PATH, INITIAL_SCHEMA);

    // Parse the schema
    const schema = await parseSchema(SCHEMA_PATH);

    // Assertions
    expect(schema.models.length).toBe(1);
    expect(schema.models[0]?.name).toBe("User");
    expect(schema.models[0]?.fields.length).toBe(4); // id, email, name, createdAt
  });
});

describe("Schema Comparer", () => {
  test("should detect changes between schemas", async () => {
    // Write the initial schema and parse it
    await fs.writeFile(SCHEMA_PATH, INITIAL_SCHEMA);
    const initialSchema = await parseSchema(SCHEMA_PATH);

    // Write the modified schema and parse it
    await fs.writeFile(SCHEMA_PATH, MODIFIED_SCHEMA);
    const modifiedSchema = await parseSchema(SCHEMA_PATH);

    // Compare the schemas
    const changes = compareSchemas(initialSchema, modifiedSchema);

    // Assertions
    expect(changes.length).toBeGreaterThan(0);

    // Should have at least these changes:
    // 1. CREATE_MODEL for Post
    // 2. CREATE_FIELD for User.bio
    // 3. CREATE_FIELD for User.posts

    const createModelChanges = changes.filter((c) => c.type === "CREATE_MODEL");
    expect(createModelChanges.length).toBe(1);
    expect(createModelChanges[0]?.model).toBe("Post");

    const createFieldChanges = changes.filter(
      (c) => c.type === "CREATE_FIELD" && c.model === "User"
    );
    expect(createFieldChanges.length).toBe(2);
    expect(createFieldChanges.some((c) => c.field === "bio")).toBe(true);
    expect(createFieldChanges.some((c) => c.field === "posts")).toBe(true);
  });
});

describe("Migration Generator", () => {
  test("should generate migration files from schema changes", async () => {
    // Write the initial schema and parse it
    await fs.writeFile(SCHEMA_PATH, INITIAL_SCHEMA);
    const initialSchema = await parseSchema(SCHEMA_PATH);

    // Write the modified schema and parse it
    await fs.writeFile(SCHEMA_PATH, MODIFIED_SCHEMA);
    const modifiedSchema = await parseSchema(SCHEMA_PATH);

    // Compare the schemas
    const changes = compareSchemas(initialSchema, modifiedSchema);

    // Generate a migration
    const migration = await generateMigration(
      changes,
      MIGRATIONS_DIR,
      "test_migration"
    );

    // Assertions
    expect(migration).not.toBeNull();

    // Check that migration files were created
    const migrationDir = path.join(MIGRATIONS_DIR, migration!.id);
    expect(await fs.pathExists(migrationDir)).toBe(true);
    expect(await fs.pathExists(path.join(migrationDir, "up.sql"))).toBe(true);
    expect(await fs.pathExists(path.join(migrationDir, "down.sql"))).toBe(true);
    expect(await fs.pathExists(path.join(migrationDir, "migration.json"))).toBe(
      true
    );

    // Check migration content
    const upSql = await fs.readFile(path.join(migrationDir, "up.sql"), "utf-8");
    expect(upSql).toContain("CREATE TABLE post");
    expect(upSql).toContain("ALTER TABLE user ADD COLUMN bio");
  });
});

describe("Migration Manager", () => {
  test("should initialize and detect schema changes", async () => {
    // Write the initial schema
    await fs.writeFile(SCHEMA_PATH, INITIAL_SCHEMA);

    // Create a manager instance
    const manager = new MigrationManager({
      schemaPath: SCHEMA_PATH,
      migrationsDir: MIGRATIONS_DIR,
      autoApply: false,
    });

    // Initialize the manager
    await manager.initialize();

    // Simulate a schema change
    await fs.writeFile(SCHEMA_PATH, MODIFIED_SCHEMA);

    // Call the internal method to handle the change (normally triggered by watcher)
    // @ts-ignore accessing private method for testing
    await manager.handleSchemaChange();

    // Check that a migration was created
    const migrations = await manager.getMigrations();
    expect(migrations.length).toBe(1);

    // Verify migration content
    expect(migrations[0]?.upSql).toContain("CREATE TABLE");
    expect(migrations[0]?.downSql).toContain("DROP TABLE");
  });
});
