// Process-local abuse containment. Shared storage/WAF is still needed across replicas.
export function securityHeaders(_req, res, next) {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000' });
  next();
}
export function createRateLimiter({ limit = 120, windowMs = 60000, maxKeys = 10000, now = Date.now } = {}) {
  const windows = new Map();
  let lastSweep = 0;
  return (req, res, next) => {
    const time = now();
    if (time - lastSweep >= windowMs || windows.size >= maxKeys) {
      for (const [key, window] of windows) if (time >= window.until) windows.delete(key);
      lastSweep = time;
    }
    // Express controls req.ip via the explicit trust-proxy configuration.
    // Never accept a client-supplied token or raw forwarding header as identity.
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let window = windows.get(key);
    if (!window) {
      if (windows.size >= maxKeys) return res.status(503).set('Retry-After', '60').json({ error: 'Please try again later' });
      window = { count: 0, until: time + windowMs }; windows.set(key, window);
    }
    if (time >= window.until) { window.count = 0; window.until = time + windowMs; }
    if (++window.count > limit) return res.status(429).set('Retry-After', String(Math.max(1, Math.ceil((window.until - time) / 1000))))
      .json({ error: 'Too many requests' });
    next();
  };
}
export function trustedProxyHops(value) {
  if (value == null || value === '0') return false;
  if (!/^[12]$/.test(value)) throw new Error('Invalid JAMI_TRUST_PROXY_HOPS');
  return Number(value);
}
