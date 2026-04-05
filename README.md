# Blueprint Annotation Tool Backend

Production-oriented backend for the blueprint annotation platform.

This service handles:
- custom auth with access/refresh sessions
- personal and organization workspace onboarding
- org, team, project, collaborator, subscription, and payment management
- blueprint upload and processing lifecycle tracking
- measurement resources like calibrations, shapes, and shape points
- Redis-backed cache helpers
- SQS-based worker orchestration and Stripe billing integration points

## Overview
The backend is built with:
- Node.js + TypeScript
- Express
- Prisma + PostgreSQL
- Cloudflare R2 / S3-compatible object storage
- Redis via `ioredis`
- AWS SQS for queued blueprint processing
- Stripe for billing

The API base path is:

```text
http://localhost:8000/api/v1
```

## Current Backend Structure

### Main modules
- `src/modules/auth`
  Handles register, login, refresh, logout, password reset/change, email verification, invitation acceptance, session management, and onboarding.

- `src/modules/admin`
  Super-admin-only endpoints for platform-wide visibility across users, orgs, teams, projects, subscriptions, payments, blueprints, and audit logs.

- `src/modules/organization`
  Organization CRUD, membership management, and org-level collaboration controls.

- `src/modules/team`
  Team CRUD and team membership management inside organizations.

- `src/modules/project`
  Project CRUD, project archiving, and project collaborator management.

- `src/modules/subscription`
  Billing plans, organization subscriptions, payment records, Stripe checkout session creation, and Stripe webhook mapping.

- `src/modules/blueprint`
  Blueprint CRUD, upload finalization, processing status, retry/requeue flow, page persistence, and processing state updates.

- `src/modules/calibration`
  Calibration CRUD for scale/reference data on blueprint pages.

- `src/modules/shape`
  Shape CRUD for annotation metadata like label, measurement, unit, and styles.

- `src/modules/shapePoint`
  Shape point CRUD for ordered geometry points belonging to shapes.

### Shared services
- `src/services/cache`
  Centralized Redis client, cache helpers, and module-based cache keys.

- `src/services/queue`
  SQS client and queue helpers for blueprint processing jobs.

- `src/services/permissions`
  Shared permission and access checks for org/project/blueprint resources.

- `src/services/billing`
  Stripe client wrapper.

- `src/services/ai`
  AI service integration used by worker processing.

- `src/services/audit`
  Audit logging for admin and sensitive actions.

### Core app files
- `src/app.ts`
  Express app setup and route mounting.

- `src/server.ts`
  API server entrypoint.

- `src/worker.ts`
  Worker process entrypoint for queue polling and blueprint job execution.

- `prisma/schema.prisma`
  Full database schema for auth, tenancy, collaboration, billing, and processing state.

## Architectural Notes

### Multi-tenant model
The backend follows this general hierarchy:

```text
User -> Organization -> Team -> Project -> Blueprint -> BlueprintPage
```

Collaboration is enforced through:
- `OrganizationMember`
- `TeamMember`
- `ProjectCollaborator`
- shared permission checks in `src/services/permissions`

### Processing model
Blueprint processing is queue-driven in code:
- API creates or updates the blueprint row
- API enqueues a job to SQS
- worker polls the queue
- worker renders/uploads pages in batches
- worker updates progress fields incrementally
- worker optionally enriches page data through the AI service

### Cache model
Redis is not the source of truth.

Postgres remains authoritative, while Redis is used for hot reads and cache invalidation patterns such as:
- `user:{id}`
- `org:{id}`
- `project:{id}`
- `blueprint:{id}`
- `blueprint:status:{id}`
- `subscription:org:{id}`

## What You Need To Run Locally

### Required
- Node.js 20+
- PostgreSQL
- Cloudflare R2 bucket or compatible S3 object storage

### Required for full production-style local flow
- Redis
- AWS SQS queue
- AI service reachable from `AI_SERVICE_URL`
- Stripe test account / test keys

### Optional depending on what you are testing
- If you only want to boot the API and test non-processing routes, you can skip starting the worker.
- If you want to test queue-based processing, Redis-backed helpers, billing, or AI enrichment, configure those services too.

## Environment Setup
Copy `.env.example` to `.env` and fill the values.

Important groups:
- app and CORS config
- database config
- auth secrets and auth TTLs
- Redis config
- AWS region and SQS queue URL
- AI service URL / API key
- Stripe keys
- R2 storage keys and public base URL

Example:

```bash
cp .env.example .env
```

Key envs used locally:
- `DATABASE_URL`
- `PORT`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `REDIS_URL`
- `SQS_BLUEPRINT_QUEUE_URL`
- `AI_SERVICE_URL`
- `STRIPE_SECRET_KEY`
- `CF_R2_ACCESS_KEY`
- `CF_R2_SECRET_KEY`
- `CF_R2_ACCOUNT_ID`
- `CF_R2_BUCKET`
- `CF_R2_PUBLIC_BASE_URL`

## Local Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Generate Prisma client
```bash
npm run prisma:generate
```

### 3. Create or migrate the database
```bash
npm run prisma:migrate
```

### 4. Start the API
```bash
npm run dev
```

### 5. Start the worker in a second terminal
```bash
npm run worker:dev
```

The API and worker are separate local processes.

## Local Run Modes

### API only
Use this when you are working on auth, orgs, teams, projects, billing records, or other non-worker flows.

```bash
npm run dev
```

### API + worker
Use this when you want blueprint queue processing to work end-to-end.

Terminal 1:
```bash
npm run dev
```

Terminal 2:
```bash
npm run worker:dev
```

## Build And Run Compiled Locally
```bash
npm run build
npm run start
```

Worker from compiled output:

```bash
npm run worker
```

## Useful Scripts
- `npm run dev` - run API in development mode
- `npm run worker:dev` - run worker in development mode
- `npm run build` - compile TypeScript to `dist`
- `npm run start` - run compiled API
- `npm run worker` - run compiled worker
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate` - run database migrations in dev
- `npm run prisma:studio` - open Prisma Studio
- `npm run db:reset` - reset database
- `npm run format` - format source, Prisma, JSON, and Markdown files

## API Overview

### Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/accept-invitation`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-other-sessions`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/sessions`

### Admin
- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:userId/global-role`
- `GET /api/v1/admin/organizations`
- `PATCH /api/v1/admin/organizations/:organizationId/status`
- `GET /api/v1/admin/teams`
- `PATCH /api/v1/admin/teams/:teamId/status`
- `GET /api/v1/admin/projects`
- `GET /api/v1/admin/subscriptions`
- `GET /api/v1/admin/payments`
- `GET /api/v1/admin/blueprints`
- `GET /api/v1/admin/audit-logs`

### Core tenant modules
- `GET/POST/PATCH` organization, team, and project routes
- membership and collaborator routes under org/team/project modules
- subscription and payment routes under `/api/v1/subscriptions`
- blueprint upload and processing routes under `/api/v1/blueprints`
- calibration, shape, and shape-point CRUD routes

For request examples, use:
- `blueprint-backend.postman_collection.json`

## Notes And Follow-up

### Already implemented
- auth hardening
- onboarding for personal workspaces
- org/team/project collaboration-aware permission checks
- Redis cache helpers
- queue/worker processing contract
- Stripe integration layer
- super-admin management surface

### Still external to this repo
- AWS infrastructure provisioning for SQS/ECS/Redis/monitoring
- production email sending provider
- production Stripe webhook signature verification hardening
- frontend integration and UI flows
- automated test expansion for the new backend surface
