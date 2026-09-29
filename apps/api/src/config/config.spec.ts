import { loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgresql://x',
  JWT_SECRET: 'secret',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'key',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(base);
    expect(config.port).toBe(4000);
    expect(config.jwtExpiresInSeconds).toBe(86400);
    expect(config.s3).toEqual({
      endpoint: undefined,
      region: 'us-east-1',
      accessKeyId: 'access',
      secretAccessKey: 'key',
      bucket: 'shelf',
      forcePathStyle: true,
    });
    expect(config.corsOrigins).toBe('*');
    expect(config.swaggerEnabled).toBe(true);
  });

  it.each(['DATABASE_URL', 'JWT_SECRET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'])('fails fast without %s', (name) => {
    expect(() => loadConfig({ ...base, [name]: ' ' })).toThrow(name);
  });

  it('reads the optional settings', () => {
    const config = loadConfig({
      ...base,
      PORT: '8080',
      S3_ENDPOINT: 'http://minio:9000',
      S3_FORCE_PATH_STYLE: 'false',
      CORS_ORIGINS: 'https://shelf.vercel.app, http://localhost:3000',
      SWAGGER_ENABLED: 'false',
    });
    expect(config.port).toBe(8080);
    expect(config.s3.endpoint).toBe('http://minio:9000');
    expect(config.s3.forcePathStyle).toBe(false);
    expect(config.corsOrigins).toEqual(['https://shelf.vercel.app', 'http://localhost:3000']);
    expect(config.swaggerEnabled).toBe(false);
  });

  it('rejects a port that is not a number', () => {
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow('PORT');
  });
});
