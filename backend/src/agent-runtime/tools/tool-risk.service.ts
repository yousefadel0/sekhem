import { Injectable } from "@nestjs/common";
import type { AgentTool, ToolRisk } from "./tool-contract";

@Injectable()
export class ToolRiskService {
  classify(tool: AgentTool): ToolRisk {
    // Only registry-resolved immutable definitions reach this service. Reserved
    // risk floors are enforced once, when the authoritative descriptor is registered.
    return tool.riskLevel;
  }
}
