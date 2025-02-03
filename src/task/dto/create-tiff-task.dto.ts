import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum } from 'class-validator';
import { TaskType } from '@prisma/client';

export class CreateTiffTaskDto {
  @ApiProperty({ example: 'Satellite Analysis Task' })
  @IsString()
  name: string;

  @ApiProperty({ 
    enum: TaskType,
    example: TaskType.SATELLITE_IMAGES,
    description: 'Task type'
  })
  @IsEnum(TaskType)
  type: TaskType;
}