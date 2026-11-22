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

  it('serve o seletor e o script que acumulam fotos escolhidas em etapas', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    const form = await agent.get('/posts/new');
    const script = await request(app).get('/assets/postImages.js');

    expect(form.status).toBe(200);
    expect(form.text).toContain('name="images"');
    expect(form.text).toContain('multiple');
    expect(form.text).toContain('data-post-image-list');
    expect(form.text).toContain('/assets/postImages.js');
    expect(script.status).toBe(200);
    expect(script.text).toContain("input.addEventListener('change'");
    expect(script.text).toContain('selectedFiles.items.add(file)');
    expect(script.text).toContain('input.files = selectedFiles.files');
  });

  it('envia cada foto ao ImageStorage e mantém a ordem no post', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');

    const res = await agent
      .post('/posts')
      .field('content', 'Post com foto')
      .attach('images', Buffer.from('fake-image-1'), { filename: 'foto1.png', contentType: 'image/png' })
      .attach('images', Buffer.from('fake-image-2'), { filename: 'foto2.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(302);
    expect(imageStorage.uploads.map((file) => file.originalname)).toEqual(['foto1.png', 'foto2.jpg']);

    const post = await prisma.post.findFirstOrThrow({
      where: { content: 'Post com foto' },
      include: { images: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
    });
    expect(post.images.map((image) => image.url)).toEqual([
      'https://fake-bucket.test/foto1.png',
      'https://fake-bucket.test/foto2.jpg',
    ]);
    expect(post.images.map((image) => image.order)).toEqual([0, 1]);
  });

  it('rejeita um arquivo que não é imagem (fileFilter do Multer)', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');

    const res = await agent
      .post('/posts')
      .field('content', 'Post com anexo inválido')
      .attach('images', Buffer.from('não é imagem'), { filename: 'arquivo.txt', contentType: 'text/plain' });

    expect(res.status).toBe(500);
    expect(imageStorage.uploads).toHaveLength(0);
  });

  it('rejeita mais de cinco fotos por postagem', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    let uploadRequest = agent
      .post('/posts')
      .field('content', 'Post com excesso de fotos');
    for (let index = 1; index <= 6; index += 1) {
      uploadRequest = uploadRequest.attach('images', Buffer.from(`fake-image-${index}`), {
        filename: `foto${index}.png`,
        contentType: 'image/png',
      });
    }

    const res = await uploadRequest;

    expect(res.status).toBe(400);
    expect(res.text).toContain('no máximo 5 fotos');
    expect(imageStorage.uploads).toHaveLength(0);
    await expect(prisma.post.findFirst({ where: { content: 'Post com excesso de fotos' } })).resolves.toBeNull();
  });

  it('renderiza todas as fotos no feed e na página do post', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com');
    await author.agent
      .post('/posts')
      .field('content', 'Post com duas fotos')
      .attach('images', Buffer.from('fake-image-1'), { filename: 'primeira.png', contentType: 'image/png' })
      .attach('images', Buffer.from('fake-image-2'), { filename: 'segunda.png', contentType: 'image/png' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post com duas fotos' } });

    const reader = await registerAndLogin(app, prisma, 'leitora@exemplo.com');
    await reader.agent.post('/follow').type('form').send({ targetId: author.userId });

    const feed = await reader.agent.get('/');
    const detail = await author.agent.get(`/posts/${post.id}`);
    const carouselScript = await request(app).get('/assets/feedCarousel.js');

    expect(feed.status).toBe(200);
    expect(feed.text).toContain('https://fake-bucket.test/primeira.png');
    expect(feed.text).toContain('https://fake-bucket.test/segunda.png');
    expect(feed.text).toContain('data-image-carousel');
    expect(feed.text).toContain('data-carousel-prev');
    expect(feed.text).toContain('data-carousel-next');
    expect(feed.text).toContain('1 / 2');
    expect(detail.status).toBe(200);
    expect(detail.text).toContain('https://fake-bucket.test/primeira.png');
    expect(detail.text).toContain('https://fake-bucket.test/segunda.png');
    expect(carouselScript.status).toBe(200);
    expect(carouselScript.text).toContain("feedList?.addEventListener('click'");
    expect(carouselScript.text).toContain('(Math.max(currentIndex, 0) + direction + slides.length) % slides.length');
  });

  it('mantém a exibição atual para posts com zero ou uma foto', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com');
    await author.agent.post('/posts').type('form').send({ content: 'Post sem foto' });
    await author.agent
      .post('/posts')
      .field('content', 'Post com uma foto')
      .attach('images', Buffer.from('fake-image'), { filename: 'unica.png', contentType: 'image/png' });

    const reader = await registerAndLogin(app, prisma, 'leitora@exemplo.com');
    await reader.agent.post('/follow').type('form').send({ targetId: author.userId });
    const feed = await reader.agent.get('/');

    expect(feed.status).toBe(200);
    expect(feed.text).toContain('Post sem foto');
    expect(feed.text).toContain('Post com uma foto');
    expect(feed.text).not.toContain('data-image-carousel');
    expect(feed.text).toContain('src="https://fake-bucket.test/unica.png"');
    expect(feed.text).toContain('max-h-80 w-full object-cover');
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
    await user.agent.post('/posts').type('form').send({ content: 'Post em detalhe', tags: 'azul' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post em detalhe' } });

    await user.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    const res = await user.agent.get(`/posts/${post.id}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Post em detalhe');
    expect(res.text).toContain('aria-pressed="true"');
    expect(res.text).toContain('<span data-like-count>1</span>');
    expect(res.text).toContain('bg-blue-50');
    expect(res.text).toContain('bg-blue-950');
    expect(res.text).toContain('text-red-600');
    expect(res.text).toContain('bg-emerald-100');
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
    await author.agent.post('/posts').type('form').send({ content: 'Post no feed', tags: 'verde' });
    await author.agent.post('/posts').type('form').send({ content: 'Post sem curtida' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post no feed' } });

    const reader = await registerAndLogin(app, prisma, 'leitora@exemplo.com', 'Leitora');
    await reader.agent.post('/follow').type('form').send({ targetId: author.userId });
    await reader.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    const feed = await reader.agent.get('/');

    expect(feed.status).toBe(200);
    expect(feed.text).toContain('aria-pressed="true"');
    expect(feed.text).toContain('<span data-like-count>1</span>');
    expect(feed.text).toContain('aria-pressed="false"');
    expect(feed.text).toContain('bg-blue-50');
    expect(feed.text).toContain('bg-blue-950');
    expect(feed.text).toContain('bg-emerald-100');
    expect(feed.text).toMatch(/aria-pressed="true"[^>]*class="[^"]*text-red-600/);
    expect(feed.text).toMatch(/aria-pressed="false"[^>]*class="[^"]*text-blue-600/);
  });
});

describe('comentários em posts', () => {
  it('cria comentário autenticado e lista comentários sem exigir login', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com', 'Autora');
    await author.agent.post('/posts').type('form').send({ content: 'Post comentável' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post comentável' } });

    const create = await author.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: '  Primeiro comentário  ' });
    const list = await request(app).get(`/posts/${post.id}/comments`).set('Accept', 'application/json');

    expect(create.status).toBe(201);
    expect(create.body.content).toBe('Primeiro comentário');
    expect(create.body.author).toEqual({ id: author.userId, name: 'Autora' });
    expect(create.body.commentCount).toBe(1);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].content).toBe('Primeiro comentário');
  });

  it('rejeita criação sem autenticação, conteúdo vazio e post inexistente', async () => {
    const user = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    await user.agent.post('/posts').type('form').send({ content: 'Post comentável' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post comentável' } });

    const unauthenticated = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário anônimo' });
    const empty = await user.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: '   ' });
    const missingPost = await user.agent
      .post('/posts/999/comments')
      .set('Accept', 'application/json')
      .send({ content: 'Comentário órfão' });

    expect(unauthenticated.status).toBe(302);
    expect(unauthenticated.headers.location).toBe('/login');
    expect(empty.status).toBe(400);
    expect(missingPost.status).toBe(404);
  });

  it('permite apagar apenas o próprio comentário', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com');
    await author.agent.post('/posts').type('form').send({ content: 'Post para comentário' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post para comentário' } });
    const created = await author.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário da autora' });
    const commentId = created.body.id;
    const other = await registerAndLogin(app, prisma, 'outra@exemplo.com');

    const forbidden = await other.agent
      .delete(`/posts/${post.id}/comments/${commentId}`)
      .set('Accept', 'application/json');
    expect(forbidden.status).toBe(403);
    await expect(prisma.comment.findUnique({ where: { id: commentId } })).resolves.not.toBeNull();

    const removed = await author.agent
      .delete(`/posts/${post.id}/comments/${commentId}`)
      .set('Accept', 'application/json');
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ commentCount: 0 });
    await expect(prisma.comment.findUnique({ where: { id: commentId } })).resolves.toBeNull();
  });

  it('renderiza comentários no feed e publica o script do formulário assíncrono', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com', 'Autora');
    await author.agent.post('/posts').type('form').send({ content: 'Post no feed' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post no feed' } });
    const reader = await registerAndLogin(app, prisma, 'leitora@exemplo.com', 'Leitora');
    await reader.agent.post('/follow').type('form').send({ targetId: author.userId });
    await reader.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário visível' });

    const feed = await reader.agent.get('/');
    const script = await request(app).get('/assets/comments.js');

    expect(feed.status).toBe(200);
    expect(feed.text).toContain('Comentário visível');
    expect(feed.text).toContain('data-comment-form');
    expect(script.status).toBe(200);
    expect(script.text).toContain('event.preventDefault()');
  });
});

describe('comentários em posts', () => {
  it('cria comentário autenticado e lista comentários sem exigir login', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com', 'Autora');
    await author.agent.post('/posts').type('form').send({ content: 'Post comentável' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post comentável' } });

    const create = await author.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: '  Primeiro comentário  ' });
    const list = await request(app).get(`/posts/${post.id}/comments`).set('Accept', 'application/json');

    expect(create.status).toBe(201);
    expect(create.body.content).toBe('Primeiro comentário');
    expect(create.body.author).toEqual({ id: author.userId, name: 'Autora' });
    expect(create.body.commentCount).toBe(1);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].content).toBe('Primeiro comentário');
  });

  it('rejeita criação sem autenticação, conteúdo vazio e post inexistente', async () => {
    const user = await registerAndLogin(app, prisma, 'ana@exemplo.com');
    await user.agent.post('/posts').type('form').send({ content: 'Post comentável' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post comentável' } });

    const unauthenticated = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário anônimo' });
    const empty = await user.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: '   ' });
    const missingPost = await user.agent
      .post('/posts/999/comments')
      .set('Accept', 'application/json')
      .send({ content: 'Comentário órfão' });

    expect(unauthenticated.status).toBe(302);
    expect(unauthenticated.headers.location).toBe('/login');
    expect(empty.status).toBe(400);
    expect(missingPost.status).toBe(404);
  });

  it('permite apagar apenas o próprio comentário', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com');
    await author.agent.post('/posts').type('form').send({ content: 'Post para comentário' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post para comentário' } });
    const created = await author.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário da autora' });
    const commentId = created.body.id;
    const other = await registerAndLogin(app, prisma, 'outra@exemplo.com');

    const forbidden = await other.agent
      .delete(`/posts/${post.id}/comments/${commentId}`)
      .set('Accept', 'application/json');
    expect(forbidden.status).toBe(403);
    await expect(prisma.comment.findUnique({ where: { id: commentId } })).resolves.not.toBeNull();

    const removed = await author.agent
      .delete(`/posts/${post.id}/comments/${commentId}`)
      .set('Accept', 'application/json');
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ commentCount: 0 });
    await expect(prisma.comment.findUnique({ where: { id: commentId } })).resolves.toBeNull();
  });

  it('não permite apagar comentário por uma rota de outro post', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com');
    await author.agent.post('/posts').type('form').send({ content: 'Post 1' });
    await author.agent.post('/posts').type('form').send({ content: 'Post 2' });
    const firstPost = await prisma.post.findFirstOrThrow({ where: { content: 'Post 1' } });
    const secondPost = await prisma.post.findFirstOrThrow({ where: { content: 'Post 2' } });
    const created = await author.agent
      .post(`/posts/${firstPost.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário' });

    const response = await author.agent
      .delete(`/posts/${secondPost.id}/comments/${created.body.id}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(404);
    await expect(prisma.comment.findUnique({ where: { id: created.body.id } })).resolves.not.toBeNull();
  });

  it('renderiza comentários no feed e publica o script do formulário assíncrono', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com', 'Autora');
    await author.agent.post('/posts').type('form').send({ content: 'Post no feed' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post no feed' } });
    const reader = await registerAndLogin(app, prisma, 'leitora@exemplo.com', 'Leitora');
    await reader.agent.post('/follow').type('form').send({ targetId: author.userId });
    await reader.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário visível' });

    const feed = await reader.agent.get('/');
    const script = await request(app).get('/assets/comments.js');

    expect(feed.status).toBe(200);
    expect(feed.text).toContain('Comentário visível');
    expect(feed.text).toContain('data-comment-form');
    expect(script.status).toBe(200);
    expect(script.text).toContain('event.preventDefault()');
  });
});

describe('curtidas em comentários', () => {
  it('exige autenticação para curtir e descurtir comentários', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com');
    await author.agent.post('/posts').type('form').send({ content: 'Post comentável' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post comentável' } });
    const created = await author.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário' });
    const commentId = created.body.id;

    const like = await request(app)
      .post(`/posts/${post.id}/comments/${commentId}/like`)
      .set('Accept', 'application/json');
    const unlike = await request(app)
      .delete(`/posts/${post.id}/comments/${commentId}/like`)
      .set('Accept', 'application/json');

    expect(like.status).toBe(302);
    expect(like.headers.location).toBe('/login');
    expect(unlike.status).toBe(302);
    expect(unlike.headers.location).toBe('/login');
  });

  it('alterna sem duplicar curtidas e retorna a contagem atualizada', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com');
    await author.agent.post('/posts').type('form').send({ content: 'Post para comentário' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post para comentário' } });
    const created = await author.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário curtido' });
    const commentId = created.body.id;

    expect(created.body._count).toEqual({ commentLikes: 0 });
    expect(created.body.likedByMe).toBe(false);

    const firstLike = await author.agent
      .post(`/posts/${post.id}/comments/${commentId}/like`)
      .set('Accept', 'application/json');
    expect(firstLike.status).toBe(200);
    expect(firstLike.body).toEqual({ liked: true, likeCount: 1 });
    expect(await prisma.commentLike.count({ where: { commentId } })).toBe(1);

    const repeatedLike = await author.agent
      .post(`/posts/${post.id}/comments/${commentId}/like`)
      .set('Accept', 'application/json');
    expect(repeatedLike.body).toEqual({ liked: true, likeCount: 1 });
    expect(await prisma.commentLike.count({ where: { commentId } })).toBe(1);

    const unlike = await author.agent
      .delete(`/posts/${post.id}/comments/${commentId}/like`)
      .set('Accept', 'application/json');
    expect(unlike.status).toBe(200);
    expect(unlike.body).toEqual({ liked: false, likeCount: 0 });
    expect(await prisma.commentLike.count({ where: { commentId } })).toBe(0);
  });

  it('rejeita ids inválidos, comentários inexistentes e comentários de outro post', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com');
    await author.agent.post('/posts').type('form').send({ content: 'Post 1' });
    await author.agent.post('/posts').type('form').send({ content: 'Post 2' });
    const firstPost = await prisma.post.findFirstOrThrow({ where: { content: 'Post 1' } });
    const secondPost = await prisma.post.findFirstOrThrow({ where: { content: 'Post 2' } });
    const created = await author.agent
      .post(`/posts/${firstPost.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário' });

    const invalidId = await author.agent
      .post(`/posts/${firstPost.id}/comments/invalid/like`)
      .set('Accept', 'application/json');
    const missingComment = await author.agent
      .post(`/posts/${firstPost.id}/comments/999/like`)
      .set('Accept', 'application/json');
    const wrongPost = await author.agent
      .post(`/posts/${secondPost.id}/comments/${created.body.id}/like`)
      .set('Accept', 'application/json');

    expect(invalidId.status).toBe(400);
    expect(missingComment.status).toBe(404);
    expect(wrongPost.status).toBe(404);
  });

  it('mostra contagem e estado da curtida no feed e na página do post', async () => {
    const author = await registerAndLogin(app, prisma, 'autora@exemplo.com');
    await author.agent.post('/posts').type('form').send({ content: 'Post com comentário curtido' });
    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Post com comentário curtido' } });
    const created = await author.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Comentário com curtida' });

    const reader = await registerAndLogin(app, prisma, 'leitora@exemplo.com');
    await reader.agent.post('/follow').type('form').send({ targetId: author.userId });
    await reader.agent
      .post(`/posts/${post.id}/comments/${created.body.id}/like`)
      .set('Accept', 'application/json');

    const feed = await reader.agent.get('/');
    const postPage = await reader.agent.get(`/posts/${post.id}`);
    const likesScript = await request(app).get('/assets/likes.js');
    const commentsScript = await request(app).get('/assets/comments.js');
    const likeMarkup = new RegExp(
      `data-comment-like-button[^>]*data-like-url="/posts/${post.id}/comments/${created.body.id}/like"[^>]*aria-pressed="true"`,
    );

    expect(feed.status).toBe(200);
    expect(feed.text).toContain('Comentário com curtida');
    expect(feed.text).toMatch(likeMarkup);
    expect(postPage.status).toBe(200);
    expect(postPage.text).toMatch(likeMarkup);
    expect(postPage.text).toContain('<span data-like-count>1</span>');
    expect(likesScript.status).toBe(200);
    expect(likesScript.text).toContain("eventRoot.addEventListener('click'");
    expect(commentsScript.status).toBe(200);
    expect(commentsScript.text).toContain("eventRoot.addEventListener('submit'");
    expect(commentsScript.text).toContain("eventRoot.addEventListener('click'");
    expect(commentsScript.text).toContain('likeButton.dataset.likeUrl');
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
