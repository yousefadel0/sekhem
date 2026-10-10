// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Protect authenticated routes (root workspace / and legacy /admin/*).
 * Uses the HttpOnly `sekhem_session` cookie as a lightweight hint.
 * Actual authentication/authorization is performed by the backend on API calls.
 */
function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the single production login page, API proxy, and static assets.
  if (pathname.startsWith('/login') || pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Protect root workspace and /admin paths.
  if (pathname === '/' || pathname.startsWith('/admin')) {
    const sessionCookie = request.cookies.get('sekhem_session');
    // If no session cookie, redirect to login preserving the original destination.
    if (!sessionCookie) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', request.nextUrl.pathname);
      return withNoStore(NextResponse.redirect(loginUrl));
    }
    // Cookie exists: allow request to continue; backend will validate on protected API calls.
    return withNoStore(NextResponse.next());
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*'],
};
