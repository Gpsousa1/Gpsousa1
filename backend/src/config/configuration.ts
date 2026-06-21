/**
 * Centralised, typed configuration namespaces consumed across the app.
 * Values are read from already-validated environment variables.
 */
export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '900s',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  },
});
