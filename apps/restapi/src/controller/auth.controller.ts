import { CreateNewUserUseCase } from "@todo/core/use-cases/create-new-user";
import { UserLoginUseCase } from "@todo/core/use-cases/user-login";
import { ViewUserUseCase } from "@todo/core/use-cases/view-user";
import { getUserRepository } from "@todo/database";
import { ImplValidationError } from "@todo/errors/custom-error/validation-error";
import { ZodError } from "@todo/errors/interface/ValidationError";
import { BcryptJsHashPassword, ImplJsonWebToken } from "@todo/shared";
import { LoginUserSchema, RegisterUserSchema } from "@todo/shared/schemas";

import { Request, Response } from "express";
const hashPassword = new BcryptJsHashPassword();
const jwt = new ImplJsonWebToken();
export const login = async (req: Request, res: Response) => {
  const parsedData = LoginUserSchema.safeParse(req.body);
  if (!parsedData.success) {
    const errors = parsedData.error.errors as ZodError[];
    throw new ImplValidationError(400, "Login failed!", errors);
  }
  const data = parsedData.data;

  const createTodoUseCase = new UserLoginUseCase(
    getUserRepository(),
    hashPassword,
    jwt
  );
  const token = await createTodoUseCase.execute(data.email, data.password);

  res.status(202).json({ token });
  return;
};
export const me = async (req: Request, res: Response) => {
  const id = (req.user as any)?.id;

  const viewUserUseCase = new ViewUserUseCase(getUserRepository());
  const user = await viewUserUseCase.execute(id);

  res.status(200).json(user);
  return;
};

export const register = async (req: Request, res: Response) => {
  const parsedData = RegisterUserSchema.safeParse(req.body);
  if (!parsedData.success) {
    const errors = parsedData.error.errors as ZodError[];
    throw new ImplValidationError(400, "Registration failed!", errors);
  }
  const data = parsedData.data;

  const createNewUserUseCase = new CreateNewUserUseCase(
    getUserRepository(),
    hashPassword
  );
  await createNewUserUseCase.execute(data);

  res.status(202).json({ message: "User created successfully" });
  return;
};
