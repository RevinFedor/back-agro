# Обзор системы

Проект представляет собой бэкенд-приложение на базе **NestJS** для обработки и анализа изображений с дронов. Система обеспечивает управление проектами, задачами и пользователями, интегрируется с **NodeODM** для обработки изображений.

## Архитектура системы

### 1. Компоненты Backend

#### **NestJS Application (Port: 3001)**
- **REST API** для основных операций
- **WebSocket Server** для real-time обновлений
- **JWT аутентификация**
- **Swagger документация**

#### **NodeODM Service (Port: 3000)**
- Внешний сервис для обработки изображений
- **REST API** для управления задачами
- **Асинхронная обработка**
- **Генерация TIFF результатов**

### Новые возможности

За последнее обновление были добавлены следующие функциональности:

- **Обработка TIFF файлов и генерация спектральных изображений:**
  - Добавлен новый эндпоинт для загрузки TIFF файла:  
    **POST** `/projects/:projectId/tasks/:taskId/tiff-upload`
  - После загрузки файла система сохраняет TIFF, выполняет обработку и генерирует спектральные изображения (RGB, NDVI, INFRARED, VARI).
  - Результаты обработки (PNG файлы) сохраняются в папке задачи и доступны для скачивания.

- **Отладка спектральной обработки:**
  - Добавлен **Debug Endpoint** для тестирования спектральной обработки:  
    **POST** `/debug/spectral`
  - Позволяет загрузить TIFF файл и сразу проверить генерацию спектральных изображений.

- **Расширенные WebSocket уведомления:**
  - Помимо обновления прогресса (`task:{taskId}:progress`), теперь WebSocket сервер уведомляет клиентов о завершении обработки задачи (`task:{taskId}:complete`) с дополнительными метаданными (bounding box, список сгенерированных изображений).


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

