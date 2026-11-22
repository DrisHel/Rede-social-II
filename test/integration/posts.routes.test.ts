import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/server.js';
import { createTestPrismaClient, resetDatabase } from '../helpers/testDb.js';
import { FakeImageStorage } from '../helpers/fakeImageStorage.js';
import { registerAndLogin } from '../helpers/auth.js';

const prisma: PrismaClient = createTestPrismaClient();
let imageStorage: FakeImageStorage;
let app: ReturnType<typeof createServer>;

beforeEach(async () => {
  await resetDatabase(prisma);
  imageStorage = new FakeImageStorage();
  app = createServer(prisma, imageStorage);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /posts (autenticado)', () => {
  it('rejeita quem não está logado', async () => {
    const res = await request(app).post('/posts').type('form').send({ content: 'Sem sessão' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('cria um post com o autor vindo da sessão, não do corpo (autorização)', async () => {
    const { agent, userId } = await registerAndLogin(app, prisma, 'ana@exemplo.com');

    const res = await agent.post('/posts').type('form').send({ content: 'Olá, Prisma!', tags: 'prisma, orm' });

    expect(res.status).toBe(302);
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Olá, Prisma!' }, include: { tags: true } });
    expect(post.authorId).toBe(userId);
    expect(post.tags.map((t) => t.name).sort()).toEqual(['orm', 'prisma']);
  });

  it('faz upload da imagem via ImageStorage e salva a URL retornada no post', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');

    const res = await agent
      .post('/posts')
      .field('content', 'Post com foto')
      .attach('image', Buffer.from('fake-image-bytes'), { filename: 'foto.png', contentType: 'image/png' });

    expect(res.status).toBe(302);
    expect(imageStorage.uploads).toHaveLength(1);
    expect(imageStorage.uploads[0].originalname).toBe('foto.png');

    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post com foto' } });
    expect(post.imageUrl).toBe('https://fake-bucket.test/foto.png');
  });

  it('rejeita um arquivo que não é imagem (fileFilter do Multer)', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');

    const res = await agent
      .post('/posts')
      .field('content', 'Post com anexo inválido')
      .attach('image', Buffer.from('não é imagem'), { filename: 'arquivo.txt', contentType: 'text/plain' });

    expect(res.status).toBe(500);
    expect(imageStorage.uploads).toHaveLength(0);
  });

  it('rejeita post sem conteúdo', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');

    const res = await agent.post('/posts').type('form').send({ content: '' });

    expect(res.status).toBe(400);
  });
});

describe('curtidas em posts', () => {
  it('serve o JavaScript de curtidas compartilhado', async () => {
    const res = await request(app).get('/assets/likes.js');

    expect(res.status).toBe(200);
    expect(res.text).toContain("method: liked ? 'DELETE' : 'POST'");
  });

  it('renderiza a página do post com a curtida atual do usuário', async () => {
    const user = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    await user.agent.post('/posts').type('form').send({ content: 'Post em detalhe' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post em detalhe' } });

    await user.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    const res = await user.agent.get(`/posts/${post.id}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Post em detalhe');
    expect(res.text).toContain('aria-pressed="true"');
    expect(res.text).toContain('<span data-like-count>1</span>');
  });

  it('protege a página de post com autenticação', async () => {
    const user = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    await user.agent.post('/posts').type('form').send({ content: 'Post privado no feed' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post privado no feed' } });

    const res = await request(app).get(`/posts/${post.id}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('exige autenticação para curtir e descurtir', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com');
    await author.agent.post('/posts').type('form').send({ content: 'Post para curtir' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post para curtir' } });

    const likeResponse = await request(app).post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    const unlikeResponse = await request(app).delete(`/posts/${post.id}/like`).set('Accept', 'application/json');

    expect(likeResponse.status).toBe(302);
    expect(likeResponse.headers.location).toBe('/login');
    expect(unlikeResponse.status).toBe(302);
    expect(unlikeResponse.headers.location).toBe('/login');
  });

  it('curte e descurte sem duplicar registros e devolve a contagem atualizada', async () => {
    const user = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    await user.agent.post('/posts').type('form').send({ content: 'Post curtido' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post curtido' } });

    const firstLike = await user.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    expect(firstLike.status).toBe(200);
    expect(firstLike.body).toEqual({ liked: true, likeCount: 1 });
    expect(await prisma.like.count({ where: { postId: post.id } })).toBe(1);

    const repeatedLike = await user.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    expect(repeatedLike.status).toBe(200);
    expect(repeatedLike.body).toEqual({ liked: true, likeCount: 1 });
    expect(await prisma.like.count({ where: { postId: post.id } })).toBe(1);

    const unlike = await user.agent.delete(`/posts/${post.id}/like`).set('Accept', 'application/json');

    expect(unlike.status).toBe(200);
    expect(unlike.body).toEqual({ liked: false, likeCount: 0 });
    expect(await prisma.like.count({ where: { postId: post.id } })).toBe(0);
  });

  it('retorna 404 para post inexistente e 400 para id inválido', async () => {
    const user = await registerAndLogin(app, prisma, 'ana@exemplo.com');

    const missingPost = await user.agent.post('/posts/999/like').set('Accept', 'application/json');
    const invalidId = await user.agent.delete('/posts/invalid/like').set('Accept', 'application/json');

    expect(missingPost.status).toBe(404);
    expect(invalidId.status).toBe(400);
  });

  it('mostra no feed a contagem e se o usuário atual curtiu o post', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com', 'Autora');
    await author.agent.post('/posts').type('form').send({ content: 'Post no feed' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post no feed' } });

    const reader = await registerAndLogin(app, prisma, 'leitora@exemplo.com', 'Leitora');
    await reader.agent.post('/follow').type('form').send({ targetId: author.userId });
    await reader.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    const feed = await reader.agent.get('/');

    expect(feed.status).toBe(200);
    expect(feed.text).toContain('aria-pressed="true"');
    expect(feed.text).toContain('<span data-like-count>1</span>');
  });
});

describe('POST /posts/:id/delete (autorização — dono do post)', () => {
  it('o dono consegue apagar o próprio post', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    await agent.post('/posts').type('form').send({ content: 'Post da Ana' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post da Ana' } });

    const res = await agent.post(`/posts/${post.id}/delete`);

    expect(res.status).toBe(302);
    await expect(prisma.post.findUnique({ where: { id: post.id } })).resolves.toBeNull();
  });

  it('outro usuário autenticado NÃO consegue apagar (403, não 404)', async () => {
    const author = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    await author.agent.post('/posts').type('form').send({ content: 'Post da Ana' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post da Ana' } });

    const other = await registerAndLogin(app, prisma, 'bruno@exemplo.com');
    const res = await other.agent.post(`/posts/${post.id}/delete`);

    expect(res.status).toBe(403);
    await expect(prisma.post.findUnique({ where: { id: post.id } })).resolves.not.toBeNull();
  });

  it('quem não está logado é redirecionado para /login', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    await agent.post('/posts').type('form').send({ content: 'Post da Ana' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post da Ana' } });

    const res = await request(app).post(`/posts/${post.id}/delete`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('API JSON de leitura (/api/...)', () => {
  it('GET /api/posts/:id retorna 404 para post inexistente', async () => {
    const res = await request(app).get('/api/posts/999');

    expect(res.status).toBe(404);
  });

  it('GET /api/posts/:id retorna o post com autor e tags', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    await agent.post('/posts').type('form').send({ content: 'Olá, Prisma!', tags: 'prisma' });
    const created = await prisma.post.findFirstOrThrow({ where: { content: 'Olá, Prisma!' } });

    const res = await request(app).get(`/api/posts/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.author.name).toBe('Usuária de teste');
    expect(res.body.tags[0].name).toBe('prisma');
  });

  it('GET /api/tags/:name/posts retorna 404 para tag inexistente', async () => {
    const res = await request(app).get('/api/tags/inexistente/posts');

    expect(res.status).toBe(404);
  });
});
