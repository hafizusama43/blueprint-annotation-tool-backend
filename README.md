# Blueprint Annotation Backend

Backend for the assignment described in the Full-Stack Lead Developer technical assessment. This service exposes a minimal REST API for managing blueprint metadata, enforces security defaults, and stitches together rate limiting, request tracing, and Prisma-backed persistence.

## Getting started

1. Copy `.env.example` to `.env` and populate the secrets (PostgreSQL URL, JWT secrets, etc.).
2. Install dependencies:
    ```bash
    npm install
    ```
3. Format the tracked files (optional but recommended):
    ```bash
    npm run format
    ```
4. Generate Prisma client + run migrations:
    ```bash
    npm run prisma:generate
    npm run prisma:migrate
    ```
5. Start the development server:
    ```bash
    npm run dev
    ```

The `dev` script launches `ts-node-dev` so changes reload immediately. The compiled artifacts are emitted to `dist/` when running `npm run build`.

## Architecture overview

- **Entry point**: `src/server.ts` bootstraps the Express app using `createApp` and reads port/config from `src/config/env`.
- **Modules**: `src/modules/blueprint` contains controller/service layers that talk to Prisma. The controller validates payloads with `zod` before delegating to `BlueprintService`.
- **Persistence**: Prisma models under `prisma/schema.prisma` describe a `Blueprint` record storing measurement metadata, while `src/config/prisma.ts` reuses a singleton client so development servers stay performant.
- **Middleware stack**:
    - `helmet`, `cors`, and `morgan` for basic security and telemetry,
    - `requestId` attaches a traceable ID to every request,
    - `rateLimit` keeps abusive clients in check,
    - `errorHandler` centralizes Zod/Prisma/custom errors and always returns a structured JSON payload.

## API

| Verb                         | Path | Description                                                                       |
| ---------------------------- | ---- | --------------------------------------------------------------------------------- |
| `GET /api/v1`                |      | Basic health/info endpoint                                                        |
| `GET /api/v1/blueprints`     |      | List all blueprint metadata                                                       |
| `GET /api/v1/blueprints/:id` |      | Load a single blueprint by ID                                                     |
| `POST /api/v1/blueprints`    |      | Create a blueprint (name/type required, optional measurement/unit/label/metadata) |

The controller returns `400` for schema violations and `409`/`404` errors for Prisma issues thanks to the shared error handler.

## Known limitations

- No authentication/authorization yet — any client with network access can read/write blueprint metadata.
- The rate limiter is in-memory and resets with each process restart; for horizontal scaling, replace it with Redis/Cluster.
- The Prisma model is intentionally narrow for the assignment scope; richer canvas data (points, annotations) should live in a dedicated table or object storage.

## Next steps

- Wire this API to the React canvas UI described in the assignment prompt.
- Implement authentication tokens and per-user data isolation.
- Add request/response logging plus structured metrics (e.g., via OpenTelemetry) when needed.
