# Blueprint Annotation Canvas - Backend

Backend service for the technical assignment.  
This API handles blueprint ingestion, processing, and persistence for calibration + measurement annotations.

## Setup Instructions

### Prerequisites
- Node.js 20+
- PostgreSQL running and reachable
- Cloudflare R2 bucket configured

### Environment
Create `.env` with the required values used by `src/config/env.ts` (database URL, app config, and R2 credentials/public URL).

### Run (assignment quick start)
```bash
npm install && npm run dev
```

This starts the backend in watch mode via `ts-node-dev`.

### First-time database setup (only once per new DB)
```bash
npm run prisma:generate
npm run prisma:migrate
```

## Brief Architecture Overview

### Module Structure
- `src/modules/blueprint`: upload finalization, processing status, retry flow, and cleanup.
- `src/modules/calibration`: scale calibration persistence (`pixelsPerUnit`, unit, reference metadata).
- `src/modules/shape`: shape metadata persistence (`LINE`, `POLYLINE`, `POLYGON`, label, measurement/unit, style).
- `src/modules/shapePoint`: ordered point persistence for geometry vertices.

### Layering
- **Routes** define endpoints and mount controller handlers.
- **Controllers** validate requests (Zod) and map HTTP concerns to service calls.
- **Services** handle Prisma persistence + Cloudflare R2 operations.
- **Processor** runs async file workflows:
  - PDF -> per-page PNG + thumbnail generation -> R2 upload
  - Image -> normalized page + thumbnail -> R2 upload

### Data/State Management Decisions
For backend state management, the decision was to keep server state persistence-first in PostgreSQL (via Prisma) and treat processing as a finite state machine:
- `PENDING` -> `PROCESSING` -> `READY` or `FAILED`

This gives deterministic status polling for the frontend and keeps business state centralized in DB instead of in-memory process state.  
Transient job work (temp files, conversion artifacts) is intentionally short-lived and cleaned up after processing.

## Core API Surface

- `GET /api/v1/blueprints`
- `GET /api/v1/blueprints/:id`
- `GET /api/v1/blueprints/:id/status`
- `POST /api/v1/blueprints/presigned-upload-url`
- `POST /api/v1/blueprints/upload`
- `PUT /api/v1/blueprints/:id/process`
- `DELETE /api/v1/blueprints/:id`
- `GET /api/v1/calibrations`, `POST /api/v1/calibrations`
- `GET /api/v1/shapes`, `POST /api/v1/shapes`
- `GET /api/v1/shape-points`, `POST /api/v1/shape-points`

## Known Limitations and Trade-offs

- No auth/authorization yet; endpoints are not user-isolated.
- Processing currently runs in-process (`setImmediate`) rather than a durable external queue.
- Shape/calibration APIs currently focus on create/read; full update/delete/bulk edit flows are limited.
- Measurement correctness is trusted from the client side; server-side recalculation/verification is minimal.
- In-memory rate limiting is simple and fast for assignment scope, but not ideal for multi-instance scaling.
- Large-file processing is optimized for practical use, but advanced observability (metrics/tracing) is still pending.

## Scripts

- `npm run dev` - run backend in development mode
- `npm run build` - compile TypeScript to `dist`
- `npm run start` - run compiled build
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate` - run DB migrations
- `npm run prisma:studio` - open Prisma Studio
