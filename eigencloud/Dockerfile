FROM --platform=linux/amd64 node:18
USER root
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY src ./src

CMD ["npm", "start"]
