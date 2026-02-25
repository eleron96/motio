#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Please install Docker Desktop." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

run_node() {
  if command -v node >/dev/null 2>&1; then
    node - <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(process.cwd(), '.env');
  const defaultValues = {
    POSTGRES_PASSWORD: 'postgres',
    POSTGRES_USER: 'postgres',
    POSTGRES_DB: 'postgres',
    SITE_URL: 'http://localhost:5173',
    URI_ALLOW_LIST: 'http://localhost:5173/*',
    API_EXTERNAL_URL: 'http://localhost:8080/auth/v1',
    APP_URL: 'http://localhost:5173',
    GOTRUE_SMTP_HOST: 'smtp.example.com',
    GOTRUE_SMTP_PORT: '587',
    GOTRUE_SMTP_USER: 'no-reply@example.com',
    GOTRUE_SMTP_PASS: '',
    GOTRUE_SMTP_ADMIN_EMAIL: 'no-reply@example.com',
    GOTRUE_SMTP_SENDER_NAME: 'Motio',
    GOTRUE_EXTERNAL_KEYCLOAK_ENABLED: 'true',
    GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID: 'timeline-supabase',
    GOTRUE_EXTERNAL_KEYCLOAK_SECRET: 'timeline-supabase-local-dev-secret',
    GOTRUE_EXTERNAL_KEYCLOAK_URL: 'http://keycloak:8080/realms/timeline',
    GOTRUE_EXTERNAL_KEYCLOAK_SCOPE: 'openid profile email',
    GOTRUE_EXTERNAL_KEYCLOAK_SCOPES: 'openid profile email',
    GOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI: 'http://localhost:8080/auth/v1/callback',
    KEYCLOAK_ADMIN: 'admin',
    KEYCLOAK_ADMIN_PASSWORD: 'admin',
    KEYCLOAK_DB_NAME: 'keycloak',
    KEYCLOAK_DB_USER: 'keycloak',
    KEYCLOAK_DB_PASSWORD: 'keycloak',
    OAUTH2_PROXY_SKIP_OIDC_DISCOVERY: 'true',
    OAUTH2_PROXY_OIDC_ISSUER_URL: 'http://localhost:8081/realms/timeline',
    OAUTH2_PROXY_LOGIN_URL: 'http://localhost:8081/realms/timeline/protocol/openid-connect/auth',
    OAUTH2_PROXY_REDEEM_URL: 'http://keycloak:8080/realms/timeline/protocol/openid-connect/token',
    OAUTH2_PROXY_PROFILE_URL: 'http://keycloak:8080/realms/timeline/protocol/openid-connect/userinfo',
    OAUTH2_PROXY_OIDC_JWKS_URL: 'http://keycloak:8080/realms/timeline/protocol/openid-connect/certs',
    OAUTH2_PROXY_CLIENT_ID: 'timeline-supabase',
    OAUTH2_PROXY_CLIENT_SECRET: 'timeline-supabase-local-dev-secret',
    OAUTH2_PROXY_REDIRECT_URL: 'http://localhost:5173/oauth2/callback',
    OAUTH2_PROXY_SCOPE: 'openid profile email',
    OAUTH2_PROXY_EMAIL_DOMAINS: '*',
    OAUTH2_PROXY_COOKIE_SECRET: '',
    OAUTH2_PROXY_COOKIE_SECURE: 'false',
    OAUTH2_PROXY_COOKIE_SAMESITE: 'lax',
    RESERVE_ADMIN_EMAIL: '',
    RESERVE_ADMIN_PASSWORD: '',
    VITE_RESERVE_ADMIN_EMAIL: '',
    VITE_AUTH_MODE: 'keycloak',
    VITE_OAUTH2_PROXY_ENABLED: 'true',
    VITE_OAUTH2_PROXY_SIGN_OUT_PATH: '/oauth2/sign_out',
    PGRST_DB_URI: 'postgresql://postgres:postgres@db:5432/postgres',
    GOTRUE_DB_DATABASE_URL: 'postgresql://postgres:postgres@db:5432/postgres?search_path=auth',
    SUPABASE_DB_URL: 'postgresql://postgres:postgres@db:5432/postgres',
    SUPABASE_INTERNAL_URL: 'http://gateway:8080',
    AUTO_PRE_MIGRATION_BACKUP: 'true',
    LIQUIBASE_LOG_LEVEL: 'info',
    MIGRATION_MAX_WAIT_SECONDS: '300',
    TASK_MEDIA_MAX_FILE_BYTES: '5242880',
    TASK_MEDIA_USER_QUOTA_BYTES: '209715200',
    TASK_MEDIA_WORKSPACE_QUOTA_BYTES: '2147483648',
    VITE_SUPABASE_URL: 'http://localhost:8080',
    VITE_SUPABASE_ANON_KEY: '',
  };
const ensureCompose = () => {
  if (fs.existsSync(envPath)) {
    return false;
  }
  const base64url = (input) => Buffer.from(input).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sign = (data, secret) => {
    return crypto.createHmac('sha256', secret).update(data).digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const createJwt = (payload, secret) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  };

  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 365 * 10;

  const anonKey = createJwt({ role: 'anon', iss: 'supabase', iat: now, exp }, jwtSecret);
  const serviceRoleKey = createJwt({ role: 'service_role', iss: 'supabase', iat: now, exp }, jwtSecret);

  const env = `POSTGRES_PASSWORD=${defaultValues.POSTGRES_PASSWORD}\nPOSTGRES_USER=${defaultValues.POSTGRES_USER}\nPOSTGRES_DB=${defaultValues.POSTGRES_DB}\n\nJWT_SECRET=${jwtSecret}\nANON_KEY=${anonKey}\nSERVICE_ROLE_KEY=${serviceRoleKey}\n\nSITE_URL=${defaultValues.SITE_URL}\nURI_ALLOW_LIST=${defaultValues.URI_ALLOW_LIST}\nAPI_EXTERNAL_URL=${defaultValues.API_EXTERNAL_URL}\nAPP_URL=${defaultValues.APP_URL}\nGOTRUE_SMTP_HOST=${defaultValues.GOTRUE_SMTP_HOST}\nGOTRUE_SMTP_PORT=${defaultValues.GOTRUE_SMTP_PORT}\nGOTRUE_SMTP_USER=${defaultValues.GOTRUE_SMTP_USER}\nGOTRUE_SMTP_PASS=${defaultValues.GOTRUE_SMTP_PASS}\nGOTRUE_SMTP_ADMIN_EMAIL=${defaultValues.GOTRUE_SMTP_ADMIN_EMAIL}\nGOTRUE_SMTP_SENDER_NAME=${defaultValues.GOTRUE_SMTP_SENDER_NAME}\nGOTRUE_EXTERNAL_KEYCLOAK_ENABLED=${defaultValues.GOTRUE_EXTERNAL_KEYCLOAK_ENABLED}\nGOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID=${defaultValues.GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID}\nGOTRUE_EXTERNAL_KEYCLOAK_SECRET=${defaultValues.GOTRUE_EXTERNAL_KEYCLOAK_SECRET}\nGOTRUE_EXTERNAL_KEYCLOAK_URL=${defaultValues.GOTRUE_EXTERNAL_KEYCLOAK_URL}\nGOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI=${defaultValues.GOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI}\nKEYCLOAK_ADMIN=${defaultValues.KEYCLOAK_ADMIN}\nKEYCLOAK_ADMIN_PASSWORD=${defaultValues.KEYCLOAK_ADMIN_PASSWORD}\nKEYCLOAK_DB_NAME=${defaultValues.KEYCLOAK_DB_NAME}\nKEYCLOAK_DB_USER=${defaultValues.KEYCLOAK_DB_USER}\nKEYCLOAK_DB_PASSWORD=${defaultValues.KEYCLOAK_DB_PASSWORD}\nRESERVE_ADMIN_EMAIL=${defaultValues.RESERVE_ADMIN_EMAIL}\nRESERVE_ADMIN_PASSWORD=${defaultValues.RESERVE_ADMIN_PASSWORD}\nVITE_RESERVE_ADMIN_EMAIL=${defaultValues.VITE_RESERVE_ADMIN_EMAIL}\nVITE_AUTH_MODE=${defaultValues.VITE_AUTH_MODE}\n\nPGRST_DB_URI=${defaultValues.PGRST_DB_URI}\nGOTRUE_DB_DATABASE_URL=${defaultValues.GOTRUE_DB_DATABASE_URL}\nSUPABASE_DB_URL=${defaultValues.SUPABASE_DB_URL}\nSUPABASE_INTERNAL_URL=${defaultValues.SUPABASE_INTERNAL_URL}\nTASK_MEDIA_MAX_FILE_BYTES=${defaultValues.TASK_MEDIA_MAX_FILE_BYTES}\nTASK_MEDIA_USER_QUOTA_BYTES=${defaultValues.TASK_MEDIA_USER_QUOTA_BYTES}\nTASK_MEDIA_WORKSPACE_QUOTA_BYTES=${defaultValues.TASK_MEDIA_WORKSPACE_QUOTA_BYTES}\nVITE_SUPABASE_URL=${defaultValues.VITE_SUPABASE_URL}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`;

  fs.writeFileSync(envPath, env);
  return true;
};

const created = ensureCompose();
if (created) {
  console.log('Generated .env');
}

const env = fs.readFileSync(envPath, 'utf8');
const entries = Object.fromEntries(env.split('\n')
  .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
  .map((line) => {
    const idx = line.indexOf('=');
    return [line.slice(0, idx), line.slice(idx + 1)];
  }));

let updated = false;
for (const [key, value] of Object.entries(defaultValues)) {
  if (!(key in entries)) {
    entries[key] = value;
    updated = true;
  }
}

const updateLocalDbUser = (key, fromUser, toUser) => {
  const value = entries[key];
  if (!value) {
    return;
  }
  try {
    const url = new URL(value);
    if (url.hostname === 'db' && url.username === fromUser) {
      url.username = toUser;
      entries[key] = url.toString();
      updated = true;
    }
  } catch (_error) {
    // Ignore invalid URIs.
  }
};

const ensureSearchPath = (key, schema) => {
  const value = entries[key];
  if (!value) {
    return;
  }
  try {
    const url = new URL(value);
    if (url.hostname !== 'db') {
      return;
    }
    if (url.searchParams.get('search_path') !== schema) {
      url.searchParams.set('search_path', schema);
      entries[key] = url.toString();
      updated = true;
    }
  } catch (_error) {
    // Ignore invalid URIs.
  }
};

updateLocalDbUser('PGRST_DB_URI', 'authenticator', 'postgres');
updateLocalDbUser('GOTRUE_DB_DATABASE_URL', 'supabase_auth_admin', 'postgres');
ensureSearchPath('GOTRUE_DB_DATABASE_URL', 'auth');

if (!('JWT_SECRET' in entries) || !('ANON_KEY' in entries) || !('SERVICE_ROLE_KEY' in entries)) {
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 365 * 10;
  const base64url = (input) => Buffer.from(input).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const sign = (data, secret) => {
    return crypto.createHmac('sha256', secret).update(data).digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };
  const createJwt = (payload, secret) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  };
  entries.JWT_SECRET = jwtSecret;
  entries.ANON_KEY = createJwt({ role: 'anon', iss: 'supabase', iat: now, exp }, jwtSecret);
  entries.SERVICE_ROLE_KEY = createJwt({ role: 'service_role', iss: 'supabase', iat: now, exp }, jwtSecret);
  updated = true;
}

