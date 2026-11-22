import { Router } from 'express';
import type { UserController } from './users/UserController.js';
import type { PostController } from './posts/PostController.js';
import { DEFAULT_FEED_PAGE_SIZE, MAX_FEED_PAGE_SIZE } from './users/UserController.js';
import { asyncHandler } from './shared/http.js';

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function createRoutes(userController: UserController, postController: PostController): Router {
  const router = Router();

  router.get(
    '/feed',
    asyncHandler(async (req, res) => {
      const userId = req.session.userId;
      if (userId === undefined) {
        res.status(401).json({ error: 'Autenticação necessária' });
        return;
      }

      const cursor = req.query.cursor === undefined
        ? undefined
        : parsePositiveInteger(req.query.cursor);
      const limit = req.query.limit === undefined
        ? DEFAULT_FEED_PAGE_SIZE
        : parsePositiveInteger(req.query.limit);
      if ((req.query.cursor !== undefined && cursor === undefined) || limit === undefined || limit > MAX_FEED_PAGE_SIZE) {
        res.status(400).json({ error: `"cursor" deve ser positivo e "limit" deve estar entre 1 e ${MAX_FEED_PAGE_SIZE}` });
        return;
      }

      const page = await userController.feedPage(userId, cursor, limit);
      const html = await new Promise<string>((resolve, reject) => {
        req.app.render(
          'partials/feedPosts',
          { feed: page.posts, currentUser: { id: userId } },
          (error, rendered) => {
            if (error) {
              reject(error);
              return;
            }
            if (rendered === undefined) {
              reject(new Error('Não foi possível renderizar os posts do feed'));
              return;
            }
            resolve(rendered);
          },
        );
      });

      res.json({ ...page, html });
    }),
  );

  router.get(
    '/users/:id',
    asyncHandler(async (req, res) => {
      const user = await userController.get(Number(req.params.id));
      res.json(user);
    }),
  );

  router.get(
    '/users/:id/feed',
    asyncHandler(async (req, res) => {
      const feed = await userController.feed(Number(req.params.id));
      res.json(feed);
    }),
  );

  router.get(
    '/posts/:id',
    asyncHandler(async (req, res) => {
      const post = await postController.get(Number(req.params.id));
      res.json(post);
    }),
  );

  router.get(
    '/tags/:name/posts',
    asyncHandler(async (req, res) => {
      const posts = await postController.listByTag(req.params.name);
      res.json(posts);
    }),
  );

  return router;
}
