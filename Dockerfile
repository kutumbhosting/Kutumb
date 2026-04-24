# ---------- Build Stage ----------
FROM node:18 AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy entire project (src + server + data)
COPY . .

# Build Vite frontend
RUN npm run build


# ---------- Production Stage ----------
FROM node:18

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy full project (IMPORTANT: keeps /server intact)
COPY . .

# Copy built frontend from build stage
COPY --from=build /app/dist ./dist

# Ensure data directories exist (your file-based DB)
RUN mkdir -p server/data/events server/data/members

# Expose backend port
EXPOSE 8080

# Start Express backend from /server folder
CMD ["node", "server/index.js"]
