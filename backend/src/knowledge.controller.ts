import { Controller, Get, Inject, Param } from "@nestjs/common";
import { response } from "./common/api-response";
import type { ApiResponseDto } from "./dto";
import type { KnowledgeItemDto } from "./knowledge.dto";
import { KnowledgeService } from "./knowledge.service";

@Controller("knowledge")
export class KnowledgeController {
  constructor(@Inject(KnowledgeService) private readonly knowledgeService: KnowledgeService) {}

  @Get("items")
  listItems(): ApiResponseDto<KnowledgeItemDto[]> {
    const data = this.knowledgeService.listItems();
    return response(data, { total: data.length });
  }

  @Get("items/:knowledgeItemId")
  getItem(@Param("knowledgeItemId") knowledgeItemId: string): ApiResponseDto<KnowledgeItemDto> {
    return response(this.knowledgeService.getItem(knowledgeItemId));
  }
}