if (!entries.OAUTH2_PROXY_COOKIE_SECRET) {
  entries.OAUTH2_PROXY_COOKIE_SECRET = crypto.randomBytes(32).toString('base64');
  updated = true;
}

const apiUrl = entries.VITE_SUPABASE_URL || 'http://localhost:8080';
const anonKey = entries.ANON_KEY || '';

if (!anonKey) {
  console.error('ANON_KEY missing in .env');
  process.exit(1);
}

if (entries.VITE_SUPABASE_URL !== apiUrl) {
  entries.VITE_SUPABASE_URL = apiUrl;
  updated = true;
}

if (entries.VITE_SUPABASE_ANON_KEY !== anonKey) {
  entries.VITE_SUPABASE_ANON_KEY = anonKey;
  updated = true;
}

if (entries.RESERVE_ADMIN_EMAIL && entries.VITE_RESERVE_ADMIN_EMAIL !== entries.RESERVE_ADMIN_EMAIL) {
  entries.VITE_RESERVE_ADMIN_EMAIL = entries.RESERVE_ADMIN_EMAIL;
  updated = true;
}

if (updated) {
  const serialized = Object.entries(entries).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  fs.writeFileSync(envPath, serialized);
  console.log('Updated .env with defaults');
}
NODE
  else
    docker run --rm -v "$root_dir":/app -w /app node:20-alpine node - <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(process.cwd(), '.env');
