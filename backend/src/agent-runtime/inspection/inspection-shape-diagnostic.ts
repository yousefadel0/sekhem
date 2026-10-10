import { createHash } from "node:crypto";

export const INSPECTION_SHAPE_LIST_LIMIT = 32;
type StructuralType = "object" | "array" | "string" | "number" | "boolean" | "null" | "missing";
type Schema = { type?: string; properties?: Record<string, Schema>; required?: readonly string[]; items?: Schema; anyOf?: readonly Schema[] };
export interface InspectionShapeDiagnostic {
  expectedType: string;
  actualType: StructuralType;
  expectedKeys: string[];
  actualKeys: string[];
  missingKeys: string[];
  unexpectedKeys: string[];
  wrongTypeFields: Array<{ path: string; expectedType: string; actualType: StructuralType }>;
  truncated: boolean;
}
const generated = new WeakSet<object>();
const kind = (value: unknown): StructuralType => value === undefined ? "missing" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value as StructuralType;
const types = (schema: Schema): string[] => schema.anyOf ? schema.anyOf.flatMap(types) : [schema.type ?? "object"];
/** Unknown property names can themselves contain secrets: retain only their fingerprint. */
const unknownKey = (key: string) => `unknown:sha256:${createHash("sha256").update(key).digest("hex")}`;

/** Diagnostic only. Traverses an existing validator path, never validates or repairs output. */
export function inspectionShapeDiagnostic(root: unknown, schema: Schema, path: string): InspectionShapeDiagnostic | undefined {
  if (path.length > 128 || !/^\$(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*$/.test(path)) return undefined;
  let value = root, current = schema;
  for (const token of path.slice(1).match(/\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\]/g) ?? []) {
    if (token.startsWith("[")) {
      if (!current.items) return undefined;
      current = current.items; value = Array.isArray(value) ? value[Number(token.slice(1, -1))] : undefined;
    } else {
      const key = token.slice(1);
      if (!current.properties || !Object.prototype.hasOwnProperty.call(current.properties, key)) return undefined;
      current = current.properties[key];
      value = value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key) ? (value as Record<string, unknown>)[key] : undefined;
    }
  }
  const objectSchema = current.anyOf?.find(s => s.type === "object") ?? current;
  const properties = objectSchema.properties ?? {};
  const expectedKeys = Object.keys(properties);
  const actualKeys = kind(value) === "object" ? Object.keys(value as object) : [];
  const missingKeys = (objectSchema.required ?? []).filter(key => !actualKeys.includes(key));
  const unexpectedKeys = actualKeys.filter(key => !Object.prototype.hasOwnProperty.call(properties, key));
  const wrongTypeFields = actualKeys.length ? expectedKeys.filter(key => actualKeys.includes(key) &&
    !types(properties[key]).includes(kind((value as Record<string, unknown>)[key]))).map(key => ({
      path: `${path}.${key}`, expectedType: types(properties[key]).join("|"), actualType: kind((value as Record<string, unknown>)[key])
    })).filter(field => field.path.length <= 128) : [];
  const limit = INSPECTION_SHAPE_LIST_LIMIT;
  const diagnostic: InspectionShapeDiagnostic = {
    expectedType: types(current).join("|"), actualType: kind(value),
    expectedKeys: expectedKeys.slice(0, limit), actualKeys: actualKeys.slice(0, limit).map(key => Object.prototype.hasOwnProperty.call(properties, key) ? key : unknownKey(key)),
    missingKeys: missingKeys.slice(0, limit), unexpectedKeys: unexpectedKeys.slice(0, limit).map(unknownKey),
    wrongTypeFields: wrongTypeFields.slice(0, limit),
    truncated: [expectedKeys, actualKeys, missingKeys, unexpectedKeys, wrongTypeFields].some(list => list.length > limit)
  };
  for (const field of diagnostic.wrongTypeFields) Object.freeze(field);
  for (const key of ["expectedKeys", "actualKeys", "missingKeys", "unexpectedKeys", "wrongTypeFields"] as const) Object.freeze(diagnostic[key]);
  Object.freeze(diagnostic); generated.add(diagnostic);
  return diagnostic;
}
/** Only immutable server-generated structure may leave the exception boundary. */
export function admittedShapeDiagnostic(value: unknown): InspectionShapeDiagnostic | undefined {
  return value !== null && typeof value === "object" && generated.has(value) ? value as InspectionShapeDiagnostic : undefined;
}
