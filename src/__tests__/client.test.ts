import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('backend client', () => {
  it('reports not_configured when VITE_API_URL is unset', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const { api } = await import('../services/api/client');
    await expect(api.health()).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('maps network failure to unreachable and structured errors to codes', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    const { api } = await import('../services/api/client');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.sources()).rejects.toMatchObject({ code: 'unreachable' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'google-routes', error: 'not_configured', message: 'x' }), { status: 503 })));
    await expect(api.estimate('a', 'google-routes')).rejects.toMatchObject({ code: 'not_configured', status: 503 });
  });

  it('rejects a backend response that contains SIMULATED data', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    const { api } = await import('../services/api/client');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ sources: [{ kind: 'SIMULATED' }] }), { status: 200 })));
    await expect(api.sources()).rejects.toMatchObject({ code: 'simulated_in_real_data' });
  });
});
