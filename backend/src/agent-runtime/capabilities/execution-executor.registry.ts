import { Injectable } from "@nestjs/common";
import type { ExecutionCapability, ExecutionExecutor } from "./execution-plane.types";

/** Registry boundary for future approved executors; registration never enables policy. */
@Injectable()
export class ExecutionExecutorRegistry {
  private readonly executors = new Map<ExecutionCapability, ExecutionExecutor>();

  register(executor: ExecutionExecutor): void {
    this.executors.set(executor.capability, executor);
  }

  resolve(capability: string): ExecutionExecutor | undefined {
    return this.executors.get(capability as ExecutionCapability);
  }

  registeredCapabilities(): ExecutionCapability[] {
    return [...this.executors.keys()];
  }
}
