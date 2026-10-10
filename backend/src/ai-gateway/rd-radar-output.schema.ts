import { BadGatewayException } from "@nestjs/common";

export type StructuredOutputDialect =
  | "LLAMACPP_JSON_SCHEMA"
  | "OPENAI_JSON_SCHEMA"
  | "VLLM_STRUCTURED_OUTPUTS"
  | "JSON_OBJECT_ONLY";

export interface SafeSchemaValidationIssue {
  path: string;
  code: "REQUIRED" | "TYPE" | "ENUM" | "ADDITIONAL_PROPERTY" | "NON_EMPTY" | "MAX_LENGTH" | "MIN_ITEMS" | "MAX_ITEMS" | "RANGE";
  expectedType: string;
}

type ContractType = "object" | "array" | "string" | "number";
interface ContractNode {
  type: ContractType;
  enum?: readonly string[];
  properties?: Record<string, ContractNode>;
  required?: readonly string[];
  additionalProperties?: false;
  items?: ContractNode;
  nonEmpty?: boolean;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
}

const nonEmptyString = (maxLength: number): ContractNode => ({ type: "string", nonEmpty: true, maxLength });
const stringArray = (maxItems: number, itemMaxLength: number, minItems = 0): ContractNode => ({
  type: "array", minItems, maxItems, items: nonEmptyString(itemMaxLength)
});

const findingContract: ContractNode = {
  type: "object",
  properties: {
    title: nonEmptyString(300),
    category: nonEmptyString(100),
    severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"], nonEmpty: true, maxLength: 20 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    citations: stringArray(20, 500, 1),
    businessImpact: nonEmptyString(4_000),
    technicalRisk: nonEmptyString(4_000),
    recommendation: nonEmptyString(4_000),
    uncertainty: nonEmptyString(4_000),
    requiredAdditionalEvidence: stringArray(25, 1_000),
    candidateDraftRecommendation: nonEmptyString(4_000)
  },
  required: ["title", "category", "severity", "confidence", "citations", "businessImpact", "technicalRisk", "recommendation", "uncertainty", "requiredAdditionalEvidence", "candidateDraftRecommendation"],
  additionalProperties: false
};

export const RD_RADAR_OUTPUT_CONTRACT: ContractNode = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["rd-radar-analysis.v1"] },
    summary: nonEmptyString(8_000),
    findings: { type: "array", minItems: 1, maxItems: 5, items: findingContract }
  },
  required: ["schemaVersion", "summary", "findings"],
  additionalProperties: false
};

export const RD_RADAR_OUTPUT_SCHEMA = providerSchema(RD_RADAR_OUTPUT_CONTRACT);
export const RD_RADAR_OUTPUT_GENERATION_REQUIREMENTS = generationRequirements(RD_RADAR_OUTPUT_CONTRACT);

export class RDRadarOutputSchemaError extends BadGatewayException {
  readonly code = "LLM_JSON_SCHEMA_INVALID";
  constructor(readonly issues: SafeSchemaValidationIssue[]) {
    super("Provider returned structured output that failed validation");
  }
}

export function validateRdRadarOutputSchema(value: unknown): SafeSchemaValidationIssue[] {
  const issues: SafeSchemaValidationIssue[] = [];
  validateNode(value, RD_RADAR_OUTPUT_CONTRACT, "$", issues);
  return issues.slice(0, 50);
}

function providerSchema(node: ContractNode): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: node.type };
  if (node.enum) schema.enum = [...node.enum];
  if (node.properties) schema.properties = Object.fromEntries(Object.entries(node.properties).map(([key, child]) => [key, providerSchema(child)]));
  if (node.required) schema.required = [...node.required];
  if (node.additionalProperties === false) schema.additionalProperties = false;
  if (node.items) schema.items = providerSchema(node.items);
  if (node.minItems !== undefined) schema.minItems = node.minItems;
  if (node.maxItems !== undefined) schema.maxItems = node.maxItems;
  if (node.nonEmpty) schema.minLength = 1;
  return schema;
}

