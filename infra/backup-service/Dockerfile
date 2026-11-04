# Official image via AWS ECR Public mirror — avoids Docker Hub pull limits.
FROM public.ecr.aws/docker/library/node:24-bookworm-slim

# pg_dump must be at least as new as the server (PostgreSQL 17): the client
# comes from the PostgreSQL apt repository, Debian's own is version 15.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tar gzip age \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && apt-get purge -y curl && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
