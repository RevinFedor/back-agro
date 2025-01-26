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
        status: TaskStatus.PROCESSING,
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
      const odmTask = await this.nodeOdmService.initTask();
      await this.nodeOdmService.uploadImages(odmTask.uuid, images);
      await this.nodeOdmService.processTask(odmTask.uuid);

      await this.prisma.task.update({
        where: { id: taskId },
        data: { odmTaskId: odmTask.uuid },
      });

      // Запускаем отслеживание прогресса
      this.pollTaskProgress(taskId, odmTask.uuid);

      return {
        success: true,
        message: 'Task started',
        odmTaskId: odmTask.uuid,
      };
    } catch (error) {
      throw error;
    }
  }

  // Завершение обработки задачи и обновление статуса.
  async handleTaskCompletion(taskId: string, odmTaskId: string) {
    try {
      const tiffPath = await this.nodeOdmService.downloadAndSaveTiff(
        odmTaskId,
        taskId,
      );

      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.COMPLETED,
          tiffPath: tiffPath,
        },
      });
    } catch (error) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.FAILED,
        },
      });
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

    await this.prisma.$transaction([
      this.prisma.taskMember.deleteMany({ where: { taskId } }),
      this.prisma.task.delete({ where: { id: taskId } }),
    ]);

    return { message: 'Task deleted successfully' };
  }
}
