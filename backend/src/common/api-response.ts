import { NotFoundException } from "@nestjs/common";
import type { ApiMetaDto, ApiResponseDto } from "../dto";

export function response<T>(data: T, meta: Partial<ApiMetaDto> = {}): ApiResponseDto<T> {
  return {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    },
    errors: []
  };
}

export function requireEntity<T>(entity: T | undefined, label: string): T {
  if (!entity) {
    throw new NotFoundException(`${label} not found`);
  }

  return entity;
}
