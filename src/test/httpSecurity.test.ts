import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter, securityHeaders, trustedProxyHops } from '../../server/http-security.js';
function response() { const res = { status: vi.fn(), set: vi.fn(), json: vi.fn() }; for (const f of Object.values(res)) f.mockReturnValue(res); return res; }
describe('HTTP containment', () => {
  it('sets basic protection headers without exposing secrets', () => {
    const res = response(), next = vi.fn(); securityHeaders({}, res, next);
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' })); expect(next).toHaveBeenCalledOnce();
  });
  it('bounds requests, ignores untrusted forwarding values and recovers next window', () => {
    let time = 0; const limit = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time });
    const res = response(), next = vi.fn();
    for (const spoof of ['a','b','c']) limit({ ip: 'proxy', headers: { 'x-forwarded-for': spoof } }, res, next);
    expect(next).toHaveBeenCalledTimes(2); expect(res.status).toHaveBeenCalledWith(429); expect(res.set).toHaveBeenCalledWith('Retry-After', '1');
    time = 1000; limit({ ip: 'proxy' }, res, next); expect(next).toHaveBeenCalledTimes(3);
  });
  it('fails closed when the bounded key store is full and removes expired keys', () => {
    let time = 0; const limit = createRateLimiter({ maxKeys: 1, windowMs: 1000, now: () => time });
    const res = response(), next = vi.fn(); limit({ ip: 'a' }, res, next); limit({ ip: 'b' }, res, next);
    expect(res.status).toHaveBeenCalledWith(503); time = 1000; limit({ ip: 'b' }, res, next); expect(next).toHaveBeenCalledTimes(2);
  });
  it('trusts no proxy by default and rejects arbitrary hop configurations', () => {
    expect(trustedProxyHops(undefined)).toBe(false); expect(trustedProxyHops('1')).toBe(1);
    for (const value of ['true', 'all', '3', '-1', '']) expect(() => trustedProxyHops(value)).toThrow();
  });
});
