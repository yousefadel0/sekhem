import type { AiMemoPlaceholderDto, ContractActivityEventDto, SystemEventDto, WorkflowCallbackStoredDto, WorkflowRunDto } from "./automation-dto";

export const workflowRuns: WorkflowRunDto[] = [];
export const memoRequests: AiMemoPlaceholderDto[] = [];
export const recordedSystemEvents: SystemEventDto[] = [];
export const contractActivity: ContractActivityEventDto[] = [];
export const workflowCallbacks: WorkflowCallbackStoredDto[] = [];
export const workflowCallbackIdempotency = new Map<string, WorkflowCallbackStoredDto>();
