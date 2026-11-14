FROM node:22-alpine
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV PORT=4000 DATA_FILE=/data/safepair-data.json
VOLUME /data
EXPOSE 4000
CMD ["node", "src/index.js"]
