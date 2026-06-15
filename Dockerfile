# Multi-stage Vite build → nginx serve
# Stage 1: Build Vite production assets
FROM node:22-alpine AS build
WORKDIR /app

# Cache deps layer: chỉ rebuild khi package*.json đổi
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: nginx serve static + proxy /api /graphql tới cep-netcore
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
