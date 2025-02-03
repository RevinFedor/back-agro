import { TaskGateway } from './task.gateway';
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { Role, Task, TaskMember, TaskStatus } from '@prisma/client';
import { NodeOdmService } from './services/node-odm.service';
import { UpdateTaskDto } from './dto/update-task.dto';

import * as path from 'path';
import { rm, unlink } from 'fs/promises';

import { SpectralService } from './services/spectral.service';
import { mkdirp } from 'mkdirp';
import * as GeoTIFF from 'geotiff';
import * as proj4 from 'proj4';
import { writeFile } from 'fs/promises';

type TaskWithMembers = Task & {
  members: TaskMember[];
};

/**
 * TaskService — основной сервис для управления задачами: создание, обновление, удаление, синхронизация статусов.
 */
@Injectable()
export class TaskService {
  constructor(
    private prisma: PrismaService, // Работа с базой данных.
    private nodeOdmService: NodeOdmService, // Взаимодействие с NodeODM.
    private taskGateway: TaskGateway, // WebSocket уведомления.
  ) {}
  private readonly logger = new Logger(TaskService.name);

  // Обновление статуса задачи на основе данных из NodeODM.
  private async updateTaskStatus(
    task: TaskWithMembers,
  ): Promise<TaskWithMembers> {
    try {
      // Проверяем только задачи в процессе обработки
      if (task.status !== TaskStatus.PROCESSING || !task.odmTaskId) {
        return task;
      }

      // Получаем информацию от NodeODM
      const odmTaskInfo = await this.nodeOdmService.getTaskInfo(task.odmTaskId);

      let newStatus: TaskStatus = task.status;
      let tiffPath = task.tiffPath;

      // Маппинг статусов
      switch (odmTaskInfo.status.code) {
        case 40: // COMPLETED
          newStatus = TaskStatus.COMPLETED;
          tiffPath = `/tasks/${task.odmTaskId}/downloads/odm_orthophoto/odm_orthophoto.tif`;
          break;
        case 30: // FAILED
        case 50: // CANCELED
          newStatus = TaskStatus.FAILED;
          break;
      }

      // Обновляем только если статус изменился
      if (newStatus !== task.status || tiffPath !== task.tiffPath) {
        return await this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: newStatus,
            tiffPath,
            updatedAt: new Date(),
          },
          include: {
            members: true,
          },
        });
      }

      return task;
    } catch (error) {
      console.error(`Error updating task ${task.id} status:`, error);
      return task;
    }
  }

  // Запуск процесса отслеживания прогресса задачи.
  private async pollTaskProgress(taskId: string, odmTaskId: string) {
    const interval = setInterval(async () => {
      try {
        const odmTaskInfo = await this.nodeOdmService.getTaskInfo(odmTaskId);

        // Отправляем прогресс через WebSocket
        this.taskGateway.sendTaskProgress(taskId, odmTaskInfo.progress);

        // Проверяем завершение задачи
        if (odmTaskInfo.status.code === 40) {
          // COMPLETED
          clearInterval(interval);
          await this.handleTaskCompletion(taskId, odmTaskId);
          this.taskGateway.sendTaskComplete(taskId, { status: 'COMPLETED' });
        } else if (
          odmTaskInfo.status.code === 30 ||
          odmTaskInfo.status.code === 50
        ) {
          // FAILED or CANCELED
          clearInterval(interval);
          this.taskGateway.sendTaskStatus(taskId, TaskStatus.FAILED);
        }
      } catch (error) {
        clearInterval(interval);
        this.taskGateway.sendTaskStatus(taskId, TaskStatus.FAILED);
      }
    }, 2000); // Опрос каждые 2 секунды
  }

  // Создание новой задачи в проекте.
  async create(
    createTaskDto: CreateTaskDto,
    projectId: string,
    userId: string,
  ) {
    const member = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
    });

    if (!member || member.role !== Role.EDITOR) {
      throw new ForbiddenException(
        `No access to create tasks in this project ${member}`,
      );
    }

    const task = await this.prisma.task.create({
      data: {
        ...createTaskDto,
        status: TaskStatus.PENDING,
        projectId,
        members: {
          create: {
            userId,
            role: Role.EDITOR,
          },
        },
      },
    });

    return task;
  }
  // Получение всех задач проекта с учетом доступа пользователя.
  async findAll(projectId: string, userId: string) {
    // Проверяем доступ к проекту
    const member = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('No access to this project');
    }

    return this.prisma.task.findMany({
      where: {
        projectId,
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: true,
      },
    });
  }

  // Получение одной задачи с проверкой доступа пользователя.
  async findOne(taskId: string, userId: string): Promise<TaskWithMembers> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        members: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const member = task.members.find((m) => m.userId === userId);
    if (!member) {
      throw new ForbiddenException('No access to this task');
    }

    // Проверяем и обновляем статус при каждом запросе
    return this.updateTaskStatus(task);
  }

  // Обработка изображений для задачи через NodeODM.
  async processImages(
    taskId: string,
    images: Express.Multer.File[],
    userId: string,
  ) {
    const task = await this.findOne(taskId, userId);

    try {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.PROCESSING },
      });

      const odmTask = await this.nodeOdmService.initTask();
      await this.nodeOdmService.uploadImages(odmTask.uuid, images);
      await this.nodeOdmService.processTask(odmTask.uuid);

      await this.prisma.task.update({
        where: { id: taskId },
        data: { odmTaskId: odmTask.uuid },
      });

      this.pollTaskProgress(taskId, odmTask.uuid);

      return {
        success: true,
        message: 'Task started',
        odmTaskId: odmTask.uuid,
      };
    } catch (error) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.FAILED },
      });
      throw error;
    }
  }

  // логика обработки tiff
  private async processSpectralAndBoundingBox(taskId: string, tiffPath: string) {
  this.logger.debug('Starting spectral and bounding box processing');
  
  try {
    // Генерируем спектральные изображения
    const spectralDir = path.join('uploads', 'tasks', taskId, 'spectral');
    await mkdirp(spectralDir);
    
    const spectralService = new SpectralService();
    const spectralResults = await spectralService.generateSpectralImages(
      tiffPath,
      spectralDir,
    );
    
    // Извлекаем и конвертируем bounding box
    const tiff = await GeoTIFF.fromFile(tiffPath);
    const image = await tiff.getImage();
    const [minX, minY, maxX, maxY] = image.getBoundingBox();

    const sourceProj = '+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs';
    const targetProj = '+proj=longlat +datum=WGS84 +no_defs';
    const [swLon, swLat] = proj4(sourceProj, targetProj, [minX, minY]);
    const [neLon, neLat] = proj4(sourceProj, targetProj, [maxX, maxY]);

    const boundingBox = [
      [swLat, swLon],
      [neLat, neLon],
    ];

    // Обновляем задачу с результатами
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.COMPLETED,
        spectralImages: spectralResults.map(r => r.imagePath),
        boundingBox: boundingBox,
      },
    });

    // Отправляем уведомление о завершении
    this.taskGateway.sendTaskComplete(taskId, {
      status: 'COMPLETED',
      boundingBox: boundingBox,
    });

  } catch (error) {
    this.logger.error(
      `Error in spectral processing for task ${taskId}: ${error.message}`,
      error.stack,
    );
    
    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.FAILED },
    });
    
    this.taskGateway.sendTaskStatus(taskId, TaskStatus.FAILED);
    throw error;
  }
}

 //  обработка уже готового tiff
 async processTiff(taskId: string, tiffFile: Express.Multer.File, userId: string) {
  const task = await this.findOne(taskId, userId);

  try {
    // Обновляем статус
    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.PROCESSING },
    });

    // Сохраняем загруженный TIFF
    const taskDir = path.join('uploads', 'tasks', taskId);
    await mkdirp(taskDir);
    const tiffPath = path.join(taskDir, 'odm_orthophoto.tif');
    await writeFile(tiffPath, tiffFile.buffer);

    // Обновляем путь к TIFF
    await this.prisma.task.update({
      where: { id: taskId },
      data: { tiffPath },
    });

    // Вызываем общую логику обработки
    await this.processSpectralAndBoundingBox(taskId, tiffPath);

    return {
      success: true,
      message: 'TIFF processing completed',
      taskId: taskId,
    };
  } catch (error) {
    this.logger.error(`Error in processTiff: ${error.message}`);
    throw error;
  }
}

  // Завершение обработки задачи и обновление БД.
  async handleTaskCompletion(taskId: string, odmTaskId: string) {
  this.logger.log(`Starting task completion for ODM task ${odmTaskId}`);
  
  try {
    // Скачиваем TIFF от ODM
    const tiffPath = await this.nodeOdmService.downloadAndSaveTiff(odmTaskId, taskId);
    
    // Обновляем путь к TIFF
    await this.prisma.task.update({
      where: { id: taskId },
      data: { tiffPath },
    });

    // Вызываем общую логику обработки
    await this.processSpectralAndBoundingBox(taskId, tiffPath);
  } catch (error) {
    this.logger.error(`Error in handleTaskCompletion: ${error.message}`);
    throw error;
  }
}

  // Обновление данных задачи с проверкой доступа.
  async update(taskId: string, updateTaskDto: UpdateTaskDto, userId: string) {
    const task = await this.findOne(taskId, userId);

    const member = task.members.find(
      (m) => m.userId === userId && m.role === Role.EDITOR,
    );
    if (!member) {
      throw new ForbiddenException('No permission to update this task');
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: updateTaskDto,
      include: { members: true },
    });
  }

  // Удаление задачи с проверкой роли пользователя.
  async remove(taskId: string, userId: string) {
    const task = await this.findOne(taskId, userId);

    // Check if user has editor role
    const member = task.members.find(
      (m) => m.userId === userId && m.role === Role.EDITOR,
    );
    if (!member) {
      throw new ForbiddenException('No permission to delete this task');
    }

    if (task.tiffPath) {
      const taskDir = path.join('uploads', 'tasks', taskId);
      try {
        // Удаляем TIFF файл
        await unlink(task.tiffPath);
        // Удаляем директорию задачи
        await rm(taskDir, { recursive: true, force: true });
      } catch (error) {
        Logger.error(`Не удалось удалить файлы задачи: ${error.message}`);
      }
    }

    // Удаление записей из базы данных
    await this.prisma.$transaction([
      this.prisma.taskMember.deleteMany({ where: { taskId } }),
      this.prisma.task.delete({ where: { id: taskId } }),
    ]);

    return { message: 'Task deleted successfully' };
  }
}
