export type AuthRoleDto = "Admin" | "PM" | "Technical Reviewer" | "Security Reviewer" | "Viewer";

export interface LoginRequestDto {
  email?: string;
  password?: string;
}

export interface AuthSessionUserDto {
  id: string;
  email: string;
  displayName: string;
  role: AuthRoleDto;
  organizationId?: string;
  sessionId?: string;
}

export interface AuthSessionDto {
  authenticated: boolean;
  user: AuthSessionUserDto;
  expiresAt: string;
}

export interface SessionClaims {
  sub: string;
  sessionId: string;
  email: string;
  displayName: string;
  role: AuthRoleDto;
  organizationId?: string;
  iat?: number;
  exp: number;
}

export interface LogoutDto {
  authenticated: false;
  loggedOut: true;
}
