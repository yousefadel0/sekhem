import { Module } from "@nestjs/common";
import { AttachmentModule } from "../attachment/attachment.module";
import { CsvExtractor } from "./extractors/csv.extractor";
import { HtmlExtractor } from "./extractors/html.extractor";
import { FileExtractorRegistry } from "./extractors/file-extractor.registry";
import { JsonExtractor } from "./extractors/json.extractor";
import { MarkdownExtractor } from "./extractors/markdown.extractor";
import { PdfExtractor } from "./extractors/pdf.extractor";
import { TextExtractor } from "./extractors/text.extractor";
import { FileDetectorService } from "./file-detector.service";
import { FileIntelligenceService } from "./file-intelligence.service";
import { FileIntelligenceSecurityService } from "./security/file-intelligence-security.service";

@Module({
  imports: [AttachmentModule],
  providers: [
    FileIntelligenceSecurityService,
    FileDetectorService,
    TextExtractor,
    JsonExtractor,
    CsvExtractor,
    HtmlExtractor,
    MarkdownExtractor,
    PdfExtractor,
    {
      provide: FileExtractorRegistry,
      useFactory: (
        pdf: PdfExtractor,
        json: JsonExtractor,
        csv: CsvExtractor,
        html: HtmlExtractor,
        markdown: MarkdownExtractor,
        text: TextExtractor
      ) => new FileExtractorRegistry([pdf, json, csv, html, markdown, text]),
      inject: [PdfExtractor, JsonExtractor, CsvExtractor, HtmlExtractor, MarkdownExtractor, TextExtractor]
    },
    FileIntelligenceService
  ],
  exports: [FileIntelligenceService, FileDetectorService]
})
export class FileIntelligenceModule {}
