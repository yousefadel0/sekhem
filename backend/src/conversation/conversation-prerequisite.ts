import { BadRequestException } from "@nestjs/common";
import { workspaceFileReferences } from "../agent-runtime/workspace-intent";

/** Routing context only. The inspection loop admits evidence and authorizes every read. */
export function planningInspectionInstruction(objective: string): string {
  if (!objective.trim() || objective.length > 4000) throw new BadRequestException("ENGINEERING_OBJECTIVE_REQUIRED");
  const files = [...new Set(workspaceFileReferences(objective))];
  if (files.length > 1) throw new BadRequestException("INSPECTION_TARGET_AMBIGUOUS");
  if (!files.length) return "Read and analyze the relevant source in the currently bound workspace using authorized discovery/search. Do not modify any file or execute any write.";
  const target = files[0];
  return `Read and analyze ${target}. Use the file itself as the only source. Do not modify anything. Do not create a proposal. Do not execute anything. Do not infer anything that is not present in the file.`;
}
