# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# On boot: wait for the backend, run the automated suite (logs pass/fail),
# then serve dashboard.html for manual QA. See server.js.
CMD ["node", "server.js"]
