import { createPrismaClient } from './db.js';
import { createServer } from './server.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3004;
const prisma = createPrismaClient();
const app = createServer(prisma);

app.listen(PORT, () => {
  console.log(`Rede social Poppin rodando em http://localhost:${PORT}`);
});
