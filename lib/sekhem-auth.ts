import { fetchSekhemApi, postSekhemApi } from "@/lib/sekhem-api"

export type SekhemAuthSession = {
  authenticated: true
  user: {
    id: string
    email: string
    displayName: string
    role: "Admin" | "PM" | "Technical Reviewer" | "Security Reviewer" | "Viewer"
  }
  expiresAt: string
}

type LoginFlowResult =
  | { authenticated: true; message: "" }
  | { authenticated: false; message: "Email and password are required." | "Invalid credentials" }

export async function authenticateSekhemSession(email: string, password: string): Promise<SekhemAuthSession | null> {
  const normalizedEmail = email.trim()
  if (!normalizedEmail || !password) return null

  const login = await postSekhemApi<SekhemAuthSession, { email: string; password: string }>("/auth/login", {
    email: normalizedEmail,
    password,
  })
  if (!login?.authenticated) return null

  for (let i = 0; i < 3; i++) {
    const session = await fetchSekhemApi<SekhemAuthSession>("/auth/session")
    if (session?.authenticated) {
      return session
    }
    if (i < 2) {
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, i)))
    }
  }
  return null
}

export async function runSekhemLoginFlow(
  email: string,
  password: string,
  onAuthenticated: () => void,
  authenticate: (email: string, password: string) => Promise<SekhemAuthSession | null> = authenticateSekhemSession,
): Promise<LoginFlowResult> {
  if (!email.trim() || !password) {
    return { authenticated: false, message: "Email and password are required." }
  }

  const session = await authenticate(email, password)
  if (!session?.authenticated) {
    return { authenticated: false, message: "Invalid credentials" }
  }

  onAuthenticated()
  return { authenticated: true, message: "" }
}

export async function logoutSekhemSession(): Promise<boolean> {
  const result = await postSekhemApi<{ authenticated: false; loggedOut: true }, Record<string, never>>(
    "/auth/logout",
    {},
  )
  return result?.authenticated === false && result.loggedOut === true
}
