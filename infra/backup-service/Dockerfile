# Official image via AWS ECR Public mirror — avoids Docker Hub pull limits.
FROM public.ecr.aws/docker/library/node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client tar gzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
