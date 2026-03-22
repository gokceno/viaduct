# Viaduct

Viaduct monitors WhatsApp chats and periodically generates AI summaries and todo items using Google Gemini. It is multi-user: each user gets an isolated WhatsApp session and SQLite database. Authentication is handled by Cloudflare Access.

## Architecture

Single container:

| Container | Image | Role |
|---|---|---|
| `app` | Built from repo | Hono backend + React frontend. Validates Cloudflare Access JWTs and maps the verified email to a user account. |

In production, a Cloudflare Tunnel routes directly to `http://app:3000`. Cloudflare Access sits in front of the tunnel and handles authentication — the app validates the JWT injected by CF Access on every request.

## Local Deployment

In local dev, Cloudflare Access is not present. The backend falls back to a hardcoded user (`local`) when no JWT is present and `CF_TEAM_DOMAIN` is unset.

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
   At minimum, set `GEMINI_API_KEY`. Leave `CF_TEAM_DOMAIN` and `CF_AUD` empty for local dev.

3. Start the dev server:
   ```sh
   bun run dev
   ```

4. Open `http://localhost:3000` in your browser.

The backend runs on port `3000`, the frontend dev server on port `5173` (proxies `/api` to the backend).

> **Warning:** The `DEFAULT_USER` fallback means there is no authentication in local dev. Do not expose this to the internet without Cloudflare Access in front.

## Production Deployment (Cloudflare Tunnel)

**Prerequisites:**

- Docker and Docker Compose
- A Cloudflare Tunnel with a public hostname pointing to `http://app:3000`
  - e.g. `viaduct.yourdomain.com`
- A Cloudflare Access application protecting that hostname
  - The `cloudflared` container must be on the same Docker network as `app` (add it to the compose file or attach it to the default network created by Docker Compose)

**Steps:**

1. Clone the repo:
   ```sh
   git clone <repo-url>
   cd viaduct
   ```

2. Create a Cloudflare Access application:
   - Go to Cloudflare Zero Trust → Access → Applications → Add an application
   - Choose **Self-hosted**, set the domain to `viaduct.yourdomain.com`
   - Note the **AUD tag** (Application Audience) shown on the application page — you will need it for `CF_AUD`

3. Fill in `apps/backend/.env`:
   - `GEMINI_API_KEY` — required
   - `CF_TEAM_DOMAIN` — your Cloudflare Access team domain (e.g. `https://yourteam.cloudflareaccess.com`)
   - `CF_AUD` — the AUD tag from step 2
   - Adjust `SUMMARY_LOCALE` and other settings as needed

4. Build and start:
   ```sh
   docker compose up --build -d
   ```

5. Open `https://viaduct.yourdomain.com` — you will be redirected to Cloudflare Access to log in.

## Configuration Reference

### `apps/backend/.env`

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | **Required.** Google Gemini API key. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model to use for summarization. |
| `PORT` | `3000` | Port the backend listens on. |
| `DATA_DIR` | `./data` | Directory for SQLite databases. Overridden to `/data` in the Docker container. |
| `CF_TEAM_DOMAIN` | _(empty)_ | Your Cloudflare Access team domain (e.g. `https://yourteam.cloudflareaccess.com`). Used to fetch JWKS for JWT validation and to build the logout URL. Leave empty for local dev. |
| `CF_AUD` | _(empty)_ | Cloudflare Access AUD tag for this application. Used to verify the JWT audience claim. Leave empty for local dev. |
| `DEFAULT_USER` | `local` | Fallback username when `CF_TEAM_DOMAIN` is unset (local dev only). |
| `QUIET_PERIOD_MINUTES` | `30` | Minutes of inactivity in a chat before summarization is triggered. Can be overridden per-user in the app settings UI. |
| `SUMMARY_LOCALE` | `tr-TR` | BCP-47 locale tag for AI-generated summaries and todos (e.g. `en-US`, `tr-TR`). Global — applies to all users. |

## Limitations

- **Single Gemini model per deployment.** `GEMINI_MODEL` is a global setting — there is no per-user model selection.
- **Single summary language per deployment.** `SUMMARY_LOCALE` is global. All users receive summaries in the same language regardless of their own preference.
- **Cloudflare Access required for production auth.** There is no built-in login UI. Authentication relies entirely on Cloudflare Access — you must have a Cloudflare account and a configured Access application.
- **Unofficial WhatsApp client.** Viaduct uses the [Baileys](https://github.com/whiskeysockets/baileys) library, which reverse-engineers the WhatsApp Web protocol. It may break without warning on WhatsApp updates and is not officially supported by Meta.
- **SQLite only.** Each user's data is stored in a separate SQLite file. This is not suitable for high-concurrency scenarios or distributed deployments across multiple hosts.
- **No per-chat quiet period.** The quiet period before summarization fires is configurable per-user via the settings UI, but not per-chat — all watched chats for a user share the same value.
- **No authentication in local dev.** The `DEFAULT_USER` fallback bypasses all auth. Any request to the backend is treated as the same user. Do not run the local dev setup on a network-accessible interface.
