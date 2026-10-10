import type { CitationSource } from "./inspection-grounding";
import { citationCatalog } from "./inspection-grounding";
import { INSPECTION_RESOURCE_LIMITS } from "../understanding/agent-understanding.types";
import { BadRequestException } from "@nestjs/common";

/** A single exact contiguous visible excerpt per admitted source. Navigation is ranges, not another copy. */
export function canonicalInspectionSources(sources: CitationSource[]) {
  if (sources.length > INSPECTION_RESOURCE_LIMITS.MAX_CONTEXT_SOURCES ||
    sources.reduce((size, source) => size + source.body.length, 0) > INSPECTION_RESOURCE_LIMITS.MAX_CONTEXT_CHARS)
    throw new BadRequestException("INSPECTION_EVIDENCE_BOUND");
  return citationCatalog(sources).map((catalog, index) => {
    const source = sources[index], lines = source.body.split("\n");
    const lineOffset = (line: number) => lines.slice(0, line - 1).reduce((n, text) => n + text.length + 1, 0);
    const anchors = catalog.anchors?.map(({ citation, excerpt }) => {
      const range = /:L(\d+)-L(\d+)/.exec(citation)!;
      const start = lineOffset(Number(range[1])), end = start + excerpt.length;
      return { citation, start, end, byteStart: Buffer.byteLength(source.body.slice(0, start)),
        byteEnd: Buffer.byteLength(source.body.slice(0, end)) };
    });
    return { path: source.path, operation: source.operation, lines: catalog.lines, citation: catalog.citation,
      evidenceRef: source.evidenceRef, sourceId: source.reference.operationId,
      receipt: { id: source.reference.receiptId, observedAt: source.reference.observationTime,
        encoding: source.reference.encoding, verification: source.reference.verificationState,
        truncated: source.reference.truncated, contentIdentity: source.reference.contentIdentity }, excerpt: source.body,
      range: { start: 0, end: source.body.length, byteStart: 0, byteEnd: Buffer.byteLength(source.body) }, anchors };
  });
}
