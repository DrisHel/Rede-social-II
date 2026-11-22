import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { DuplicateFollowError, SelfFollowError, UserNotFoundError, ValidationError } from '../shared/errors.js';

export const DEFAULT_FEED_PAGE_SIZE = 10;
export const MAX_FEED_PAGE_SIZE = 50;

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
    await this.ensureUserExists(userId);
    return this.queryFeedPosts(userId);
  }

  async feedPage(userId: number, cursor: number | undefined, limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FEED_PAGE_SIZE) {
      throw new ValidationError(`"limit" deve estar entre 1 e ${MAX_FEED_PAGE_SIZE}`);
    }
    await this.ensureUserExists(userId);

    if (cursor !== undefined) {
      const cursorPost = await this.prisma.post.findFirst({
        where: {
          id: cursor,
          author: { followers: { some: { followerId: userId } } },
        },
        select: { id: true },
      });
      if (!cursorPost) {
        throw new ValidationError('"cursor" não pertence ao feed');
      }
    }

    const posts = await this.queryFeedPosts(userId, cursor, limit + 1);
    const hasMore = posts.length > limit;
    const pagePosts = posts.slice(0, limit);

    return {
      posts: pagePosts,
      nextCursor: hasMore ? pagePosts[pagePosts.length - 1].id : null,
      hasMore,
    };
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

  private async ensureUserExists(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new UserNotFoundError(userId);
    }
  }

  private async queryFeedPosts(userId: number, cursor?: number, take?: number) {
    const posts = await this.prisma.post.findMany({
      where: { author: { followers: { some: { followerId: userId } } } },
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      ...(take === undefined ? {} : { take }),
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
}
