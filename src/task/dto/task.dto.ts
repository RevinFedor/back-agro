import { TaskStatus, TaskType } from "@prisma/client";

export interface CreateTaskDto {
    projectId: string;
    name: string;
    type: TaskType;      // DRONE_IMAGES | SATELLITE_IMAGES
    description?: string;
    options?: {
        name: string;
        value: string | number | boolean;
    }[];
}

export interface TaskDto {
    id: string;
    projectId: string;
    name: string;
    type: TaskType;
    description?: string;
    status: TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    progress: number;
    tiffPath?: string;
    error?: string;
}