import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';

export async function registerAndLogin(app: Express, prisma: PrismaClient, email: string, name = 'Usuária de teste') {
  const agent = request.agent(app);
  await agent.post('/register').type('form').send({ name, email, password: 'senha123' });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { agent, userId: user.id };
}
