import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { TaskType } from '@prisma/client';

export class CreateTaskDto {
  @ApiProperty({ example: 'Task 1' })
  @IsString()
  name: string;

  @ApiProperty({ 
    enum: TaskType,
    example: TaskType.DRONE_IMAGES
  })
  @IsEnum(TaskType)
  type: TaskType;
}