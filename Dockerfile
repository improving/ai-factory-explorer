# The AI Factory Explorer is one static file (vite-plugin-singlefile), so the
# image is the build output behind nginx. The build reads the operator documents
# of the repository (content/plugin.ts), so the context is the repository root.
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html
EXPOSE 8080
