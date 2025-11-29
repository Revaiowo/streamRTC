# Deployment Guide — stream_rtc

This project contains a Next.js frontend (`.`) and a Node/Express + Socket.IO signaling server (`server/`). They can be deployed independently.

## Environment variables

- Frontend (Next.js)

  - `NEXT_PUBLIC_SOCKET_URL` — URL to the signaling server (e.g. `https://signaling.example.com`)
  - Place in `.env.production` or set in your hosting provider's environment settings.

- Server (`server/.env`)
  - `PORT` — port to listen on (default `8000`)
  - `HOST` — interface to bind (use `0.0.0.0` to accept external connections)
  - `ALLOWED_ORIGIN` — CORS origin for socket connections (e.g. `https://your-frontend.com` or `*`)

## Local testing (network phones)

1. Ensure both machines (phone and dev PC) are on the same WiFi.
2. Set `NEXT_PUBLIC_SOCKET_URL` in `.env.local` to `http://<YOUR_PC_IP>:8000`.
3. Start the server:

```powershell
cd server
npm install
npm run dev
```

4. Start Next.js (make it listen on all interfaces):

```powershell
cd ..
npm install
npm run dev -- --hostname 0.0.0.0
```

5. Open `http://<YOUR_PC_IP>:3000` on your phone.

## Production deployment notes

- Serve the Next.js app behind HTTPS (Vercel, Netlify, Cloudflare Pages, or a server with TLS).
- The signaling server must be reachable via the URL configured in `NEXT_PUBLIC_SOCKET_URL`. When using HTTPS on the frontend, signaling must use `wss://`/HTTPS as well.
- Configure `ALLOWED_ORIGIN` to your frontend origin to avoid opening your signaling endpoint to everyone.

## Docker hints

- You can dockerize the server and frontend separately and set the env vars at container run time.

## Troubleshooting

- `getUserMedia` requires a secure context (HTTPS) on non-localhost origins. For cross-device testing, either use `localhost` (on device using tunneling) or run HTTPS locally with a self-signed cert.
- If camera/mic prompts do not appear on mobile, check browser permissions and that you're using HTTPS (or a trusted local IP in development with appropriate flags).
