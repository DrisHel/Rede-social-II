import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { CommentNotFoundError } from '../shared/errors.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.redirect('/login');
    return;
  }
  next();
}

export function requireOwnPost(prisma: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const postId = Number(req.params.id);
    const post = await prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      res.status(404).render('error', { status: 404, message: 'Post não encontrado' });
      return;
    }
    if (post.authorId !== req.session.userId) {
      res.status(403).render('error', { status: 403, message: 'Você não pode apagar um post de outra pessoa' });
      return;
    }
    next();
  };
}

export function requireOwnComment(prisma: PrismaClient) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const commentId = Number(req.params.commentId);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      next(new CommentNotFoundError(commentId));
      return;
    }

    void prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, postId: true },
    }).then((comment) => {
      if (!comment || comment.postId !== Number(req.params.id)) {
        next(new CommentNotFoundError(commentId));
        return;
      }
      if (comment.authorId !== req.session.userId) {
        res.status(403).json({ error: 'Você não pode alterar ou apagar um comentário de outra pessoa' });
        return;
      }
      next();
    }).catch(next);
  };
}
