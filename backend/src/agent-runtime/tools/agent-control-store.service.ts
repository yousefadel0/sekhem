import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { SessionClaims } from "../../auth/auth.dto";
import { CONTROL_ARTIFACT, controlRecordId, controlSnapshot, type ControlSnapshot, type ControlState } from "./agent-control.contract";

/** One internal record per run. All writes require the existing AgentRun row lock. */
@Injectable()
export class AgentControlStoreService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}
  async lock(tx: any, run: any) {
    const result = await tx.agentRun.updateMany({ where: { id: run.id, status: run.status, planVersion: run.planVersion, updatedAt: run.updatedAt }, data: { updatedAt: new Date() } });
    if (result.count !== 1) throw new BadRequestException("RUN_STATE_CHANGED");
  }
  async read(tx: any, runId: string) {
    return controlSnapshot(await tx.agentArtifact.findUnique({ where: { id: controlRecordId(runId) } }));
  }
  async save(tx: any, run: any, snapshot: ControlSnapshot, state: ControlState, code: string, eventType: string, claims?: SessionClaims) {
    snapshot.state = state; snapshot.code = code; snapshot.revision++;
    await tx.agentArtifact.upsert({ where: { id: controlRecordId(run.id) }, create: {
      id: controlRecordId(run.id), agentRunId: run.id, projectId: run.projectId, title: "Agent control state", artifactType: CONTROL_ARTIFACT,
      content: "", isCustomerSafe: false, version: 1, metadata: snapshot
    }, update: { metadata: snapshot } });
    const payload = { phase: "0A", state, code, revision: snapshot.revision, executionPerformed: false,
      ...(snapshot.proposal ? { proposalId: snapshot.proposal.proposalId, proposalDigest: snapshot.proposal.proposalDigest, planId: snapshot.proposal.planId, planVersion: snapshot.proposal.planVersion, planStepId: snapshot.proposal.planStepId } : {}),
      ...(snapshot.intent ? { intentId: snapshot.intent.intentId, intentStatus: snapshot.intent.status } : {}) };
    await tx.agentRunEvent.create({ data: { agentRunId: run.id, eventType, actor: claims?.sub ?? "agent", payload } });
    if (claims) await this.audit.recordWithClaimsTx(tx, claims, { action: eventType, resourceType: "AgentRun", resourceId: run.id, details: payload });
  }
  async invalidate(tx: any, run: any, reason: string, claims?: SessionClaims) {
    const state = await this.read(tx, run.id);
    if (!state) return false;
    if (state.intent?.status === "BOUNDARY_BLOCKED") state.intent.status = reason === "RUN_CANCELLED" ? "CANCELLED" : "INVALIDATED";
    await this.save(tx, run, state, "EXECUTION_BLOCKED", reason, "EXECUTION_BLOCKED", claims);
    return true;
  }
}
