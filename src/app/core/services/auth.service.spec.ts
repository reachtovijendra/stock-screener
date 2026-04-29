import { createSupabaseAuthLock } from './auth.service';

describe('createSupabaseAuthLock', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  it('skips immediate lock attempts when another tab holds the auth lock', async () => {
    const request = jasmine.createSpy('request').and.callFake(async (
      _name: string,
      _options: LockOptions,
      callback: LockGrantedCallback,
    ) => callback(null));

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { locks: { request } },
    });

    const lock = createSupabaseAuthLock();
    const fn = jasmine.createSpy('fn').and.resolveTo('refreshed');

    const result = await lock('lock:stockscreen-auth', 0, fn);

    expect(result).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs auth work when the browser lock is available', async () => {
    const request = jasmine.createSpy('request').and.callFake(async (
      name: string,
      _options: LockOptions,
      callback: LockGrantedCallback,
    ) => callback({ name, mode: 'exclusive' } as Lock));

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { locks: { request } },
    });

    const lock = createSupabaseAuthLock();
    const result = await lock('lock:stockscreen-auth', 0, async () => 'refreshed');

    expect(result).toBe('refreshed');
  });
});