const ensureCompose = () => {
  if (fs.existsSync(envPath)) {
    return false;
  }
  const base64url = (input) => Buffer.from(input).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sign = (data, secret) => {
    return crypto.createHmac('sha256', secret).update(data).digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const createJwt = (payload, secret) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  };

  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 365 * 10;

  const anonKey = createJwt({ role: 'anon', iss: 'supabase', iat: now, exp }, jwtSecret);
  const serviceRoleKey = createJwt({ role: 'service_role', iss: 'supabase', iat: now, exp }, jwtSecret);

  const env = `POSTGRES_PASSWORD=postgres\nPOSTGRES_USER=postgres\nPOSTGRES_DB=postgres\n\nJWT_SECRET=${jwtSecret}\nANON_KEY=${anonKey}\nSERVICE_ROLE_KEY=${serviceRoleKey}\n\nSITE_URL=http://localhost:5173\nURI_ALLOW_LIST=http://localhost:5173/*\nAPI_EXTERNAL_URL=http://localhost:8080/auth/v1\nAPP_URL=http://localhost:5173\nGOTRUE_SMTP_HOST=smtp.example.com\nGOTRUE_SMTP_PORT=587\nGOTRUE_SMTP_USER=no-reply@example.com\nGOTRUE_SMTP_PASS=\nGOTRUE_SMTP_ADMIN_EMAIL=no-reply@example.com\nGOTRUE_SMTP_SENDER_NAME=Motio\nGOTRUE_EXTERNAL_KEYCLOAK_ENABLED=true\nGOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID=timeline-supabase\nGOTRUE_EXTERNAL_KEYCLOAK_SECRET=timeline-supabase-local-dev-secret\nGOTRUE_EXTERNAL_KEYCLOAK_URL=http://keycloak:8080/realms/timeline\nGOTRUE_EXTERNAL_KEYCLOAK_SCOPE=openid profile email\nGOTRUE_EXTERNAL_KEYCLOAK_SCOPES=openid profile email\nGOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI=http://localhost:8080/auth/v1/callback\nKEYCLOAK_ADMIN=admin\nKEYCLOAK_ADMIN_PASSWORD=admin\nKEYCLOAK_DB_NAME=keycloak\nKEYCLOAK_DB_USER=keycloak\nKEYCLOAK_DB_PASSWORD=keycloak\nRESERVE_ADMIN_EMAIL=\nRESERVE_ADMIN_PASSWORD=\nVITE_RESERVE_ADMIN_EMAIL=\nVITE_AUTH_MODE=keycloak\n\nPGRST_DB_URI=postgresql://postgres:postgres@db:5432/postgres\nGOTRUE_DB_DATABASE_URL=postgresql://postgres:postgres@db:5432/postgres?search_path=auth\nSUPABASE_DB_URL=postgresql://postgres:postgres@db:5432/postgres\nSUPABASE_INTERNAL_URL=http://gateway:8080\nTASK_MEDIA_MAX_FILE_BYTES=5242880\nTASK_MEDIA_USER_QUOTA_BYTES=209715200\nTASK_MEDIA_WORKSPACE_QUOTA_BYTES=2147483648\nVITE_SUPABASE_URL=http://localhost:8080\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`;

  fs.writeFileSync(envPath, env);
  return true;
};

