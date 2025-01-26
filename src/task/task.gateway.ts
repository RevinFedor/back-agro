// src/task/task.gateway.ts
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { TaskStatus } from '@prisma/client';
import { Server } from 'socket.io';



/**
 * WebSocketGateway — сервис с функциями подписки на сокет
 */
@WebSocketGateway({
  cors: true,
  namespace: 'tasks'
})
export class TaskGateway {
  @WebSocketServer()
  server: Server;

  // Отправка обновления прогресса конкретной задачи
  sendTaskProgress(taskId: string, progress: number) {
    this.server.emit(`task:${taskId}:progress`, { progress });
  }

  // Отправка изменения статуса задачи
  sendTaskStatus(taskId: string, status: TaskStatus) {
    this.server.emit(`task:${taskId}:status`, { status });
  }

  // Отправка завершения задачи
  sendTaskComplete(taskId: string, data: any) {
    this.server.emit(`task:${taskId}:complete`, data);
  }
}