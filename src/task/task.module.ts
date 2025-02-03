import { Module } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { NodeOdmService } from './services/node-odm.service';
import { PrismaService } from '../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TaskGateway } from './task.gateway';
import { SpectralService } from './services/spectral.service';

@Module({
  imports: [HttpModule, ConfigModule], 
  controllers: [TaskController],
  providers: [TaskService, NodeOdmService, PrismaService,TaskGateway, SpectralService  ],
  exports:[SpectralService]
})
export class TaskModule {}