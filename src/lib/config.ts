/**
 * Configuration options for the migration library
 */
export interface MigrationConfig {
  /**
   * Path to the Prisma schema file
   */
  schemaPath: string;

  /**
   * Directory where migrations will be stored
   */
  migrationsDir: string;

  /**
   * Database connection URL
   */
  databaseUrl?: string;

  /**
   * Whether to apply migrations automatically after creation
   */
  autoApply: boolean;

  /**
   * Custom migration naming function
   */
  migrationNaming?: (timestamp: string) => string;
}
