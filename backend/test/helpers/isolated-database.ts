/** Real persistence tests require an explicitly named, disposable local database. */
export function isolatedDatabaseUrl() {
  const raw = process.env.SEKHEM_TEST_DATABASE_URL;
  if (!raw) throw new Error("Set SEKHEM_TEST_DATABASE_URL to a disposable local sekhem_test_* database.");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/sekhem_test_[a-z0-9_]+$/i.test(url.pathname)) throw new Error("Persistence tests require a local database named sekhem_test_*. Application DATABASE_URL is never used.");
  return raw;
}
