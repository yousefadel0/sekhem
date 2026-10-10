import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { response } from "../common/api-response";
import type { ApiResponseDto } from "../dto";
import type { RagAnswerPreviewResponseDto, RagIndexPreviewResponseDto } from "./rag.dto";
import { RagService } from "./rag.service";

@Controller("rag")
export class RagController {
  constructor(@Inject(RagService) private readonly ragService: RagService) {}

  @Get("index-preview")
  indexPreview(): ApiResponseDto<RagIndexPreviewResponseDto> {
    return response(this.ragService.indexPreview());
  }

  @Post("answer-preview")
  answerPreview(@Body() body: unknown): ApiResponseDto<RagAnswerPreviewResponseDto> {
    return response(this.ragService.answerPreview(body));
  }
}
