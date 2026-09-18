FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/blocklight/package.json packages/blocklight/package.json
COPY playground/package.json playground/package.json
RUN npm ci
COPY . .
RUN apk add --no-cache curl \
    && curl -fL --retry 3 https://github.com/digitalhen/blocklight/releases/download/nyc-data-2026-09-18/blocklight-nyc-2026-09-18.tar.gz -o /tmp/city.tar.gz \
    && echo 'b773e0d66749de7c72aa6c6ce19fb3385fe86ad0a9fed6ffc2117ac7680425dc  /tmp/city.tar.gz' | sha256sum -c - \
    && tar -xzf /tmp/city.tar.gz -C playground/public/data \
    && rm /tmp/city.tar.gz
RUN npm run build -w blocklight \
    && npm run build -w playground -- --base=/blocklight/

FROM nginx:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/playground/dist /usr/share/nginx/html/blocklight
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
