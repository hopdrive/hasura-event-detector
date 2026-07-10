import { buildToken } from './lib/token.js';

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const consolePassword = process.env.CONSOLE_PASSWORD;
  if (!consolePassword) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let password: string;
  try {
    const body = await req.json();
    password = body.password;
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!password || typeof password !== 'string') {
    return Response.json({ error: 'Password required' }, { status: 400 });
  }

  const { timingSafeEqual } = await import('node:crypto');
  const a = Buffer.from(password);
  const b = Buffer.from(consolePassword);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: 'Invalid password' }, { status: 401 });
  }

  const secret = process.env.AUTH_TOKEN_SECRET || consolePassword;
  const token = buildToken(secret);

  return Response.json({ token });
};

export const config = {
  path: '/api/auth',
};
