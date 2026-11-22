import session, { type SessionOptions } from 'express-session';

export function createSessionMiddleware(): ReturnType<typeof session> {
  const options: SessionOptions = {
    secret: process.env.SESSION_SECRET ?? 'aula05-segredo-de-desenvolvimento',
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  };
  return session(options);
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}
