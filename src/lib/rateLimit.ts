import { NextRequest } from 'next/server';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// In-memory sliding-window bucket store
interface Bucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, Bucket>();

/**
 * Clean up expired entries every 2 minutes
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateLimitStore.entries()) {
      if (now > bucket.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 2 * 60 * 1000).unref?.();
}

/**
 * Extract true client IP safely from NextRequest headers
 */
export function getClientIp(req: NextRequest | Request): string {
  const headers = req.headers;
  
  // Cloudflare Connecting IP
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  // Standard X-Real-IP
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // Standard X-Forwarded-For (take the first client IP in the chain)
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  return '127.0.0.1';
}

/**
 * Generic Rate Limiter with sliding window
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || now > existing.resetAt) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, config.maxRequests - 1),
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  if (existing.count >= config.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, config.maxRequests - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: 0,
  };
}

/**
 * ----------------------------------------------------
 * 1. DONATION STATUS SEARCH RATE LIMITER
 * ----------------------------------------------------
 * - 'ids' query: 30 requests / 1 min (normal polling after donation)
 * - 'search' query (phone or transaction ref): 5 requests / 5 mins (protects against scraping & PII harvesting)
 */
export function checkDonationStatusRateLimit(ip: string, queryType: 'ids' | 'search'): RateLimitResult {
  if (queryType === 'search') {
    return checkRateLimit(`status_search:${ip}`, {
      windowMs: 5 * 60 * 1000, // 5 minutes
      maxRequests: 5,           // Strict limit: 5 searches per 5 mins
    });
  }

  return checkRateLimit(`status_ids:${ip}`, {
    windowMs: 60 * 1000,        // 1 minute
    maxRequests: 30,            // Normal status polling
  });
}

/**
 * ----------------------------------------------------
 * 2. ADMIN LOGIN RATE LIMITER
 * ----------------------------------------------------
 * Maximum 5 failed login attempts per 15 minutes per IP or email.
 * If exceeded, locked out for 15 minutes.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;

export function checkAdminLoginRateLimit(ip: string, email?: string): RateLimitResult {
  const ipResult = checkRateLimit(`login_ip:${ip}`, {
    windowMs: LOGIN_WINDOW_MS,
    maxRequests: MAX_LOGIN_ATTEMPTS,
  });

  if (!ipResult.allowed) {
    return ipResult;
  }

  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    const emailResult = checkRateLimit(`login_email:${cleanEmail}`, {
      windowMs: LOGIN_WINDOW_MS,
      maxRequests: MAX_LOGIN_ATTEMPTS,
    });

    if (!emailResult.allowed) {
      return emailResult;
    }
  }

  return ipResult;
}

/**
 * Reset failed login counters upon successful authentication
 */
export function resetAdminLoginRateLimit(ip: string, email?: string) {
  rateLimitStore.delete(`login_ip:${ip}`);
  if (email) {
    rateLimitStore.delete(`login_email:${email.trim().toLowerCase()}`);
  }
}
