import { ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { AiGatewayService } from "../../ai-gateway/ai-gateway.service";
import { RuntimeConfigurationService } from "../../ai-gateway/runtime-configuration.service";
import { RepositoryContentService } from "../../repository-source/repository-content.service";
import type { AuthRoleDto } from "../../auth/auth.dto";
import { roleCanUse } from "../../auth/role-policy";
import { WorkspaceCapabilityService } from "../capabilities/workspace-capability.service";
import {
  BlockerInvestigatorSkill,
  MemoGeneratorSkill,
  RepoSnapshotReaderSkill,
  SecurityFindingAnalyzerSkill
} from "./built-in-skills";
import { WorkspaceReaderSkill } from "./workspace-reader.skill";
import { AttachmentReaderSkill } from "./attachment-reader.skill";
import { AttachmentCapabilityService } from "../capabilities/attachment-capability.service";
import type { SkillDefinition } from "./skill.interface";

/**
 * SkillRegistryService
 *
 * Maintains the catalog of all available skills and enforces policy:
 *  1. Skills with isReadOnly = false are REJECTED — no git writes or deployments.
 *  2. Skills with requiresApproval = true must NOT be executed until an AgentApproval
 *     with status APPROVED exists (enforced by AgentRuntimeService).
 *  3. getAvailableSkills() filters by user role and project context.
 */
@Injectable()
export class SkillRegistryService {
  private readonly registry: Map<string, SkillDefinition> = new Map();

  constructor(
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(RuntimeConfigurationService) private readonly runtimeConfig: RuntimeConfigurationService,
    @Inject(RepositoryContentService) private readonly repoContent: RepositoryContentService,
    @Optional() @Inject(WorkspaceCapabilityService) private readonly workspaceCapabilities?: WorkspaceCapabilityService,
    @Optional() @Inject(AttachmentCapabilityService) private readonly attachmentCapabilities?: AttachmentCapabilityService
  ) {
    this.registerBuiltIns();
  }

  getAiGateway(): AiGatewayService {
    return this.aiGateway;
  }

  /**
   * Get all skills available to the given user role.
   * Never returns write-capable or deployment-capable skills — all are isReadOnly=true.
   */
  getAvailableSkills(userRole: AuthRoleDto): SkillDefinition[] {
    return Array.from(this.registry.values()).filter((skill) => {
      // Enforce: only isReadOnly skills are surfaced
      if (!skill.isReadOnly) return false;
      // Enforce: user must have one of the required roles
      return roleCanUse(userRole, skill.requiredRoles);
    });
  }

  /**
   * Retrieve a skill by ID, validating user access.
   * Throws if skill not found, not accessible for the role, or violates write policy.
   */
  getSkill(id: string, userRole: AuthRoleDto): SkillDefinition {
    const skill = this.registry.get(id);
    if (!skill) {
      throw new NotFoundException(`Skill '${id}' is not registered`);
    }

    // Non-negotiable: REFUSE any skill that is not read-only
    if (!skill.isReadOnly) {
      throw new ForbiddenException(`Skill '${id}' is not permitted: write-capable skills are forbidden by policy`);
    }

    if (!roleCanUse(userRole, skill.requiredRoles)) {
      throw new ForbiddenException(`Skill '${id}' requires one of: ${skill.requiredRoles.join(", ")}`);
    }

    return skill;
  }

  /**
   * Validate that a skill is approved for execution in the current step context.
   * - If skill.requiresApproval = true AND no approval decision exists, returns { approved: false }.
   * - If skill.requiresApproval = false, returns { approved: true }.
   * The AgentRuntimeService uses this to decide whether to create an AgentApproval and pause.
   */
  checkApprovalRequired(skillId: string, approvalDecisions: Map<string, string>): { requiresApproval: boolean; approved: boolean } {
    const skill = this.registry.get(skillId);
    if (!skill) return { requiresApproval: false, approved: true };

    if (!skill.requiresApproval) return { requiresApproval: false, approved: true };

    const decision = approvalDecisions.get(skillId);
    const approved = decision === "APPROVED" || decision === "approved";
    return { requiresApproval: true, approved };
  }

  // ---------------------------------------------------------------------------
  // Private: register all built-in skills
  // ---------------------------------------------------------------------------

  private registerBuiltIns(): void {
    const builtIns: SkillDefinition[] = [
      new RepoSnapshotReaderSkill(this.runtimeConfig, this.repoContent),
      new MemoGeneratorSkill(this.aiGateway),
      new SecurityFindingAnalyzerSkill(),
      new BlockerInvestigatorSkill()
    ];
    if (this.workspaceCapabilities) {
      builtIns.push(new WorkspaceReaderSkill(this.workspaceCapabilities));
    }
    if (this.attachmentCapabilities) {
      builtIns.push(new AttachmentReaderSkill(this.attachmentCapabilities));
    }

    for (const skill of builtIns) {
      // Enforce the write policy at registration time
      if (!skill.isReadOnly) {
        // This should never happen for built-ins, but guard defensively
        console.error(`[SkillRegistry] REJECTED skill '${skill.id}': isReadOnly=false violates policy`);
        continue;
      }
      this.registry.set(skill.id, skill);
    }
  }
}
