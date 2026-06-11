import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@clover-book/server/trpc';

export const trpc = createTRPCReact<AppRouter>();

export function getBaseUrl() {
  return '';
}

export function getTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/trpc`,
        transformer: superjson,
        headers() {
          const token = localStorage.getItem('accessToken');
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
