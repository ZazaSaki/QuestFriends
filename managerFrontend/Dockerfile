# Stage 1: Build the React application
FROM node:20-alpine AS build
WORKDIR /app

# Backend URLs baked into the static build (Vite inlines VITE_* at build time).
# Empty default = SAME-ORIGIN: the app calls /api and /socket.io on its own host
# and nginx reverse-proxies them (works locally and behind one Cloudflare tunnel).
# Only set these to an absolute URL if the backend lives on a different origin.
ARG VITE_API_URL=
ARG VITE_SOCKET_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

COPY package*.json ./
# React 19 peer ranges across the UI libs need legacy peer resolution.
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Serve the built assets with Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