const created = ensureCompose();
if (created) {
  console.log('Generated .env');
}

const env = fs.readFileSync(envPath, 'utf8');
const entries = Object.fromEntries(env.split('\n')
  .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
  .map((line) => {
    const idx = line.indexOf('=');
    return [line.slice(0, idx), line.slice(idx + 1)];
  }));

  const defaultValues = {
    POSTGRES_PASSWORD: 'postgres',
    POSTGRES_USER: 'postgres',
    POSTGRES_DB: 'postgres',
    SITE_URL: 'http://localhost:5173',
    URI_ALLOW_LIST: 'http://localhost:5173/*',
    API_EXTERNAL_URL: 'http://localhost:8080/auth/v1',
    APP_URL: 'http://localhost:5173',
    GOTRUE_SMTP_HOST: 'smtp.example.com',
    GOTRUE_SMTP_PORT: '587',
    GOTRUE_SMTP_USER: 'no-reply@example.com',
    GOTRUE_SMTP_PASS: '',
    GOTRUE_SMTP_ADMIN_EMAIL: 'no-reply@example.com',
    GOTRUE_SMTP_SENDER_NAME: 'Motio',
    GOTRUE_EXTERNAL_KEYCLOAK_ENABLED: 'true',
    GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID: 'timeline-supabase',
    GOTRUE_EXTERNAL_KEYCLOAK_SECRET: 'timeline-supabase-local-dev-secret',
    GOTRUE_EXTERNAL_KEYCLOAK_URL: 'http://keycloak:8080/realms/timeline',
    GOTRUE_EXTERNAL_KEYCLOAK_SCOPE: 'openid profile email',
    GOTRUE_EXTERNAL_KEYCLOAK_SCOPES: 'openid profile email',
    KEYCLOAK_ADMIN: 'admin',
    KEYCLOAK_ADMIN_PASSWORD: 'admin',
    KEYCLOAK_DB_NAME: 'keycloak',
    KEYCLOAK_DB_USER: 'keycloak',
    KEYCLOAK_DB_PASSWORD: 'keycloak',
    OAUTH2_PROXY_SKIP_OIDC_DISCOVERY: 'true',
    OAUTH2_PROXY_OIDC_ISSUER_URL: 'http://localhost:8081/realms/timeline',
    OAUTH2_PROXY_LOGIN_URL: 'http://localhost:8081/realms/timeline/protocol/openid-connect/auth',
    OAUTH2_PROXY_REDEEM_URL: 'http://keycloak:8080/realms/timeline/protocol/openid-connect/token',
    OAUTH2_PROXY_PROFILE_URL: 'http://keycloak:8080/realms/timeline/protocol/openid-connect/userinfo',
    OAUTH2_PROXY_OIDC_JWKS_URL: 'http://keycloak:8080/realms/timeline/protocol/openid-connect/certs',
    OAUTH2_PROXY_CLIENT_ID: 'timeline-supabase',
    OAUTH2_PROXY_CLIENT_SECRET: 'timeline-supabase-local-dev-secret',
    OAUTH2_PROXY_REDIRECT_URL: 'http://localhost:5173/oauth2/callback',
    OAUTH2_PROXY_SCOPE: 'openid profile email',
    OAUTH2_PROXY_EMAIL_DOMAINS: '*',
    OAUTH2_PROXY_COOKIE_SECRET: '',
    OAUTH2_PROXY_COOKIE_SECURE: 'false',
    OAUTH2_PROXY_COOKIE_SAMESITE: 'lax',
    RESERVE_ADMIN_EMAIL: '',
    RESERVE_ADMIN_PASSWORD: '',
    VITE_RESERVE_ADMIN_EMAIL: '',
    VITE_AUTH_MODE: 'keycloak',
    VITE_OAUTH2_PROXY_ENABLED: 'true',
    VITE_OAUTH2_PROXY_SIGN_OUT_PATH: '/oauth2/sign_out',
    PGRST_DB_URI: 'postgresql://postgres:postgres@db:5432/postgres',
    GOTRUE_DB_DATABASE_URL: 'postgresql://postgres:postgres@db:5432/postgres?search_path=auth',
    SUPABASE_DB_URL: 'postgresql://postgres:postgres@db:5432/postgres',
    SUPABASE_INTERNAL_URL: 'http://gateway:8080',
    AUTO_PRE_MIGRATION_BACKUP: 'true',
    LIQUIBASE_LOG_LEVEL: 'info',
    MIGRATION_MAX_WAIT_SECONDS: '300',
    TASK_MEDIA_MAX_FILE_BYTES: '5242880',
    TASK_MEDIA_USER_QUOTA_BYTES: '209715200',
    TASK_MEDIA_WORKSPACE_QUOTA_BYTES: '2147483648',
    VITE_SUPABASE_URL: 'http://localhost:8080',
    VITE_SUPABASE_ANON_KEY: '',
  };

