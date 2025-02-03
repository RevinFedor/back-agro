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
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
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
      storage: memoryStorage(), // Заменяем diskStorage на memoryStorage
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

  // Получение  спектрального изображения .
  @Get(':taskId/spectral/:spectralImage')
  @ApiOperation({ summary: 'Download spectral image for task' })
  async downloadSpectralImage(
    @Param('taskId') taskId: string,
    @Param('spectralImage') spectralImage: string,
    @Request() req,
    @Res() res,
  ) {
    const task = await this.taskService.findOne(taskId, req.user.id);

    const spectralImagePath = `uploads/tasks/${taskId}/spectral/${spectralImage}`;

    if (!spectralImage) {
      throw new NotFoundException('Spectral image not found');
    }

    return res.sendFile(spectralImagePath, { root: './' });
  }

  // Загрузка  tiff файла.
  @Post(':taskId/tiff-upload')
  @ApiOperation({ summary: 'Upload and process TIFF file' })
  @UseInterceptors(
    FileInterceptor('tiff', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'image/tiff') {
          cb(new BadRequestException('Only TIFF files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadTiff(
    @Param('taskId') taskId: string,
    @UploadedFile() tiff: Express.Multer.File,
    @Request() req,
  ) {
    return this.taskService.processTiff(taskId, tiff, req.user.id);
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
