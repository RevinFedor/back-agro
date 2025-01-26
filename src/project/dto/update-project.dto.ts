import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateProjectDto {
  @ApiProperty({ example: 'Updated Project Name', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'Updated project description', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}