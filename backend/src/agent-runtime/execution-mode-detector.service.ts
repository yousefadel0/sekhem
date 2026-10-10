import { Injectable } from "@nestjs/common";
import { requestsWorkspace } from "./workspace-intent";

/** Automatic analysis routing only; execution permission is a separate boundary. */
@Injectable()
export class ExecutionModeDetectorService {
  async isExecutionIntent(content: string): Promise<boolean> {
    return requestsWorkspace(content);
  }
}
