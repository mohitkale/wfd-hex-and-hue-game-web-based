# Production image: builds the static site, serves it with nginx on port 8080 (unprivileged).
#   docker build --build-arg SITE_URL=https://play.example.com -t hexhue .
#   docker run -p 8080:8080 hexhue
# See docs/DEPLOY.md.

FROM node:24-alpine AS build
WORKDIR /app
# Dependencies first, so source edits don't reinstall them.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/game/package.json packages/game/
COPY tools/package.json tools/
RUN npm ci --no-audit --no-fund
COPY . .
# Public settings are baked into the static build.
ARG SITE_URL
ARG PUBLIC_REWARDS=none
ARG PUBLIC_POSTHOG_KEY=
ARG PUBLIC_POSTHOG_HOST=
ENV SITE_URL=$SITE_URL \
    PUBLIC_REWARDS=$PUBLIC_REWARDS \
    PUBLIC_POSTHOG_KEY=$PUBLIC_POSTHOG_KEY \
    PUBLIC_POSTHOG_HOST=$PUBLIC_POSTHOG_HOST \
    NODE_ENV=production
RUN npm run build -w @hexhue/web && npm run budget

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
