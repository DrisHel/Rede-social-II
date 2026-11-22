import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/server.js';
import { createTestPrismaClient, resetDatabase } from '../helpers/testDb.js';
import { FakeImageStorage } from '../helpers/fakeImageStorage.js';
import { registerAndLogin } from '../helpers/auth.js';

const prisma: PrismaClient = createTestPrismaClient();
const app = createServer(prisma, new FakeImageStorage());

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/users/:id', () => {
  it('retorna 404 para usuário inexistente', async () => {
    const res = await request(app).get('/api/users/999');

    expect(res.status).toBe(404);
  });

  it('retorna o usuário com contagem de posts/seguidores/seguindo', async () => {
    const { userId } = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await request(app).get(`/api/users/${userId}`);

    expect(res.status).toBe(200);
    expect(res.body._count).toEqual({ posts: 0, followers: 0, following: 0 });
  });
});

describe('POST /follow (autorrelação N:N, follower vem da sessão)', () => {
  it('rejeita quem não está logado', async () => {
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');

    const res = await request(app).post('/follow').type('form').send({ targetId: bruno.userId });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('permite seguir outro usuário', async () => {
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });

    expect(res.status).toBe(302);
    const follow = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: ana.userId, followingId: bruno.userId } },
    });
    expect(follow).not.toBeNull();
  });

  it('rejeita seguir a si mesmo — não é possível forjar outro followerId pelo corpo', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await ana.agent.post('/follow').type('form').send({ targetId: ana.userId });

    expect(res.status).toBe(400);
  });

  it('rejeita seguir o mesmo usuário duas vezes', async () => {
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });

    const res = await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });

    expect(res.status).toBe(409);
  });

  it('rejeita seguir usuário inexistente', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await ana.agent.post('/follow').type('form').send({ targetId: 999 });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/users/:id/feed', () => {
  it('retorna apenas posts de quem o usuário segue', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const carla = await registerAndLogin(app, prisma, 'carla@exemplo.com', 'Carla');

    await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });
    await bruno.agent.post('/posts').type('form').send({ content: 'Post do Bruno' });
    await carla.agent.post('/posts').type('form').send({ content: 'Post da Carla' });

    const res = await request(app).get(`/api/users/${ana.userId}/feed`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].content).toBe('Post do Bruno');
  });
});

describe('GET /api/feed', () => {
  it('exige uma sessão e devolve as páginas seguintes sem duplicar posts', async () => {
    const unauthenticated = await request(app).get('/api/feed');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error).toContain('Autenticação');

    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });

    for (let index = 1; index <= 12; index += 1) {
      await bruno.agent.post('/posts').type('form').send({ content: `Post ${index}` });
    }

    const firstPage = await ana.agent.get('/api/feed');
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.posts).toHaveLength(10);
    expect(firstPage.body.posts[0].content).toBe('Post 12');
    expect(firstPage.body.posts[9].content).toBe('Post 3');
    expect(firstPage.body.hasMore).toBe(true);
    expect(firstPage.body.nextCursor).toBe(firstPage.body.posts[9].id);
    expect(firstPage.body.html).toContain(`data-post-id="${firstPage.body.posts[0].id}"`);
    expect(firstPage.body.html).toContain('data-comment-form');
    expect(firstPage.body.html).toContain('data-like-button');
    expect(firstPage.body.posts[0].author.passwordHash).toBeUndefined();

    const secondPage = await ana.agent.get(`/api/feed?cursor=${firstPage.body.nextCursor}&limit=10`);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.posts).toHaveLength(2);
    expect(secondPage.body.posts.map((post: { content: string }) => post.content)).toEqual(['Post 2', 'Post 1']);
    expect(secondPage.body.hasMore).toBe(false);
    expect(secondPage.body.nextCursor).toBeNull();
    expect(firstPage.body.posts.map((post: { id: number }) => post.id))
      .not.toContain(secondPage.body.posts[0].id);

    const initialFeed = await ana.agent.get('/');
    expect(initialFeed.status).toBe(200);
    expect(initialFeed.text.match(/<article data-post-id=/g)).toHaveLength(10);
    expect(initialFeed.text).toContain('data-has-more="true"');
    expect(initialFeed.text).toContain('/assets/feedInfiniteScroll.js');
  });

  it('rejeita cursores e limites inválidos ou fora do feed', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const carla = await registerAndLogin(app, prisma, 'carla@exemplo.com', 'Carla');
    await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });
    await carla.agent.post('/posts').type('form').send({ content: 'Post fora do feed' });
    const foreignPost = await prisma.post.findFirstOrThrow({
      where: { content: 'Post fora do feed' },
      select: { id: true },
    });

    for (const query of ['?cursor=abc', '?limit=0', '?limit=51', `?cursor=${foreignPost.id}`]) {
      const response = await ana.agent.get(`/api/feed${query}`);
      expect(response.status).toBe(400);
    }
  });
});

describe('GET / — feed renderizado + sugestões de quem seguir', () => {
  it('lista outros usuários com isFollowing correto', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });

    const res = await ana.agent.get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Bruno');
    expect(res.text).toContain('Já segue');
  });
});

describe('notificações de atividade no feed', () => {
  it('conta novas curtidas e comentários uma vez desde a visita anterior', async () => {
    const owner = await registerAndLogin(app, prisma, 'dona@exemplo.com', 'Dona');
    const actor = await registerAndLogin(app, prisma, 'interagente@exemplo.com', 'Interagente');
    await owner.agent.post('/posts').type('form').send({ content: 'Post da dona' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post da dona' } });

    const initialFeed = await owner.agent.get('/');
    expect(initialFeed.text).toContain('<strong data-activity-total>0</strong>');

    const like = await actor.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    const comment = await actor.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Novo comentário' });
    expect(like.status).toBe(200);
    expect(comment.status).toBe(201);

    const notifications = await owner.agent.get('/');
    expect(notifications.text).toContain('<strong data-activity-total>2</strong>');
    expect(notifications.text).toContain('<span data-new-likes>1</span>');
    expect(notifications.text).toContain('<span data-new-comments>1</span>');

    const nextVisit = await owner.agent.get('/');
    expect(nextVisit.text).toContain('<strong data-activity-total>0</strong>');
  });

  it('não conta as próprias curtidas e comentários como atividade recebida', async () => {
    const owner = await registerAndLogin(app, prisma, 'dona@exemplo.com', 'Dona');
    await owner.agent.post('/posts').type('form').send({ content: 'Post da dona' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post da dona' } });

    const initialFeed = await owner.agent.get('/');
    expect(initialFeed.text).toContain('<strong data-activity-total>0</strong>');

    const like = await owner.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    const comment = await owner.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário da própria autora' });
    expect(like.status).toBe(200);
    expect(comment.status).toBe(201);

    const nextFeed = await owner.agent.get('/');
    expect(nextFeed.text).toContain('<strong data-activity-total>0</strong>');
    expect(nextFeed.text).toContain('<span data-new-likes>0</span>');
    expect(nextFeed.text).toContain('<span data-new-comments>0</span>');
  });
});
