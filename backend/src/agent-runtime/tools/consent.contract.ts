/** Shared identity only. This contract carries no authorization implementation. */
export interface ConsentSession { id: string; issuedAt: number; expiresAt: number }
export interface TaskConsentReference { policyId: string; generation: number; digest: string; expiresAt: string; consentedBy: string; scope?: "SESSION"; session?: ConsentSession }
