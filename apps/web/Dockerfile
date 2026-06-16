FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --include=dev

FROM deps AS build
COPY tsconfig.base.json tsconfig.base.json
COPY apps/web apps/web
RUN npm run build -w @birdloud/web

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
