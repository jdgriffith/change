import type { ParsedSchema, Model } from "./schemaParser";

/**
 * Represents a detected schema change
 */
export interface SchemaChange {
  type:
    | "CREATE_MODEL"
    | "DELETE_MODEL"
    | "ALTER_MODEL"
    | "CREATE_FIELD"
    | "DELETE_FIELD"
    | "ALTER_FIELD";
  model?: string;
  field?: string;
  oldValue?: any;
  newValue?: any;
}

/**
 * Compares two parsed schema objects and returns a list of changes
 * @param oldSchema Previous schema version
 * @param newSchema New schema version
 */
export function compareSchemas(
  oldSchema: ParsedSchema,
  newSchema: ParsedSchema
): SchemaChange[] {
  const changes: SchemaChange[] = [];

  // Get model names from both schemas
  const oldModelNames = new Set(oldSchema.models.map((m) => m.name));
  const newModelNames = new Set(newSchema.models.map((m) => m.name));

  // Find created models
  for (const modelName of newModelNames) {
    if (!oldModelNames.has(modelName)) {
      const model = newSchema.models.find((m) => m.name === modelName);
      changes.push({
        type: "CREATE_MODEL",
        model: modelName,
        newValue: model,
      });
    }
  }

  // Find deleted models
  for (const modelName of oldModelNames) {
    if (!newModelNames.has(modelName)) {
      changes.push({
        type: "DELETE_MODEL",
        model: modelName,
      });
    }
  }

  // Find modified models
  for (const modelName of oldModelNames) {
    if (newModelNames.has(modelName)) {
      const oldModel = oldSchema.models.find((m) => m.name === modelName)!;
      const newModel = newSchema.models.find((m) => m.name === modelName)!;

      // Compare fields
      const changes2 = compareModelFields(oldModel, newModel);
      changes.push(...changes2);
    }
  }

  return changes;
}

/**
 * Compares fields between two models
 * @param oldModel Previous model version
 * @param newModel New model version
 */
function compareModelFields(oldModel: Model, newModel: Model): SchemaChange[] {
  const changes: SchemaChange[] = [];

  // Get field names from both models
  const oldFieldNames = new Set(oldModel.fields.map((f) => f.name));
  const newFieldNames = new Set(newModel.fields.map((f) => f.name));

  // Find created fields
  for (const fieldName of newFieldNames) {
    if (!oldFieldNames.has(fieldName)) {
      const field = newModel.fields.find((f) => f.name === fieldName);
      changes.push({
        type: "CREATE_FIELD",
        model: newModel.name,
        field: fieldName,
        newValue: field,
      });
    }
  }

  // Find deleted fields
  for (const fieldName of oldFieldNames) {
    if (!newFieldNames.has(fieldName)) {
      changes.push({
        type: "DELETE_FIELD",
        model: oldModel.name,
        field: fieldName,
      });
    }
  }

  // Find modified fields
  for (const fieldName of oldFieldNames) {
    if (newFieldNames.has(fieldName)) {
      const oldField = oldModel.fields.find((f) => f.name === fieldName)!;
      const newField = newModel.fields.find((f) => f.name === fieldName)!;

      // Compare field properties
      if (
        oldField.type !== newField.type ||
        !arraysEqual(oldField.modifiers, newField.modifiers) ||
        !arraysEqual(oldField.attributes, newField.attributes)
      ) {
        changes.push({
          type: "ALTER_FIELD",
          model: oldModel.name,
          field: fieldName,
          oldValue: oldField,
          newValue: newField,
        });
      }
    }
  }

  return changes;
}

/**
 * Utility function to compare two arrays
 */
function arraysEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  return sortedA.every((val, idx) => val === sortedB[idx]);
}
