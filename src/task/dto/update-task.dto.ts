import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { TaskType } from '@prisma/client';

export class UpdateTaskDto {
  @ApiProperty({ example: 'Updated Task Name', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ 
    enum: TaskType,
    example: TaskType.DRONE_IMAGES,
    required: false
  })
  @IsEnum(TaskType)
  @IsOptional()
  type?: TaskType;
}
