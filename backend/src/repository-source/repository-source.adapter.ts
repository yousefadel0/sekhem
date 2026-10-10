import type { RepositorySourceStatusDto } from "./repository-source.dto";

export const REPOSITORY_SOURCE_ADAPTER = Symbol("REPOSITORY_SOURCE_ADAPTER");

export interface RepositorySourceAdapter {
  readStatus(): Promise<RepositorySourceStatusDto>;
}
