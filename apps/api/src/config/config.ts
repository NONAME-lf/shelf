export const APP_CONFIG = Symbol('APP_CONFIG');

export type AppConfig = {
  port: number;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  s3: {
    endpoint: string | undefined;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    forcePathStyle: boolean;
  };
  corsOrigins: string[] | '*';
  swaggerEnabled: boolean;
};

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Environment variable ${name} is required`);
  return value;
}

function optional(env: Env, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

function integer(env: Env, name: string, fallback: number): number {
  const raw = optional(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Environment variable ${name} must be a positive integer`);
  return value;
}

export function loadConfig(env: Env = process.env): AppConfig {
  required(env, 'DATABASE_URL'); // read by Prisma itself; checked here so a missing value fails at start-up
  const cors = optional(env, 'CORS_ORIGINS') ?? '*';
  return {
    port: integer(env, 'PORT', 4000),
    jwtSecret: required(env, 'JWT_SECRET'),
    jwtExpiresInSeconds: integer(env, 'JWT_EXPIRES_IN_SECONDS', 86400),
    s3: {
      endpoint: optional(env, 'S3_ENDPOINT'),
      region: optional(env, 'S3_REGION') ?? 'us-east-1',
      accessKeyId: required(env, 'S3_ACCESS_KEY'),
      secretAccessKey: required(env, 'S3_SECRET_KEY'),
      bucket: optional(env, 'S3_BUCKET') ?? 'shelf',
      forcePathStyle: optional(env, 'S3_FORCE_PATH_STYLE') !== 'false',
    },
    corsOrigins: cors === '*' ? '*' : cors.split(',').map((origin) => origin.trim()).filter(Boolean),
    swaggerEnabled: optional(env, 'SWAGGER_ENABLED') !== 'false',
  };
}