function generationRequirements(contract: ContractNode): string {
  const findings = contract.properties!.findings!;
  const finding = findings.items!;
  const severity = finding.properties!.severity!;
  const confidence = finding.properties!.confidence!;
  const citations = finding.properties!.citations!;
  const additionalEvidence = finding.properties!.requiredAdditionalEvidence!;
  return `Produce ${findings.minItems}-${findings.maxItems} findings. Use non-empty text fields. Severity must be exactly one lowercase value: ${severity.enum!.join(", ")}. Confidence must be ${confidence.minimum}-${confidence.maximum}. Each finding must contain ${citations.minItems}-${citations.maxItems} allowed citation IDs. requiredAdditionalEvidence may be empty and must contain at most ${additionalEvidence.maxItems} items.`;
}

function validateNode(value: unknown, node: ContractNode, path: string, issues: SafeSchemaValidationIssue[]): void {
  if (!matchesType(value, node.type)) {
    issues.push({ path, code: "TYPE", expectedType: node.type });
    return;
  }
  if (node.enum && !node.enum.includes(value as string)) {
    issues.push({ path, code: "ENUM", expectedType: "canonical enum value" });
  }
  if (node.type === "string") validateString(value as string, node, path, issues);
  if (node.type === "number") validateNumber(value as number, node, path, issues);
  if (node.type === "array") validateArray(value as unknown[], node, path, issues);
  if (node.type === "object") validateObject(value as Record<string, unknown>, node, path, issues);
}

function validateObject(value: Record<string, unknown>, node: ContractNode, path: string, issues: SafeSchemaValidationIssue[]): void {
  const properties = node.properties ?? {};
  for (const key of node.required ?? []) {
    if (!(key in value)) issues.push({ path: `${path}.${key}`, code: "REQUIRED", expectedType: properties[key]?.type ?? "required value" });
  }
  if (node.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) issues.push({ path: `${path}.${key}`, code: "ADDITIONAL_PROPERTY", expectedType: "no additional property" });
    }
  }
  for (const [key, child] of Object.entries(properties)) {
    if (key in value) validateNode(value[key], child, `${path}.${key}`, issues);
  }
}

function validateString(value: string, node: ContractNode, path: string, issues: SafeSchemaValidationIssue[]): void {
  if (node.nonEmpty && !value.trim()) issues.push({ path, code: "NON_EMPTY", expectedType: "non-empty string" });
  if (node.maxLength !== undefined && value.length > node.maxLength) {
    issues.push({ path, code: "MAX_LENGTH", expectedType: `string up to ${node.maxLength} characters` });
  }
}

function validateNumber(value: number, node: ContractNode, path: string, issues: SafeSchemaValidationIssue[]): void {
  if (!Number.isFinite(value)) {
    issues.push({ path, code: "TYPE", expectedType: "finite number" });
    return;
  }
  if ((node.minimum !== undefined && value < node.minimum) || (node.maximum !== undefined && value > node.maximum)) {
    issues.push({ path, code: "RANGE", expectedType: `number from ${node.minimum} to ${node.maximum}` });
  }
}

function validateArray(value: unknown[], node: ContractNode, path: string, issues: SafeSchemaValidationIssue[]): void {
  if (node.minItems !== undefined && value.length < node.minItems) {
    issues.push({ path, code: "MIN_ITEMS", expectedType: `array with at least ${node.minItems} item(s)` });
  }
  if (node.maxItems !== undefined && value.length > node.maxItems) {
    issues.push({ path, code: "MAX_ITEMS", expectedType: `array with at most ${node.maxItems} item(s)` });
  }
  if (node.items) value.forEach((item, index) => validateNode(item, node.items!, `${path}[${index}]`, issues));
}

function matchesType(value: unknown, type: ContractType): boolean {
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  return typeof value === type;
}
