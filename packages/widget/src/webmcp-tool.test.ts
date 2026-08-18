import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  defineWebMcpTool,
  getModelContext,
  normalizeWebMcpToolContext,
  registerWebMcpTools,
  type RawWebMcpToolContext,
  type RegisterableModelContext,
  type WebMcpToolContext,
} from './webmcp-tool';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalizeWebMcpToolContext', () => {
  it('passes a native runtime\'s signal through and reports cancellation support', () => {
    const controller = new AbortController();
    const ctx = normalizeWebMcpToolContext({ signal: controller.signal });

    expect(ctx.signal).toBe(controller.signal);
    expect(ctx.capabilities.cancellation).toBe(true);
    // Flattened onto the context too, so `({ cancellation }) => …` destructures.
    expect(ctx.cancellation).toBe(true);

    controller.abort();
    expect(ctx.signal.aborted).toBe(true);
  });

  it('substitutes an inert signal when the runtime provides none', () => {
    const ctx = normalizeWebMcpToolContext({
      requestUserInteraction: async (cb) => cb(),
    });

    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(ctx.signal.aborted).toBe(false);
    expect(ctx.capabilities.cancellation).toBe(false);
  });

  it('mints a fresh inert signal per call so abort listeners cannot accumulate', () => {
    // A shared module-level signal would collect a listener per tool call and
    // never fire them, leaking for the life of the page.
    expect(normalizeWebMcpToolContext().signal).not.toBe(
      normalizeWebMcpToolContext().signal,
    );
  });

  it('treats a non-AbortSignal signal as absent rather than forwarding it', () => {
    const ctx = normalizeWebMcpToolContext({
      signal: { aborted: false } as unknown as AbortSignal,
    });

    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(ctx.capabilities.cancellation).toBe(false);
  });

  it('keeps the polyfill requestUserInteraction when present', async () => {
    const spy = vi.fn(async (cb: () => unknown) => cb());
    const ctx = normalizeWebMcpToolContext({ requestUserInteraction: spy });

    await expect(ctx.requestUserInteraction(() => 'ok')).resolves.toBe('ok');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('substitutes a faithful pass-through where the runtime lacks one', async () => {
    // Matches the polyfill's own implementation, which is just `callback()`.
    const ctx = normalizeWebMcpToolContext({ signal: new AbortController().signal });

    await expect(ctx.requestUserInteraction(() => 'ok')).resolves.toBe('ok');
    await expect(
      ctx.requestUserInteraction(undefined as unknown as () => unknown),
    ).rejects.toThrow(TypeError);
  });
});

describe('defineWebMcpTool', () => {
  const contextFor = async (raw?: RawWebMcpToolContext) => {
    let seen: WebMcpToolContext | undefined;
    const tool = defineWebMcpTool({
      name: 'probe',
      description: 'probe',
      execute: (_args, context) => {
        seen = context;
        return { content: [{ type: 'text' as const, text: 'ok' }] };
      },
    });
    await tool.execute({}, raw as never);
    return seen!;
  };

  it('normalizes a native { signal } context', async () => {
    const controller = new AbortController();
    const ctx = await contextFor({ signal: controller.signal });

    expect(ctx.signal).toBe(controller.signal);
    expect(ctx.capabilities.cancellation).toBe(true);
    expect(typeof ctx.requestUserInteraction).toBe('function');
  });

  it('normalizes a polyfill { requestUserInteraction } context', async () => {
    const ctx = await contextFor({ requestUserInteraction: async (cb) => cb() });

    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(ctx.capabilities.cancellation).toBe(false);
    expect(typeof ctx.requestUserInteraction).toBe('function');
  });

  it('normalizes a legacy single-argument call (Chrome < 153)', async () => {
    const ctx = await contextFor(undefined);

    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(ctx.capabilities.cancellation).toBe(false);
    expect(typeof ctx.requestUserInteraction).toBe('function');
  });

  it('preserves the rest of the descriptor verbatim', () => {
    const tool = defineWebMcpTool({
      name: 'search',
      title: 'Search',
      description: 'search the shop',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
      execute: () => ({ content: [] }),
    });

    expect(tool.name).toBe('search');
    expect(tool.title).toBe('Search');
    expect(tool.inputSchema).toEqual({ type: 'object' });
    expect(tool.annotations).toEqual({ readOnlyHint: true });
  });

  it('propagates the tool result and any throw', async () => {
    const ok = defineWebMcpTool({
      name: 'ok',
      description: 'ok',
      execute: async () => ({ content: [{ type: 'text' as const, text: 'hi' }] }),
    });
    await expect(ok.execute({}, {} as never)).resolves.toEqual({
      content: [{ type: 'text', text: 'hi' }],
    });

    const boom = defineWebMcpTool({
      name: 'boom',
      description: 'boom',
      execute: () => {
        throw new Error('nope');
      },
    });
    expect(() => boom.execute({}, {} as never)).toThrow('nope');
  });
});

