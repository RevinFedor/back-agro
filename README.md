# Обзор системы

Проект представляет собой бэкенд-приложение на базе **NestJS** для обработки и анализа изображений с дронов. Система обеспечивает управление проектами, задачами и пользователями, интегрируется с **NodeODM** для обработки изображений.

## Архитектура системы

### 1. Компоненты Backend

#### **NestJS Application (Port: 3001)**
- **REST API** для основных операций  

- **WebSocket Server** для real-time обновлений  
  _Путь:_  
  - Реализация WebSocket уведомлений: [src/task/task.gateway.ts](src/task/task.gateway.ts)

- **JWT аутентификация**  
  _Пути:_  
  - JWT стратегия и настройка: [src/auth/jwt.strategy.ts](src/auth/jwt.strategy.ts)  
  - Контроллер и сервис аутентификации: [src/auth/auth.controller.ts](src/auth/auth.controller.ts), [src/auth/auth.service.ts](src/auth/auth.service.ts)  
  - Модуль аутентификации: [src/auth/auth.module.ts](src/auth/auth.module.ts)

- **Эндпоинты для обработки TIFF файлов:**  
  - **Загрузка TIFF файла** – сохраняется и инициируется обработка, генерируются спектральные изображения (RGB, NDVI, INFRARED, VARI)  
    _Путь:_  
    - Эндпоинт загрузки: [src/task/task.controller.ts](src/task/task.controller.ts) (маршрут: `/projects/:projectId/tasks/:taskId/tiff-upload`)  
    - Логика обработки TIFF: [src/task/task.service.ts](src/task/task.service.ts) и [src/task/services/node-odm.service.ts](src/task/services/node-odm.service.ts)  
    - Генерация спектральных изображений: [src/task/services/spectral.service.ts](src/task/services/spectral.service.ts)

- **Debug Endpoint** для тестирования спектральной обработки  
  _Путь:_  
  - Контроллер для отладки: [src/debug/debug.controller.ts](src/debug/debug.controller.ts)  
  - Маршрут: **POST** `/debug/spectral`

- **Расширенные WebSocket уведомления:**  
  _Путь:_  
  - Отправка обновлений прогресса и уведомлений о завершении: [src/task/task.gateway.ts](src/task/task.gateway.ts)  
  - Примеры:  
    - Обновление прогресса: событие `task:{taskId}:progress`  
    - Завершение обработки с метаданными: событие `task:{taskId}:complete`

#### **NodeODM Service (Port: 3000)**
- **Внешний сервис для обработки изображений**  
  _Интеграция в проекте:_  
  - Взаимодействие с NodeODM реализовано через: [src/task/services/node-odm.service.ts](src/task/services/node-odm.service.ts)
- **REST API** для управления задачами  
  - NodeODM предоставляет собственный API для управления задачами (интегрируется через вызовы HTTP в [src/task/services/node-odm.service.ts](src/task/services/node-odm.service.ts))
- **Асинхронная обработка**  
  - Обработка задач NodeODM происходит асинхронно (описывается в логике сервиса в [src/task/services/node-odm.service.ts](src/task/services/node-odm.service.ts))
- **Генерация TIFF результатов**  
  - Скачивание и сохранение TIFF-файлов осуществляется в [src/task/services/node-odm.service.ts](src/task/services/node-odm.service.ts)


### 2. Интеграция с Swagger

- **Endpoint:** `/api`
- **Документация:** Автоматически генерируемая на основе декораторов
- **Спецификация:** Сохраняется в `swagger-spec.json`

**Особенности:**
- Интерактивный UI для тестирования API
- Поддержка JWT авторизации
- Подробное описание всех эндпоинтов
- Схемы запросов и ответов

### 3. Взаимодействие компонентов

```
Client <-> NestJS Backend <-> NodeODM Service
   |           |                    |
   |           v                    |
   |      PostgreSQL               |
   |           |                    |
   +---- WebSocket <---- Task Progress
```

## Система ролей

В системе реализована гибкая ролевая модель:

```typescript
enum Role {
    OWNER,   // Владелец/админ
    EDITOR,  // Редактор
    VIEWER   // Просмотрщик
}
```

### Как работает система распределения ролей

#### Таблица `ProjectMember`

Это связующая таблица между пользователем и проектом. Для каждого пользователя в проекте создаётся одна запись, в которой указывается роль пользователя. У одного пользователя может быть только одна роль в проекте.

**Пример:**

Проект "Съёмка парка"
- Иван (`OWNER`) - создатель проекта
- Мария (`EDITOR`) - может загружать и обрабатывать фото
- Петр (`VIEWER`) - может только просматривать результаты

#### Таблица `TaskMember`

Работает аналогично, но для конкретных задач. Если роль не указана (`null`), пользователь задачу не видит. Используется для более тонкой настройки доступов.

**Пример:**

Задача "Съёмка северной части парка"
- Иван (`OWNER`) - видит всё
- Мария (`EDITOR`) - работает над задачей
- Петр (`null`) - эту задачу не видит

## API Endpoints

### Управление проектами

| Метод | Эндпоинт         | Описание                |
|-------|------------------|-------------------------|
| GET   | `/projects`      | Получение списка проектов |
| POST  | `/projects`      | Создание проекта        |
| PUT   | `/projects/:id`  | Обновление проекта      |
| DELETE| `/projects/:id`  | Удаление проекта        |

### Управление участниками проекта

| Метод | Эндпоинт                                | Описание                    |
|-------|-----------------------------------------|-----------------------------|
| GET   | `/projects/:id/members`                 | Список участников           |
| POST  | `/projects/:id/members`                 | Добавление участника        |
| PUT   | `/projects/:id/members/:userId`         | Изменение роли              |
| DELETE| `/projects/:id/members/:userId`         | Удаление участника          |

### Управление задачами

| Метод | Эндпоинт                                     | Описание                 |
|-------|----------------------------------------------|--------------------------|
| GET   | `/projects/:id/tasks`                        | Список задач             |
| POST  | `/projects/:id/tasks`                        | Создание задачи          |
| PUT   | `/projects/:id/tasks/:taskId`                | Обновление задачи        |
| DELETE| `/projects/:id/tasks/:taskId`                | Удаление задачи          |

### Загрузка и обработка

| Метод | Эндпоинт                                                | Описание                   |
|-------|---------------------------------------------------------|----------------------------|
| POST  | `/projects/:id/tasks/:taskId/images`                   | Загрузка изображений       |
| GET   | `/projects/:id/tasks/:taskId/tiff`                     | Получение результата       |

### WebSocket Events

- **`task:{taskId}:progress`** - Обновление прогресса (0-100%)
- **`task:{taskId}:status`** - Изменение статуса (`PROCESSING`/`COMPLETED`/`FAILED`)
- **`task:{taskId}:complete`** - Завершение обработки (с метаданными)

