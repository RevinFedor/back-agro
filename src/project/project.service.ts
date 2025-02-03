import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { Role } from '@prisma/client';
import { UpdateProjectDto } from './dto/update-project.dto';

import {
  AddProjectMemberDto,
  UpdateProjectMemberRoleDto,
} from './dto/project-member.dto';

import { rm } from 'fs/promises';
import * as path from 'path';

// ProjectService — сервис для управления проектами: создание, обновление, удаление проектов и управление участниками.
@Injectable()
export class ProjectService {
  constructor(private prisma: PrismaService) {}

  // Создание нового проекта и добавление создателя как участника с ролью EDITOR.
  async create(createProjectDto: CreateProjectDto, userId: string) {
    return await this.prisma.$transaction(async (prisma) => {
      // Создаем проект
      const project = await prisma.project.create({
        data: {
          ...createProjectDto,
          ownerId: userId,
        },
      });

      // Сразу добавляем владельца как участника с ролью EDITOR
      await prisma.projectMember.create({
        data: {
          projectId: project.id,
          userId: userId,
          role: Role.EDITOR,
        },
      });

      return project;
    });
  }

  // Получение всех проектов пользователя.
  async findAll(userId: string) {
    return this.prisma.project.findMany({
      where: {
        members: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
  }

  // Получение проекта по ID с проверкой доступа пользователя.
  async findById(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Проверяем, является ли пользователь участником проекта
    const member = project.members.find((m) => m.user.id === userId);
    if (!member) {
      throw new ForbiddenException('No access to this project');
    }

    return project;
  }

  // Обновление проекта с проверкой роли пользователя.
  async update(id: string, updateProjectDto: UpdateProjectDto, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const member = project.members.find(
      (m) => m.userId === userId && m.role === Role.EDITOR,
    );
    if (!member) {
      throw new ForbiddenException('No permission to update this project');
    }

    return this.prisma.project.update({
      where: { id },
      data: updateProjectDto,
    });
  }

  // Удаление проекта, его задач и taskMembers\projectMembers
  async remove(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        owner: true,
        tasks: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('Only project owner can delete the project');
    }

    // Удаляем файлы для каждой задачи проекта
    for (const task of project.tasks) {
      if (task.tiffPath) {
        const taskDir = path.join('uploads', 'tasks', task.id);
        try {
          await rm(taskDir, { recursive: true, force: true });
        } catch (error) {
          Logger.error(
            `Не удалось удалить файлы задачи ${task.id}: ${error.message}`,
          );
        }
      }
    }

    // Удаляем все записи из базы данных в правильном порядке
    await this.prisma.$transaction([
      // Сначала удаляем taskMembers для всех задач проекта
      this.prisma.taskMember.deleteMany({
        where: {
          task: {
            projectId: id,
          },
        },
      }),
      // Затем удаляем projectMembers
      this.prisma.projectMember.deleteMany({
        where: { projectId: id },
      }),
      // Потом удаляем задачи
      this.prisma.task.deleteMany({
        where: { projectId: id },
      }),
      // И наконец сам проект
      this.prisma.project.delete({
        where: { id },
      }),
    ]);

    return { message: 'Project deleted successfully' };
  }

  // Вспомогательный метод для проверки прав доступа к проекту.
  private async checkProjectAccess(
    userId: string,
    projectId: string,
    requiredRole: Role = Role.VIEWER,
  ) {
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

    // OWNER может всё
    if (member.role === Role.OWNER) return true;

    // EDITOR может редактировать, но не менять роли других
    if (member.role === Role.EDITOR && requiredRole === Role.VIEWER)
      return true;

    // Точное совпадение ролей
    if (member.role !== requiredRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  // Получение всех участников проекта с проверкой доступа пользователя.
  async getProjectMembers(projectId: string, userId: string) {
    // Проверяем доступ к проекту (достаточно быть viewer)
    await this.checkProjectAccess(userId, projectId, Role.VIEWER);

    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  // Добавление нового участника в проект только владельцем.
  async addProjectMember(
    projectId: string,
    addMemberDto: AddProjectMemberDto,
    userId: string,
  ) {
    // Только OWNER может добавлять участников
    await this.checkProjectAccess(userId, projectId, Role.OWNER);

    // Проверяем, не существует ли уже такой участник
    const existingMember = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: addMemberDto.userId,
          projectId,
        },
      },
    });

    if (existingMember) {
      throw new ForbiddenException('User is already a member of this project');
    }

    // Проверяем существование пользователя
    const user = await this.prisma.user.findUnique({
      where: { id: addMemberDto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.projectMember.create({
      data: {
        userId: addMemberDto.userId,
        projectId,
        role: addMemberDto.role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  // Обновление роли участника проекта только владельцем.
  async updateProjectMemberRole(
    projectId: string,
    memberUserId: string,
    updateRoleDto: UpdateProjectMemberRoleDto,
    userId: string,
  ) {
    // Только OWNER может менять роли
    await this.checkProjectAccess(userId, projectId, Role.OWNER);

    // Проверяем существование участника
    const member = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: memberUserId,
          projectId,
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Нельзя менять роль владельца проекта
    if (member.role === Role.OWNER) {
      throw new ForbiddenException("Cannot change owner's role");
    }

    return this.prisma.projectMember.update({
      where: {
        userId_projectId: {
          userId: memberUserId,
          projectId,
        },
      },
      data: {
        role: updateRoleDto.role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  // Удаление участника из проекта только владельцем.
  async removeProjectMember(
    projectId: string,
    memberUserId: string,
    userId: string,
  ) {
    // Только OWNER может удалять участников
    await this.checkProjectAccess(userId, projectId, Role.OWNER);

    // Проверяем существование участника
    const member = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: memberUserId,
          projectId,
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Нельзя удалить владельца проекта
    if (member.role === Role.OWNER) {
      throw new ForbiddenException('Cannot remove project owner');
    }

    // Удаляем участника из всех задач проекта
    await this.prisma.taskMember.deleteMany({
      where: {
        userId: memberUserId,
        task: {
          projectId,
        },
      },
    });

    // Удаляем участника из проекта
    await this.prisma.projectMember.delete({
      where: {
        userId_projectId: {
          userId: memberUserId,
          projectId,
        },
      },
    });

    return { message: 'Member removed successfully' };
  }
}
