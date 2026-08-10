# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Copy the static site + server
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
