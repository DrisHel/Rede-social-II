import { Router } from 'express';
import type { UserController } from './users/UserController.js';
import type { PostController } from './posts/PostController.js';
import { asyncHandler } from './shared/http.js';

export function createRoutes(userController: UserController, postController: PostController): Router {
  const router = Router();

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
