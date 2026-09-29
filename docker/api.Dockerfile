FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
WORKDIR /repo
COPY . .
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN pnpm install --frozen-lockfile --filter "@shelf/api..."
RUN pnpm --filter @shelf/shared build && pnpm --filter @shelf/api build

FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/prisma apps/api/prisma
RUN chown -R node:node /repo
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
CMD ["sh", "-c", "/repo/node_modules/.bin/prisma migrate deploy && node dist/main.js"]
