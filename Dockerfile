# One image for both processes (see compose.yaml): the web server runs the
# production Next.js build, the worker runs worker/index.ts through tsx.
# Secrets are not baked in: .env.local is read by compose at runtime.

FROM node:26-slim

ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p /app/data && chown -R node:node /app
WORKDIR /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .
RUN npm run build

ENV DB_PATH=/app/data/whathappend.db
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
