import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  AddProjectMemberDto,
  UpdateProjectMemberRoleDto,
} from './dto/project-member.dto';


// ProjectController — контроллер для управления проектами: создание, получение, обновление, удаление и управление участниками.
@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects')
export class ProjectController {
  constructor(private projectService: ProjectService) {}

  // Создание нового проекта.
  @Post()
  @ApiOperation({ summary: 'Create new project' })
  create(@Body() createProjectDto: CreateProjectDto, @Request() req) {
    return this.projectService.create(createProjectDto, req.user.id);
  }

  // Получение всех проектов пользователя.
  @Get()
  @ApiOperation({ summary: 'Get all user projects' })
  findAll(@Request() req) {
    return this.projectService.findAll(req.user.id);
  }

  // Получение проекта по ID.
  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  async findById(@Param('id') id: string, @Request() req) {
    return this.projectService.findById(id, req.user.id);
  }

  // Обновление проекта.
  @Put(':id')
  @ApiOperation({ summary: 'Update project' })
  async update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @Request() req,
  ) {
    return this.projectService.update(id, updateProjectDto, req.user.id);
  }

  // Удаление проекта.
  @Delete(':id')
  @ApiOperation({ summary: 'Delete project' })
  async remove(@Param('id') id: string, @Request() req) {
    return this.projectService.remove(id, req.user.id);
  }

  // Получение всех участников проекта.
  @Get(':id/members')
  @ApiOperation({ summary: 'Get all project members' })
  async getMembers(@Param('id') id: string, @Request() req) {
    return this.projectService.getProjectMembers(id, req.user.id);
  }

  // Добавление участника в проект.
  @Post(':id/members')
  @ApiOperation({ summary: 'Add member to project' })
  async addMember(
    @Param('id') id: string,
    @Body() addMemberDto: AddProjectMemberDto,
    @Request() req,
  ) {
    return this.projectService.addProjectMember(id, addMemberDto, req.user.id);
  }

  // Обновление роли участника в проекте.
  @Put(':id/members/:userId')
  @ApiOperation({ summary: 'Update member role in project' })
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() updateRoleDto: UpdateProjectMemberRoleDto,
    @Request() req,
  ) {
    return this.projectService.updateProjectMemberRole(
      id,
      userId,
      updateRoleDto,
      req.user.id,
    );
  }

  // Удаление участника из проекта.
  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove member from project' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req,
  ) {
    return this.projectService.removeProjectMember(id, userId, req.user.id);
  }
}
