# Doable

A productivity dashboard with task planning, calendar management, AI assistant support, secure authentication, and persistent database-backed storage.

## Quick start

1. Install Node.js 18+ and npm.
2. Copy `.env.example` to `.env` and set the environment values.
3. Install dependencies:
   npm install
4. Start the app:
   npm start
5. Open http://localhost:3000

## Environment variables

- `PORT`: server port, default `3000`
- `JWT_SECRET`: secret used for authentication tokens
- `OPENAI_API_KEY`: optional API key for secure AI requests
- `OPENAI_MODEL`: optional model name, default `gpt-4o-mini`
- `ALLOWED_ORIGIN`: allowed frontend origin for CORS
- `NODE_ENV`: set to `production` in deployment

## Security notes

- Never commit your `.env` file.
- Keep `JWT_SECRET` unique and long.
- Use HTTPS in production.
- Keep API keys in the backend only.

## Browser notifications

Desktop browser notifications require explicit permission from the browser. If permission is denied, the app still shows in-app reminder toasts so reminders remain useful.

## Deployment readiness

- User accounts and task data are persisted in SQLite.
- Tasks, preferences, and AI history are stored per user.
- The app supports login, registration, secure JWT-based auth, and local fallback for existing device-only usage.
- A backend API is in place for secure deployment behind a reverse proxy or hosting platform.
