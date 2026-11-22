import type { PrismaClient } from '@prisma/client';
import { PostNotFoundError, TagNotFoundError, UserNotFoundError, ValidationError } from '../shared/errors.js';

export class PostController {
  constructor(private readonly prisma: PrismaClient) {}

  async create(authorId: number, body: unknown, imageUrl?: string) {
    const { content, tags } = (body ?? {}) as { content?: unknown; tags?: unknown };

    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ValidationError('"content" é obrigatório');
    }
    if (tags !== undefined && (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string'))) {
      throw new ValidationError('"tags", quando informado, deve ser uma lista de strings');
    }

    const author = await this.prisma.user.findUnique({ where: { id: authorId } });
    if (!author) {
      throw new UserNotFoundError(authorId);
    }

    const tagNames = (tags as string[] | undefined) ?? [];

    return this.prisma.post.create({
      data: {
        content,
        imageUrl,
        author: { connect: { id: authorId } },
        tags: {
          connectOrCreate: tagNames.map((name) => ({
            where: { name },
            create: { name },
          })),
        },
      },
      include: { author: true, tags: true },
    });
  }

  async get(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { author: true, tags: true },
    });
    if (!post) {
      throw new PostNotFoundError(id);
    }
    return post;
  }

  async getForUser(id: number, userId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: true,
        tags: true,
        comments: { include: { author: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId }, select: { userId: true } },
      },
    });
    if (!post) {
      throw new PostNotFoundError(id);
    }

    const { likes, ...postData } = post;
    return { ...postData, likedByMe: likes.length > 0 };
  }

  async createComment(postId: number, authorId: number, body: unknown) {
    const { content } = (body ?? {}) as { content?: unknown };
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ValidationError('"content" é obrigatório');
    }
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new ValidationError('O id do post deve ser um número inteiro positivo');
    }
    if (!Number.isInteger(authorId) || authorId <= 0) {
      throw new ValidationError('O id do autor deve ser um número inteiro positivo');
    }
    await this.ensurePostExists(postId);

    return this.prisma.comment.create({
      data: { content: content.trim(), authorId, postId },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async listComments(postId: number) {
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new ValidationError('O id do post deve ser um número inteiro positivo');
    }
    await this.ensurePostExists(postId);
    return this.prisma.comment.findMany({
      where: { postId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async removeComment(commentId: number) {
    const comment = await this.prisma.comment.delete({ where: { id: commentId } });
    const commentCount = await this.prisma.comment.count({ where: { postId: comment.postId } });
    return { commentCount };
  }

  async like(userId: number, postId: number) {
    this.validateLikeIds(userId, postId);
    await this.ensurePostExists(postId);

    await this.prisma.like.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: {},
    });

    const likeCount = await this.prisma.like.count({ where: { postId } });
    return { liked: true, likeCount };
  }

  async unlike(userId: number, postId: number) {
    this.validateLikeIds(userId, postId);
    await this.ensurePostExists(postId);

    await this.prisma.like.deleteMany({ where: { userId, postId } });

    const likeCount = await this.prisma.like.count({ where: { postId } });
    return { liked: false, likeCount };
  }

  private validateLikeIds(userId: number, postId: number): void {
    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(postId) || postId <= 0) {
      throw new ValidationError('O id do post deve ser um número inteiro positivo');
    }
  }

  private async ensurePostExists(postId: number): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) {
      throw new PostNotFoundError(postId);
    }
  }

  async listByTag(name: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { name },
      include: { posts: { include: { author: true }, orderBy: { createdAt: 'desc' } } },
    });
    if (!tag) {
      throw new TagNotFoundError(name);
    }
    return tag.posts;
  }

  async remove(id: number): Promise<void> {
    await this.prisma.post.delete({ where: { id } });
  }
}
