import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class AddProjectMemberDto {
  @ApiProperty({ example: 'user-uuid' })
  @IsString()
  userId: string;

  @ApiProperty({ 
    enum: Role,
    example: Role.VIEWER,
    description: 'Role in project'
  })
  @IsEnum(Role)
  role: Role;
}

export class UpdateProjectMemberRoleDto {
  @ApiProperty({ 
    enum: Role,
    example: Role.EDITOR,
    description: 'New role in project'
  })
  @IsEnum(Role)
  role: Role;
}