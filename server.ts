import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { createApiRouter } from './src/server/apiRouter.ts';
import { defaultStore } from './src/server/store.ts';

dotenv.config();

export function createExpressApp(store = defaultStore) {
  const app = express();

  app.use(express.json({ limit: '512kb' }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'attendly-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API v1
  app.use('/api/v1', createApiRouter(store));

  // Centralized API 404 & Error Handler
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'ENDPOINT_NOT_FOUND',
        message: 'Requested API endpoint does not exist.',
      },
    });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Attendly Server Error]:', err.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected server error occurred.',
      },
    });
  });

  return app;
}

async function startServer() {
  const app = createExpressApp(defaultStore);
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Attendly Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

// Only start HTTP server when executed directly (not imported by unit tests)
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isMain) {
  startServer();
}
