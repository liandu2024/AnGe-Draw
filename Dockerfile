# Stage 1: Build Frontend
FROM node:20 AS frontend-build
WORKDIR /app
COPY . .
# Install monorepo dependencies and build the app
RUN yarn install --network-timeout 600000
RUN yarn build:app:docker

# Stage 2: Final Image (Backend + Compiled Frontend)
FROM node:20-alpine
WORKDIR /app

# Copy the backend files and install dependencies
COPY server/package.json server/yarn.lock ./server/
WORKDIR /app/server
# We might not have a yarn.lock in the server dir specifically, 
# but yarn install will generate one or use package.json
RUN yarn install --production

# Map the backend source code
COPY server/ ./
# Copy built frontend
COPY --from=frontend-build /app/excalidraw-app/build /app/excalidraw-app/build

EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "index.js"]
