# syntax=docker/dockerfile:1
FROM node:20-alpine

# Prisma's engines need OpenSSL (and libc6-compat) on Alpine/musl; without
# these the schema engine fails to start ("failed to detect libssl").
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate the client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the application source
COPY . .

EXPOSE 3000

# `npm start` runs `prisma generate` + `prisma db push` against the live DB,
# then boots the server.
CMD ["npm", "start"]
