FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "index.mjs"]
