# Nube del almacén (apps/cloud) para Fly.io. Se construye desde la raíz del monorepo:
#   pnpm deploy:cloud
# Etapa 1: compila apps/cloud en un solo archivo (dist/main.mjs) con esbuild.
FROM node:22.23.4-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @almacen/cloud... \
 && pnpm --filter @almacen/cloud build

# Etapa 2: solo Node, el archivo compilado y las migraciones.
FROM node:22.23.4-slim
WORKDIR /app
ENV NODE_ENV=production \
    CLOUD_HOST=0.0.0.0 \
    PORT=8080 \
    CLOUD_MIGRACIONES=/app/drizzle
COPY --from=build /repo/apps/cloud/dist/main.mjs ./main.mjs
COPY --from=build /repo/apps/cloud/drizzle ./drizzle
USER node
EXPOSE 8080
CMD ["node", "main.mjs"]
