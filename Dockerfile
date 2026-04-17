# ---------- Build Stage ----------
FROM node:18 AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

# Build the Vite app
RUN npm run build


# ---------- Production Stage ----------
FROM node:18

WORKDIR /app

# Install lightweight static server
RUN npm install -g serve

# Copy built files from build stage
COPY --from=build /app/dist ./dist

# Expose port (Northflank expects this)
EXPOSE 8080

# Start server
CMD ["serve", "-s", "dist", "-l", "8080"]
