# Reverse proxy

With `--mode proxy` your own proxy terminates HTTPS and forwards **one host**
to Motio's Caddy, which splits the paths. Whatever the proxy, it must:

- forward everything for your domain to Motio (`http://127.0.0.1:8088`, or
  `http://motio:80` on a shared Docker network);
- keep the `Host` header and send `X-Forwarded-For` and `X-Forwarded-Proto`
  (Caddy inside Motio trusts them from private addresses);
- let WebSockets through: live updates use them;
- accept uploads of at least 50 MB.

## Nginx Proxy Manager

*Hosts → Proxy Hosts → Add*: domain `planner.example.com`, scheme `http`,
**Websockets support** on, then request a certificate on the SSL tab. Forward
hostname and port:

| NPM runs… | Forward to | Motio installed with |
|---|---|---|
| in Docker, sharing a network with Motio | `motio`, port `80` | `--proxy-network npm_backend` |
| directly on the host | `127.0.0.1`, port `8088` | `--http-port 8088` |
| in Docker, without a shared network | the host's IP as seen from the NPM container, e.g. `172.17.0.1`, port `8088` | `--http-port 8088`, then `MOTIO_HTTP_BIND=172.17.0.1:8088` in `.env` and `install.sh up` |

## Traefik

File provider:

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

## Your own routing, without Caddy

If you would rather route the paths yourself, these are the public routes
([`infra/caddy/Caddyfile.selfhost`](https://github.com/eleron96/motio/blob/main/infra/caddy/Caddyfile.selfhost)
is the authoritative list):

| Paths | Upstream service : port |
|---|---|
| `/realms*`, `/resources*`, `/admin*`, `/js*`, `/.well-known*` | `keycloak:8080` |
| `/health`, `/auth/v1*`, `/rest/v1*`, `/realtime/v1*` (WebSocket), `/storage/v1*`, `/functions/v1*`, `/backup*` | `gateway:8080` |
| `/`, `/app*`, `/demo*`, `/invite*`, `/privacy*`, `/terms*`, `/auth*`, `/assets*`, `/branding*`, `/favicon*`, `/logo.png`, `/og-image.png`, `/sw.js`, `/manifest.json`, `/pwa-icon-*.png`, `/apple-touch-icon.png`, `/placeholder.svg`, `/robots.txt`, `/sitemap.xml` | `web:80` |
| everything else | `oauth2-proxy:4180` |

> [!WARNING]
> The order matters: `/auth/v1*` must come before `/auth*`. Copying the Caddyfile
> is easier than keeping your own routes in step with new releases.
