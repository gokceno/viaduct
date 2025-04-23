FROM oven/bun:1 AS install

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install

FROM install AS run

WORKDIR /app
COPY . .
COPY --from=install /app/node_modules .

LABEL org.opencontainers.source=https://github.com/gokceno/viaduct/

ENTRYPOINT ["bun"]
