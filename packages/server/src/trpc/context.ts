import { jwtVerify } from 'jose';

export interface User {
  id: string;
  username: string;
}

export interface Context {
  user: User | null;
  [key: string]: unknown;
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'clover-book-dev-secret'
);

export async function createContext(req: Request): Promise<Context> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null };
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      user: {
        id: payload.sub as string,
        username: payload.username as string,
      },
    };
  } catch {
    return { user: null };
  }
}

export { JWT_SECRET };
