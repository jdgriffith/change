import * as fs from "fs-extra";

/**
 * Represents a Prisma model field
 */
export interface ModelField {
  name: string;
  type: string;
  modifiers: string[];
  attributes: string[];
}

/**
 * Represents a Prisma model
 */
export interface Model {
  name: string;
  fields: ModelField[];
}

/**
 * Represents a parsed Prisma schema
 */
export interface ParsedSchema {
  models: Model[];
  enums: any[];
  generators: any[];
  datasources: any[];
}

/**
 * Parses a Prisma schema file into a structured format
 * @param schemaPath Path to the Prisma schema file
 */
export async function parseSchema(schemaPath: string): Promise<ParsedSchema> {
  const schemaContent = await fs.readFile(schemaPath, "utf-8");

  // Initialize the structure
  const parsedSchema: ParsedSchema = {
    models: [],
    enums: [],
    generators: [],
    datasources: [],
  };

  // Parse the models
  const modelRegex = /model\s+(\w+)\s+{([^}]*)}/g;
  let modelMatch;

  while ((modelMatch = modelRegex.exec(schemaContent)) !== null) {
    const modelName = modelMatch[1];
    const modelContent = modelMatch[2];

    const model: Model = {
      name: modelName,
      fields: [],
    };

    // Parse fields
    const fieldLines = modelContent.trim().split("\n");
    for (const line of fieldLines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("//")) continue;

      // Basic field parsing
      const fieldParts = trimmedLine.split(/\s+/);
      if (fieldParts.length < 2) continue;

      const fieldName = fieldParts[0];
      const fieldType = fieldParts[1];

      // Extract modifiers and attributes
      const modifiers: string[] = [];
      const attributes: string[] = [];

      // Check for array type
      if (fieldType.endsWith("[]")) {
        modifiers.push("array");
      }

      // Extract attributes from the rest of the line
      const attributeMatch = trimmedLine.match(/@[^@]+/g);
      if (attributeMatch) {
        attributes.push(...attributeMatch.map((attr) => attr.trim()));
      }

      model.fields.push({
        name: fieldName,
        type: fieldType.replace("[]", ""),
        modifiers,
        attributes,
      });
    }

    parsedSchema.models.push(model);
  }

  // Similar parsing can be added for enums, generators, and datasources

  return parsedSchema;
}
