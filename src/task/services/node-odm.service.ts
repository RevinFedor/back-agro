import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

import * as FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { createReadStream, createWriteStream } from 'fs';

import { mkdirp } from 'mkdirp'
import * as unzipper from 'unzipper';
import * as path from 'path';
import { unlink } from 'fs/promises'; 


// NodeOdmService — сервис для взаимодействия с NodeODM: инициализация задач, загрузка изображений, обработка задач и получение информации.
@Injectable()
export class NodeOdmService {
  private readonly odmUrl: string;

  constructor(
    private httpService: HttpService, // HTTP клиент для запросов к NodeODM.
    private configService: ConfigService, // Сервис для доступа к конфигурационным переменным.
  ) {
    this.odmUrl =
      this.configService.get<string>('ODM_URL') || 'http://localhost:3000';
  }

  // Инициализация новой задачи в NodeODM.
  async initTask() {
    const { data } = await firstValueFrom(
      this.httpService.post(`${this.odmUrl}/task/new/init`),
    );
    return data;
  }

  // Загрузка изображений для задачи в NodeODM.
  async uploadImages(taskId: string, images: Express.Multer.File[]) {
    if (!images || !Array.isArray(images)) {
      throw new BadRequestException('No images provided or invalid format');
    }

    const formData = new FormData();

    images.forEach((image) => {
      if (!image.path || !image.originalname) {
        throw new BadRequestException('Invalid image format');
      }
      // Создаем ReadStream из сохраненного файла
      const fileStream = createReadStream(image.path);
      formData.append('images', fileStream, image.originalname);
    });

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.odmUrl}/task/new/upload/${taskId}`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
              'Content-Type': 'multipart/form-data',
            },
            // Добавляем maxContentLength для больших файлов
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          },
        ),
      );
    } catch (error) {
      console.error('Upload error:', error);
      throw new BadRequestException('Error uploading images: ' + error.message);
    }
  }

  // Запуск обработки задачи в NodeODM.
  async processTask(taskId: string) {
    await firstValueFrom(
      this.httpService.post(`${this.odmUrl}/task/new/commit/${taskId}`),
    );
  }

  // Получение информации о задаче из NodeODM.
  async getTaskInfo(taskId: string) {
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.odmUrl}/task/${taskId}/info`),
    );
    return data;
  }

  // Скачивание и сохранение TIFF файла результата обработки задачи.
  async downloadAndSaveTiff(odmTaskId: string, taskId: string): Promise<string> {
    // Создаем директорию для файлов задачи
    const taskDir = path.join('uploads', 'tasks', taskId);
    await mkdirp(taskDir);

    // Временный файл для архива
    const zipPath = path.join(taskDir, 'temp.zip');
    const tiffDestPath = path.join(taskDir, 'odm_orthophoto.tif');

    try {
      // Скачиваем архив
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.odmUrl}/task/${odmTaskId}/download/all.zip`,
          { responseType: 'stream' },
        ),
      );

      // Сохраняем архив
      await new Promise((resolve, reject) => {
        const writer = createWriteStream(zipPath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Извлекаем TIFF файл
      await new Promise((resolve, reject) => {
        createReadStream(zipPath)
          .pipe(unzipper.Parse())
          .on('entry', async (entry) => {
            if (entry.path === 'odm_orthophoto/odm_orthophoto.tif') {
              entry.pipe(createWriteStream(tiffDestPath));
            } else {
              entry.autodrain();
            }
          })
          .on('finish', () => resolve(tiffDestPath))
          .on('error', reject);
      });

      // Удаляем временный архив
      await unlink(zipPath);

      return tiffDestPath;
    } catch (error) {
      throw error;
    }
  }
}
