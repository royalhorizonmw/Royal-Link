# Royal Link OS — production image
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Migration + first-manager scripts and what they need
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.mjs /app/scripts/create-manager.mjs ./scripts/
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps /app/node_modules/bcryptjs ./node_modules/bcryptjs
USER app
EXPOSE 3000
# Apply any new migrations, then start
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
