import { defineConfig, loadEnv, type Plugin } from 'vite';

/*
 * On Vercel, each file in api/ runs as a serverless function. `npm run dev` has no such thing,
 * so this plugin runs the same files inside the Vite dev server. With no database settings in
 * .env.local, the leaderboard then keeps everything in memory (see server/store.ts).
 */
function devApi(): Plugin {
  return {
    name: 'wonder-lens-dev-api',
    apply: 'serve',
    configureServer(server) {
      // let the functions read keys from .env.local, as they would on Vercel
      for (const [k, v] of Object.entries(loadEnv('development', process.cwd(), ''))) process.env[k] ??= v;

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        if (!url.pathname.startsWith('/api/')) return next();
        const name = url.pathname.slice('/api/'.length);
        try {
          if (name === 'photo') {
            const { memoryPhoto } = await server.ssrLoadModule('/server/store.ts');
            const jpeg = memoryPhoto(url.searchParams.get('id') ?? '');
            res.statusCode = jpeg ? 200 : 404;
            res.setHeader('content-type', 'image/jpeg');
            return res.end(jpeg ? Buffer.from(jpeg) : undefined);
          }
          if (!/^[a-z]+$/.test(name)) { res.statusCode = 404; return res.end(); }
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const handler = mod[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) { res.statusCode = 405; return res.end(); }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const request = new Request(url, {
            method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error('[dev api]', err);
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
  };
}

export default defineConfig({ plugins: [devApi()] });
