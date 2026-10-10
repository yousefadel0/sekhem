import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import type { ApiErrorDto, ApiResponseDto } from "../dto";
import { AssistantContextBudgetError } from "../ai-gateway/assistant-context-budget";
import { RECOVERY_ERRORS } from "./recovery-errors";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      this.logger.error("Unhandled internal exception:", exception instanceof Error ? exception.stack : exception);
    }

    response.status(status).json(this.errorResponse(status, exception));
  }

  private errorResponse(status: number, exception: unknown): ApiResponseDto<null> {
    return {
      data: null,
      meta: {
        timestamp: new Date().toISOString()
      },
      errors: [this.error(status, exception)]
    };
  }

  private error(status: number, exception: unknown): ApiErrorDto {
    // Only this typed, content-free budget diagnostic is exposed; other exception payloads remain private.
    if (exception instanceof AssistantContextBudgetError) {
      return { code: exception.code, message: this.message(exception),
        ...(exception.contextBudget ? { details: { contextBudget: exception.contextBudget } } : {}) };
    }
    if (exception instanceof HttpException) {
      const recoveryCode = this.message(exception);
      if (Object.prototype.hasOwnProperty.call(RECOVERY_ERRORS, recoveryCode)) return { code: recoveryCode, message: RECOVERY_ERRORS[recoveryCode] };
      // Preserve this content-free recovery signal without exposing arbitrary exception payloads.
      if (status === HttpStatus.CONFLICT && this.message(exception) === "CONVERSATION_WORKSPACE_CHANGED") {
        return { code: "CONVERSATION_WORKSPACE_CHANGED", message: "This conversation belongs to a previous workspace binding. Start a new Chat in the current workspace; the saved conversation and evidence remain unchanged." };
      }
      return {
        code: this.code(status),
        message: this.message(exception)
      };
    }

    return {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error"
    };
  }

  private message(exception: HttpException): string {
    const payload = exception.getResponse();

    if (typeof payload === "string") {
      return payload;
    }

    if (this.isRecord(payload) && typeof payload.message === "string") {
      return payload.message;
    }

    return exception.message;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private code(status: number): string {
    switch (status) {
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      default:
        return status >= 500 ? "INTERNAL_SERVER_ERROR" : "HTTP_ERROR";
    }
  }
}
