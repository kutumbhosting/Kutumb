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

# install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# copy backend + build output
COPY . .
COPY --from=build /app/dist ./dist

# -----------------------------
# IMPORTANT: ensure runtime data structure exists
# -----------------------------
RUN mkdir -p server/data/events \
    server/data/members \
    server/data

# create default JSON files so fs.readFile never fails
RUN echo "[]" > server/data/upcomingEvents.json
RUN echo "[]" > server/data/members/members.json

# -----------------------------
# ENV
# -----------------------------
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
