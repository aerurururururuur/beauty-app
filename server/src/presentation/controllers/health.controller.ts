/**
 * presentation/controllers/health.controller.ts —— 存活探针。
 */
import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => ({
    ok: true,
    name: '@beauty-app/server',
    uptimeSec: Math.round(process.uptime()),
    now: new Date().toISOString(),
  }));
}
