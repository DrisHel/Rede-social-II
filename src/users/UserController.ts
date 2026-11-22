import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { DuplicateFollowError, SelfFollowError, UserNotFoundError, ValidationError } from '../shared/errors.js';

export class UserController {
  constructor(private readonly prisma: PrismaClient) {}

  async get(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: { select: { posts: true, followers: true, following: true } },
      },
    });
    if (!user) {
      throw new UserNotFoundError(id);
    }
    return user;
  }

  async follow(followerId: number, body: unknown) {
    const { targetId } = (body ?? {}) as { targetId?: unknown };
    if (typeof targetId !== 'number' || !Number.isInteger(targetId)) {
      throw new ValidationError('"targetId" é obrigatório e deve ser um número inteiro');
    }
    if (targetId === followerId) {
      throw new SelfFollowError();
    }

    const [follower, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: followerId } }),
      this.prisma.user.findUnique({ where: { id: targetId } }),
    ]);
    if (!follower) {
      throw new UserNotFoundError(followerId);
    }
    if (!target) {
      throw new UserNotFoundError(targetId);
    }

    try {
      return await this.prisma.follow.create({
        data: { followerId, followingId: targetId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateFollowError();
      }
      throw err;
    }
  }

  async feed(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const posts = await this.prisma.post.findMany({
      where: { author: { followers: { some: { followerId: userId } } } },
      include: {
        author: true,
        tags: true,
        images: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
        comments: {
          include: {
            author: { select: { id: true, name: true } },
            _count: { select: { commentLikes: true } },
            commentLikes: { where: { userId }, select: { userId: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId }, select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return posts.map(({ likes, ...post }) => ({
      ...post,
      comments: post.comments.map(({ commentLikes, ...comment }) => ({
        ...comment,
        likedByMe: commentLikes.length > 0,
      })),
      likedByMe: likes.length > 0,
    }));
  }

  async listOthers(currentUserId: number) {
    const users = await this.prisma.user.findMany({
      where: { id: { not: currentUserId } },
      orderBy: { name: 'asc' },
    });
    const following = await this.prisma.follow.findMany({ where: { followerId: currentUserId } });
    const followingIds = new Set(following.map((f) => f.followingId));

    return users.map((user) => ({ ...user, isFollowing: followingIds.has(user.id) }));
  }
}
