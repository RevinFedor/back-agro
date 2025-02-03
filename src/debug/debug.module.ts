
import { Module } from '@nestjs/common';

import { TaskModule } from '../task/task.module';
import { DebugController } from './debug.controller';

@Module({
  imports: [TaskModule], // Импортируем TaskModule для доступа к SpectralService
  controllers: [DebugController],
})
export class DebugModule {}

