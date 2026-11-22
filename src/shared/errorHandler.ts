import type { NextFunction, Request, Response } from 'express';
import {
  DuplicateEmailError,
  DuplicateFollowError,
  CommentNotFoundError,
  InvalidCredentialsError,
  PostNotFoundError,
  SelfFollowError,
  TagNotFoundError,
  UserNotFoundError,
  ValidationError,
} from './errors.js';

const STATUS_BY_ERROR = new Map<Function, number>([
  [ValidationError, 400],
  [SelfFollowError, 400],
  [InvalidCredentialsError, 401],
  [UserNotFoundError, 404],
  [PostNotFoundError, 404],
  [CommentNotFoundError, 404],
  [TagNotFoundError, 404],
  [DuplicateFollowError, 409],
  [DuplicateEmailError, 409],
]);

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const status = STATUS_BY_ERROR.get(err.constructor) ?? 500;

  if (req.accepts(['html', 'json']) === 'html') {
    res.status(status).render('error', { status, message: err.message });
    return;
  }
  res.status(status).json({ error: err.message });
}