let updated = false;
for (const [key, value] of Object.entries(defaultValues)) {
  if (!(key in entries)) {
    entries[key] = value;
    updated = true;
  }
}

const updateLocalDbUser = (key, fromUser, toUser) => {
  const value = entries[key];
  if (!value) {
    return;
  }
  try {
    const url = new URL(value);
    if (url.hostname === 'db' && url.username === fromUser) {
      url.username = toUser;
      entries[key] = url.toString();
      updated = true;
    }
  } catch (_error) {
    // Ignore invalid URIs.
  }
};

  updateLocalDbUser('PGRST_DB_URI', 'authenticator', 'postgres');
  updateLocalDbUser('GOTRUE_DB_DATABASE_URL', 'supabase_auth_admin', 'postgres');

  const ensureSearchPath = (key, schema) => {
    const value = entries[key];
    if (!value) {
      return;
    }
    try {
      const url = new URL(value);
      if (url.hostname !== 'db') {
        return;
      }
      if (url.searchParams.get('search_path') !== schema) {
        url.searchParams.set('search_path', schema);
        entries[key] = url.toString();
        updated = true;
      }
    } catch (_error) {
      // Ignore invalid URIs.
    }
  };

  ensureSearchPath('GOTRUE_DB_DATABASE_URL', 'auth');

