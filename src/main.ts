import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { writeFileSync } from 'fs';
import { LoggingInterceptor } from './logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Включаем CORS с определенными настройками
  app.enableCors({
    origin: 'http://localhost:5173', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  // Добавляем ValidationPipe
  app.useGlobalPipes(new ValidationPipe());
  app.useLogger(new Logger('AppLogger'));

  // Добавляем глобальный интерсептор для логирования
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Настройка Swagger
  const config = new DocumentBuilder()
    .setTitle('Aerial Monitoring API')
    .setDescription('API для системы мониторинга с дронов')
    .setVersion('1.0')
    .addBearerAuth() // Добавляем поддержку JWT Bearer токена
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Сохраняем swagger документацию в файлы
  writeFileSync('./swagger-spec.json', JSON.stringify(document));
  SwaggerModule.setup('api', app, document);

  await app.listen(3001);
}
bootstrap();