describe('getModelContext', () => {
  it('prefers document.modelContext', () => {
    const fromDocument = { registerTool: vi.fn() };
    vi.stubGlobal('document', { modelContext: fromDocument });
    vi.stubGlobal('navigator', { modelContext: { registerTool: vi.fn() } });

    expect(getModelContext()).toBe(fromDocument);
  });

  it('falls back to navigator.modelContext', () => {
    const fromNavigator = { registerTool: vi.fn() };
    vi.stubGlobal('document', {});
    vi.stubGlobal('navigator', { modelContext: fromNavigator });

    expect(getModelContext()).toBe(fromNavigator);
  });

  it('returns undefined when WebMCP is unavailable', () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('navigator', {});

    expect(getModelContext()).toBeUndefined();
  });
});

describe('registerWebMcpTools', () => {
  const tool = (name: string) => ({
    name,
    description: name,
    execute: () => ({ content: [] }),
  });

  it('registers each tool and returns the successes', async () => {
    const registerTool = vi.fn();
    const modelContext: RegisterableModelContext = { registerTool };

    const registered = await registerWebMcpTools([tool('a'), tool('b')], {
      modelContext,
    });

    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(registered.map((t) => t.name)).toEqual(['a', 'b']);
  });

  it('forwards the lifetime signal so aborting unregisters the batch', async () => {
    const registerTool = vi.fn();
    const controller = new AbortController();

    await registerWebMcpTools([tool('a')], {
      modelContext: { registerTool },
      signal: controller.signal,
    });

    expect(registerTool).toHaveBeenCalledWith(expect.anything(), {
      signal: controller.signal,
    });
  });

  it('routes a promise REJECTION to onError, not just a synchronous throw', async () => {
    // The case a plain try/catch around registerTool() misses: `registerTool`
    // is async in both the spec and the polyfill, and rejects on an
    // already-aborted signal.
    const onError = vi.fn();
    const registerTool = vi.fn(async (t: { name: string }) => {
      if (t.name === 'rejects') throw new Error('already aborted');
    });

    const registered = await registerWebMcpTools(
      [tool('ok'), tool('rejects')],
      { modelContext: { registerTool } as RegisterableModelContext, onError },
    );

    expect(registered.map((t) => t.name)).toEqual(['ok']);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBe('rejects');
  });

  it('routes a synchronous throw to onError and keeps going', async () => {
    const onError = vi.fn();
    const registerTool = vi.fn((t: { name: string }) => {
      if (t.name === 'throws') throw new Error('bad descriptor');
    });

    const registered = await registerWebMcpTools(
      [tool('throws'), tool('ok')],
      { modelContext: { registerTool } as RegisterableModelContext, onError },
    );

    expect(registered.map((t) => t.name)).toEqual(['ok']);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBe('throws');
  });

  it('registers the NORMALIZED tool, not the original descriptor', async () => {
    let seen: WebMcpToolContext | undefined;
    let registeredExecute:
      | ((args: unknown, ctx: unknown) => unknown)
      | undefined;
    const registerTool = vi.fn((t: { execute: typeof registeredExecute }) => {
      registeredExecute = t.execute;
    });

    await registerWebMcpTools(
      [
        {
          name: 'probe',
          description: 'probe',
          execute: (_args, context) => {
            seen = context;
            return { content: [] };
          },
        },
      ],
      { modelContext: { registerTool } as unknown as RegisterableModelContext },
    );

    // Call it the way a legacy runtime would: one argument, no context.
    await registeredExecute!({}, undefined);
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    expect(seen?.capabilities.cancellation).toBe(false);
  });

  it('no-ops when WebMCP is unavailable', async () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('navigator', {});

    await expect(registerWebMcpTools([tool('a')])).resolves.toEqual([]);
  });
});
