# Обратный прокси

В режиме `--mode proxy` ваш прокси завершает HTTPS и пересылает **один хост** на
Caddy в составе Motio, а тот разводит пути. Каким бы ни был прокси, он должен:

- пересылать всё для вашего домена в Motio (`http://127.0.0.1:8088` или
  `http://motio:80` в общей сети Docker);
- сохранять заголовок `Host` и передавать `X-Forwarded-For` и `X-Forwarded-Proto`
  (Caddy внутри Motio доверяет им с частных адресов);
- пропускать WebSocket: на них работают живые обновления;
- принимать загрузки размером не меньше 50 МБ.

## Nginx Proxy Manager

*Hosts → Proxy Hosts → Add*: домен `planner.example.com`, схема `http`,
**Websockets support** включить, затем запросить сертификат на вкладке SSL. Куда
пересылать:

| NPM работает… | Пересылать на | Motio установлен с |
|---|---|---|
| в Docker, в одной сети с Motio | `motio`, порт `80` | `--proxy-network npm_backend` |
| прямо на хосте | `127.0.0.1`, порт `8088` | `--http-port 8088` |
| в Docker, без общей сети | IP хоста, каким его видит контейнер NPM, например `172.17.0.1`, порт `8088` | `--http-port 8088`, затем `MOTIO_HTTP_BIND=172.17.0.1:8088` в `.env` и `install.sh up` |

## Traefik

Файловый провайдер:

```yaml
http:
  routers:
    motio:
      rule: Host(`planner.example.com`)
      entryPoints: [websecure]
      service: motio
      tls:
        certResolver: letsencrypt
  services:
    motio:
      loadBalancer:
        servers:
          - url: http://127.0.0.1:8088
```

## nginx

```nginx
server {
  listen 443 ssl http2;
  server_name planner.example.com;
  # ssl_certificate …; ssl_certificate_key …;
  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:8088;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
  }
}
```

## Своя маршрутизация, без Caddy

Если вы хотите разводить пути сами, вот публичные маршруты (точный список — в
[`infra/caddy/Caddyfile.selfhost`](https://github.com/eleron96/motio/blob/main/infra/caddy/Caddyfile.selfhost)):

| Пути | Сервис : порт |
|---|---|
| `/realms*`, `/resources*`, `/admin*`, `/js*`, `/.well-known*` | `keycloak:8080` |
| `/health`, `/auth/v1*`, `/rest/v1*`, `/realtime/v1*` (WebSocket), `/storage/v1*`, `/functions/v1*`, `/backup*` | `gateway:8080` |
| `/`, `/app*`, `/demo*`, `/invite*`, `/privacy*`, `/terms*`, `/auth*`, `/assets*`, `/branding*`, `/favicon*`, `/logo.png`, `/og-image.png`, `/sw.js`, `/manifest.json`, `/pwa-icon-*.png`, `/apple-touch-icon.png`, `/placeholder.svg`, `/robots.txt`, `/sitemap.xml` | `web:80` |
| всё остальное | `oauth2-proxy:4180` |

> [!WARNING]
> Порядок важен: `/auth/v1*` должен стоять раньше, чем `/auth*`. Скопировать
> Caddyfile проще, чем поддерживать свои маршруты в ногу с новыми релизами.
