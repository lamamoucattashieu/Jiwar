# Pinned base image; the app runs as the unprivileged "node" user.
FROM node:24.11.1-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install exact versions from the lockfile first so this layer is cached.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy only the application source (no COPY . ., no tests, no .env).
COPY src ./src
COPY migrations ./migrations

USER node
EXPOSE 8000
CMD ["node", "src/server.js"]
