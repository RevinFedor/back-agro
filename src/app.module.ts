import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ProjectModule } from './project/project.module';
import { TaskModule } from './task/task.module';
import { DebugModule } from './debug/debug.module';

@Module({
  imports: [UserModule, AuthModule, ProjectModule, TaskModule,DebugModule],
})
export class AppModule {}