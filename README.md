# Viaduct

Viaduct monitors WhatsApp chats and periodically generates AI summaries and todo items using Google Gemini. It is multi-user: each user gets an isolated WhatsApp session and SQLite database. Authentication is handled by TinyAuth via Caddy forward-auth.

## Architecture

Three containers:

| Container | Image | Role |
|---|---|---|
| `caddy` | `caddy:alpine` | Reverse proxy. Performs forward-auth against TinyAuth and injects `Remote-User` header into requests to the app. |
| `auth` | `ghcr.io/steveiliop56/tinyauth:v5` | Login UI and forward-auth endpoint. |
| `app` | Built from repo | Hono backend + React frontend. Trusts the `Remote-User` header set by Caddy. |

In production, a Cloudflare Tunnel sits in front of Caddy. No ports are exposed on the host.

## Local Deployment

In local dev, Caddy and TinyAuth are skipped. The backend falls back to a hardcoded user (`local`) when no `Remote-User` header is present.

**Prerequisites:** Bun, Docker (only needed if you want to run the full stack locally)

**Steps:**

1. Clone the repo and install dependencies:
   ```sh
   git clone <repo-url>
   cd viaduct
   bun install
   ```

2. Copy the backend env file and fill in the required values:
   ```sh
   cp apps/backend/.env.example apps/backend/.env
   ```
   At minimum, set `GEMINI_API_KEY`.

3. Start the dev server:
   ```sh
   bun run dev
   ```

4. Open `http://localhost:3000/app/` in your browser.

The backend runs on port `3000`, the frontend dev server on port `5173` (proxies `/api` to the backend).

> **Warning:** The `DEFAULT_USER` fallback means there is no authentication in local dev. Do not expose this to the internet without Caddy and TinyAuth in front.

## Production Deployment (Cloudflare Tunnel)

**Prerequisites:**

- Docker and Docker Compose
- A Cloudflare Tunnel configured with two public hostnames, both pointing to `http://caddy:80`:
  - `viaduct.yourdomain.com`
  - `auth.viaduct.yourdomain.com`
- The `cloudflared` container must be on the same Docker network as the other services (add it to the compose file or attach it to the default network created by Docker Compose)

**Steps:**

1. Clone the repo:
   ```sh
   git clone <repo-url>
   cd viaduct
   ```

2. Update `Caddyfile` with your actual domains if they differ from `viaduct.brewww.net` and `auth.viaduct.brewww.net`.

3. Generate a TinyAuth user hash:
   ```sh
   docker run -it --rm ghcr.io/steveiliop56/tinyauth:v5 user create --interactive
   ```
   The command prints a `username:hash` string. Dollar signs in bcrypt hashes must be doubled (`$$`) when placed in `.env.tinyauth`.

4. Create `.env.tinyauth`:
   ```sh
   cp .env.tinyauth.example .env.tinyauth
   ```
   Fill in:
   - `TINYAUTH_APPURL` — public URL of TinyAuth (e.g. `https://auth.viaduct.yourdomain.com`)
   - `TINYAUTH_AUTH_USERS` — the `username:$$hash` string from step 3

5. Fill in `apps/backend/.env`:
   - `GEMINI_API_KEY` — required
   - `TINYAUTH_URL` — public URL of TinyAuth (same as `TINYAUTH_APPURL`, used for the logout redirect in the frontend)
   - Adjust `SUMMARY_LOCALE` and other settings as needed

6. Build and start:
   ```sh
   docker compose up --build -d
   ```

7. Open `https://viaduct.yourdomain.com` — you will be redirected to TinyAuth to log in.

## Configuration Reference

### `apps/backend/.env`

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | **Required.** Google Gemini API key. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model to use for summarization. |
| `PORT` | `3000` | Port the backend listens on. |
| `DATA_DIR` | `./data` | Directory for SQLite databases. Overridden to `/data` in the Docker container. |
| `TINYAUTH_URL` | _(empty)_ | Public URL of TinyAuth. Used by the frontend to build the logout redirect URL. Leave empty for local dev. |
| `DEFAULT_USER` | `local` | Fallback username when no `Remote-User` header is present. Only used in local dev without Caddy. |
| `QUIET_PERIOD_MINUTES` | `30` | Minutes of inactivity in a chat before summarization is triggered. Can be overridden per-user in the app settings UI. |
| `SUMMARY_LOCALE` | `tr-TR` | BCP-47 locale tag for AI-generated summaries and todos (e.g. `en-US`, `tr-TR`). Global — applies to all users. |

### `.env.tinyauth`

| Variable | Default | Description |
|---|---|---|
| `TINYAUTH_UI_TITLE` | `Viaduct` | Title shown on the TinyAuth login page. |
| `TINYAUTH_APPURL` | — | **Required.** Public URL of TinyAuth. Used to build login redirects and scope the session cookie. |
| `TINYAUTH_AUTH_USERS` | — | **Required.** Comma-separated list of `username:$$bcrypt_hash` pairs. Dollar signs must be doubled. |
| `TINYAUTH_AUTH_SECURECOOKIE` | `true` | Set to `true` when TLS is terminated upstream (Cloudflare). Set to `false` for plain HTTP local setups. |

## Limitations

- **Single Gemini model per deployment.** `GEMINI_MODEL` is a global setting — there is no per-user model selection.
- **Single summary language per deployment.** `SUMMARY_LOCALE` is global. All users receive summaries in the same language regardless of their own preference.
- **TinyAuth requires its own subdomain.** TinyAuth is a React SPA that assumes it lives at `/`. It cannot be served at a subpath (e.g. `/auth`).
- **Unofficial WhatsApp client.** Viaduct uses the [Baileys](https://github.com/whiskeysockets/baileys) library, which reverse-engineers the WhatsApp Web protocol. It may break without warning on WhatsApp updates and is not officially supported by Meta.
- **SQLite only.** Each user's data is stored in a separate SQLite file. This is not suitable for high-concurrency scenarios or distributed deployments across multiple hosts.
- **No per-chat quiet period.** The quiet period before summarization fires is configurable per-user via the settings UI, but not per-chat — all watched chats for a user share the same value.
- **No authentication in local dev.** The `DEFAULT_USER` fallback bypasses all auth. Any request to the backend is treated as the same user. Do not run the local dev setup on a network-accessible interface.
