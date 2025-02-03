// src/debug/debug.controller.ts
import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SpectralService } from '../task/services/spectral.service';
import * as fs from 'fs';

@Controller('debug')
export class DebugController {
  constructor(private readonly spectralService: SpectralService) {}

  @Post('spectral')
  @UseInterceptors(FileInterceptor('file'))
  async debugProcessTiff(@UploadedFile() file: Express.Multer.File) {
    const tempTiffPath = 'temp/debug-upload.tif';
    const outputDir = 'temp/debug-output';

    await fs.promises.mkdir('temp/debug-output', { recursive: true });
    await fs.promises.writeFile(tempTiffPath, file.buffer);

    const results = await this.spectralService.generateSpectralImages(
      tempTiffPath,
      outputDir,
    );

    return { results };
  }
}