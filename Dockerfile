# ---------- Build Stage ----------
FROM node:18 AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build


# ---------- Production Stage ----------
FROM node:18

WORKDIR /app

# install only backend deps
COPY package*.json ./
RUN npm install --omit=dev

# copy backend + frontend build
COPY . .
COPY --from=build /app/dist ./dist

# ensure folders exist
RUN mkdir -p server/data/events server/data/members

# IMPORTANT: Northflank uses PORT env
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