if (!('JWT_SECRET' in entries) || !('ANON_KEY' in entries) || !('SERVICE_ROLE_KEY' in entries)) {
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 365 * 10;
  const base64url = (input) => Buffer.from(input).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const sign = (data, secret) => {
    return crypto.createHmac('sha256', secret).update(data).digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };
  const createJwt = (payload, secret) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  };
  entries.JWT_SECRET = jwtSecret;
  entries.ANON_KEY = createJwt({ role: 'anon', iss: 'supabase', iat: now, exp }, jwtSecret);
  entries.SERVICE_ROLE_KEY = createJwt({ role: 'service_role', iss: 'supabase', iat: now, exp }, jwtSecret);
  updated = true;
}

if (!entries.OAUTH2_PROXY_COOKIE_SECRET) {
  entries.OAUTH2_PROXY_COOKIE_SECRET = crypto.randomBytes(32).toString('base64');
  updated = true;
}

const apiUrl = entries.VITE_SUPABASE_URL || 'http://localhost:8080';
const anonKey = entries.ANON_KEY || '';

if (!anonKey) {
  console.error('ANON_KEY missing in .env');
  process.exit(1);
}

if (entries.VITE_SUPABASE_URL !== apiUrl) {
  entries.VITE_SUPABASE_URL = apiUrl;
  updated = true;
}

if (entries.VITE_SUPABASE_ANON_KEY !== anonKey) {
  entries.VITE_SUPABASE_ANON_KEY = anonKey;
  updated = true;
}

if (entries.RESERVE_ADMIN_EMAIL && entries.VITE_RESERVE_ADMIN_EMAIL !== entries.RESERVE_ADMIN_EMAIL) {
  entries.VITE_RESERVE_ADMIN_EMAIL = entries.RESERVE_ADMIN_EMAIL;
  updated = true;
}

if (updated) {
  const serialized = Object.entries(entries).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  fs.writeFileSync(envPath, serialized);
  console.log('Updated .env with defaults');
}
NODE
  fi
}

run_node

export COMPOSE_MENU=0
compose_file="infra/docker-compose.yml"
env_file=".env"

docker compose -f "$compose_file" --env-file "$env_file" up -d db

get_env_value() {
  local key="$1"
  local line
  line=$(grep -E "^${key}=" "$env_file" | head -n1 || true)
  echo "${line#*=}"
}

POSTGRES_USER="$(get_env_value POSTGRES_USER)"
POSTGRES_DB="$(get_env_value POSTGRES_DB)"
POSTGRES_PASSWORD="$(get_env_value POSTGRES_PASSWORD)"

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"

until docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  echo "Waiting for database..."
  sleep 2
done

# Let GoTrue apply its own auth migrations on startup.

docker compose -f "$compose_file" --env-file "$env_file" up -d keycloak-db keycloak auth rest functions gateway
docker compose -f "$compose_file" --env-file "$env_file" restart gateway >/dev/null 2>&1 || true
docker compose -f "$compose_file" --env-file "$env_file" run --rm migrate

if command -v curl >/dev/null 2>&1; then
  bootstrap_url="http://localhost:8080/functions/v1/admin"
  bootstrap_payload='{"action":"bootstrap.sync"}'
  bootstrap_ok=0
  for attempt in {1..20}; do
    status_code=$(curl -sS -o /dev/null -w "%{http_code}" \
      -X POST \
      -H "Content-Type: application/json" \
      -d "$bootstrap_payload" \
      "$bootstrap_url" || true)
    if [[ "$status_code" == "200" ]]; then
      echo "Keycloak sync bootstrap completed (HTTP $status_code)."
      bootstrap_ok=1
      break
    fi
    sleep 2
  done

  if [[ "$bootstrap_ok" -ne 1 ]]; then
    echo "Warning: could not confirm Keycloak sync bootstrap. Check functions logs." >&2
  fi
else
  echo "Warning: curl is not installed, skipping Keycloak sync bootstrap request." >&2
fi

docker compose -f "$compose_file" --env-file "$env_file" up web oauth2-proxy
