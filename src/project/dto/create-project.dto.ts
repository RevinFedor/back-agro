import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'My First Project' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Description of the project', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}