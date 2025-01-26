import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Param,
  UseInterceptors,
  UploadedFiles,
  NotFoundException,
  Res,
  Put,
  Delete,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { UpdateTaskDto } from './dto/update-task.dto';


@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/tasks')
export class TaskController {
  constructor(private taskService: TaskService) {}

  // Создание новой задачи в проекте.
  @Post()
  @ApiOperation({ summary: 'Create new task' })
  create(
    @Param('projectId') projectId: string,
    @Body() createTaskDto: CreateTaskDto,
    @Request() req,
  ) {
    return this.taskService.create(createTaskDto, projectId, req.user.id);
  }

  // Получение всех задач в проекте.
  @Get()
  @ApiOperation({ summary: 'Get all tasks in project' })
  findAll(@Param('projectId') projectId: string, @Request() req) {
    return this.taskService.findAll(projectId, req.user.id);
  }

  // Загрузка изображений для задачи.
  @Post(':taskId/images')
  @ApiOperation({ summary: 'Upload images for task' })
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  uploadImages(
    @Param('taskId') taskId: string,
    @UploadedFiles() images: Express.Multer.File[],
    @Request() req,
  ) {
    return this.taskService.processImages(taskId, images, req.user.id);
  }

  // Получение информации о задаче.
  @Get(':taskId')
  @ApiOperation({ summary: 'Get task info' })
  findOne(@Param('taskId') taskId: string, @Request() req) {
    return this.taskService.findOne(taskId, req.user.id);
  }

  // Загрузка TIFF файла результата задачи.
  @Get(':taskId/tiff')
  @ApiOperation({ summary: 'Download task TIFF result' })
  async downloadTiff(
    @Param('taskId') taskId: string,
    @Request() req,
    @Res() res,
  ) {
    const task = await this.taskService.findOne(taskId, req.user.id);

    if (!task.tiffPath) {
      throw new NotFoundException('TIFF file not found');
    }

    return res.sendFile(task.tiffPath, { root: './' });
  }

  // Обновление задачи.
  @Put(':taskId')
  @ApiOperation({ summary: 'Update task' })
  async update(
    @Param('taskId') taskId: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @Request() req,
  ) {
    return this.taskService.update(taskId, updateTaskDto, req.user.id);
  }

  // Удаление задачи.
  @Delete(':taskId')
  @ApiOperation({ summary: 'Delete task' })
  async remove(@Param('taskId') taskId: string, @Request() req) {
    return this.taskService.remove(taskId, req.user.id);
  }
}

