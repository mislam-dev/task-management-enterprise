import { PrismaClient, Todo as PrismaTodo } from "@prisma/client";
import { Todo } from "@todo/core/entities/todo.entities";
import {
  CreateTodoDTO,
  TodoFilter,
  TodoID,
  TodoPagination,
  TodoRepository,
  UpdateTodoDTO,
} from "@todo/core/repositories/todo.repository";
import { UserID } from "@todo/core/repositories/user.repository";
import crypto from "crypto";
import { Redis } from "../../redis";

export class PrismaTodoRepository implements TodoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(
    userId: UserID,
    options?: { filter?: TodoFilter; pagination?: TodoPagination }
  ): Promise<{ total: number; data: Todo[] }> {
    const page = options?.pagination?.page;
    const limit = options?.pagination?.limit;
    const redis = await Redis.getInstance();

    const key = this.getTodoCacheKey(userId, options);

    const isExist = await redis.exists(key);
    if (isExist) {
      const data = await redis.get<{ total: number; data: Todo[] }>(key);
      if (data) return data;
      redis.del(key);
    }

    const whereOptions = { deletedAt: null, userId, ...options?.filter };
    const todos = await this.prisma.todo.findMany({
      where: {
        ...whereOptions,
      },
      skip: page && limit ? limit * page - limit : undefined,
      take: limit,
    });

    const total = await this.count(whereOptions);
    const data = todos.map(this.toTodo);
    const responseData = { total: Math.ceil(total / (limit ?? 1)), data };
    if (redis && total > 0) redis.set(key, responseData, 60 * 60);
    return responseData;
  }

  private async count(options: any): Promise<number> {
    return this.prisma.todo.count({ where: options });
  }

  async findById(userId: UserID, id: TodoID): Promise<null | Todo> {
    const findTodo = await this.prisma.todo.findUnique({
      where: { id, deletedAt: null, userId },
    });
    if (!findTodo) return null;
    return this.toTodo(findTodo);
  }

  async create(data: CreateTodoDTO): Promise<null | Todo> {
    const newTodo = await this.prisma.todo.create({
      data,
    });
    const redis = await Redis.getInstance();

    await redis.del(`todos:${data.userId}:*`);

    return this.toTodo(newTodo);
  }

  async update(userId: UserID, id: TodoID, data: UpdateTodoDTO): Promise<Todo> {
    const findTodo = await this.findById(userId, id);
    if (!findTodo) throw new Error("Todo not found");
    const updatedTodo = await this.prisma.todo.update({
      where: { id, deletedAt: null },
      data,
    });
    const redis = await Redis.getInstance();

    await redis.del(`todos:${userId}:*`);
    return this.toTodo(updatedTodo);
  }

  async remove(userId: UserID, id: TodoID): Promise<unknown> {
    const findTodo = await this.findById(userId, id);
    if (!findTodo) throw new Error("Todo not found");

    const redis = await Redis.getInstance();
    await redis.del(`todos:${userId}:*`);

    return await this.prisma.todo.delete({
      where: { id },
    });
  }

  private getTodoCacheKey(
    userId: UserID,
    options?: { filter?: TodoFilter; pagination?: TodoPagination }
  ): string {
    const payload = {
      userId,
      filter: options?.filter || {},
      pagination: options?.pagination || {},
    };

    const serialized = JSON.stringify(payload);

    const hash = crypto.createHash("md5").update(serialized).digest("hex");

    return `todos:${userId}:${hash}`;
  }

  private toTodo(todo: PrismaTodo): Todo {
    return {
      id: todo.id,
      title: todo.title,
      completed: !!todo.completed,
      description: todo.description,
      createdAt: todo.createdAt,
    };
  }
}
