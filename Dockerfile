FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY app/package*.json ./
RUN npm ci --omit=dev
COPY app/ ./
EXPOSE 10000
CMD ["npm", "start"]
