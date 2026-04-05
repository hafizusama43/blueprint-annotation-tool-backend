# Backend Implementation Status

## Scope
This document summarizes the current production-phase backend implementation in `blueprint-annotation-tool-backend`, what was added module by module, what is already done, and what is still pending or should be treated as follow-up work.

The work completed here focuses on the backend only.

## Overall Status
- Backend production-phase implementation has been applied across auth, org/team/project management, collaboration enforcement, Redis caching, queue/worker flow, Stripe billing, and super-admin operations.
- Prisma client generation succeeds.
- TypeScript build succeeds.
- No current linter errors were found after the implementation pass.

## Database And Schema
Implemented in `prisma/schema.prisma`.

Included:
- global app role support with `AppGlobalRole`
- `SUPER_ADMIN` support on `User.globalRole`
- email verification, password reset, and invitation token storage through `UserToken`
- admin audit logging through `AdminAuditLog`
- auth session hardening fields such as rotation and revoke reason
- account security fields like failed login count, lock timestamp, password changed timestamp, email verification timestamp
- team-level status support
- Stripe-facing plan field `providerPlanId`
- previously added org/team/project/subscription/payment/blueprint ownership and progress models remain in place

Done:
- multi-tenant and production-oriented schema is in place
- auth, admin, onboarding, billing, and worker-related schema support exists

Pending / follow-up:
- Prisma migration creation/apply process is not documented in this file and should be run against the target database environment

## Auth Module
Primary files:
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/auth.routes.ts`
- `src/modules/auth/auth.utils.ts`
- `src/middleware/auth.middleware.ts`

Included:
- register flow with onboarding-ready payloads
- login with failed attempt tracking and temporary lock strategy
- refresh token rotation
- refresh token reuse detection logic
- logout current session
- logout other sessions
- email verification flow
- forgot password flow
- reset password flow
- change password flow
- invitation acceptance flow
- session-aware access token payload with org role and global role

Done:
- hardened JWT + refresh-session flow exists
- protected routes use shared auth middleware
- global super-admin route guard exists

Pending / follow-up:
- no mail delivery provider is wired here; verification/reset flows return or consume tokens at backend level, but actual email sending still needs integration if required
- rate limiting is implemented conceptually through lock strategy, but dedicated Redis-backed auth throttling can still be expanded further if you want stricter IP/email throttles

## Onboarding And Personal Workspace Setup
Primary file:
- `src/modules/auth/auth.service.ts`

Included:
- personal signup path
- organization signup path
- automatic creation of personal organization/workspace
- automatic creation of starter project
- optional starter team for organization-style signup
- default collaboration behavior for solo vs shared workspace

Done:
- backend registration can create a usable workspace by default
- individual users are modeled on the same org-based structure

Pending / follow-up:
- frontend onboarding UI is not part of this backend repo

## Permissions And Collaboration
Primary files:
- `src/services/permissions/permissions.service.ts`
- route/controller enforcement across org, team, project, blueprint, shape, calibration, and shape-point modules

Included:
- org-level access checks
- project-level access checks
- blueprint-level access checks
- blueprint-page and shape-level access checks
- super-admin bypass support where appropriate
- collaboration-aware access enforcement for project resources

Done:
- org admins can manage org resources
- project collaborators can be checked before accessing project-owned resources
- collaboration moved beyond schema-only foundation into actual request enforcement

Pending / follow-up:
- team-based collaborator expansion is partially represented through `ProjectCollaborator.teamId`, but can be extended further if you want automatic derived access recalculation rules

## Organization Module
Primary files:
- `src/modules/organization/organization.service.ts`
- `src/modules/organization/organization.controller.ts`
- `src/modules/organization/organization.routes.ts`

Included:
- list organizations
- get organization
- create organization
- update organization
- update organization status
- add organization member
- remove organization member

Done:
- org CRUD is functional at backend level
- org membership management exists
- super-admin org status control exists

Pending / follow-up:
- pagination/filtering can still be expanded for very large datasets

## Team Module
Primary files:
- `src/modules/team/team.service.ts`
- `src/modules/team/team.controller.ts`
- `src/modules/team/team.routes.ts`

Included:
- list teams
- get team
- create team
- update team
- add team member
- remove team member

Done:
- team management is available to authorized org admins
- team status field exists in schema and admin control surface

Pending / follow-up:
- dedicated team archive/history endpoints were not added beyond status/update behavior

## Project Module
Primary files:
- `src/modules/project/project.service.ts`
- `src/modules/project/project.controller.ts`
- `src/modules/project/project.routes.ts`

Included:
- list projects
- get project
- create project
- update project
- archive project
- add project collaborator
- remove project collaborator

Done:
- project CRUD and collaboration hooks are in place
- project archive flow exists
- project access is permission-checked

Pending / follow-up:
- advanced project filtering, search, and pagination can be added later if needed

## Blueprint Processing
Primary files:
- `src/modules/blueprint/blueprint.controller.ts`
- `src/modules/blueprint/blueprint.service.ts`
- `src/modules/blueprint/blueprint.processor.ts`
- `src/worker.ts`
- `src/services/queue/sqs.ts`
- `src/services/queue/blueprintQueue.service.ts`
- `src/services/ai/ai.service.ts`

Included:
- queue-based job enqueueing
- worker polling entrypoint
- PDF page rendering
- batched page upload flow
- incremental blueprint progress updates
- AI extraction step integration point
- blueprint page AI metadata persistence
- processing status heartbeat updates

Done:
- in-process `setImmediate` style flow was replaced with SQS-oriented queue contract
- worker app entrypoint exists
- progressive page availability logic exists

Pending / follow-up:
- actual AWS infrastructure deployment is still external to the codebase
- ECS task definition, SQS queue creation, IAM, autoscaling, and CloudWatch configuration must still be provisioned in AWS
- webhook/event-based progress push is not added; frontend is expected to poll status endpoints

## Cache Layer
Primary files:
- `src/services/cache/redis.ts`
- `src/services/cache/cache.service.ts`
- `src/services/cache/keys.ts`

Included:
- centralized Redis client
- reusable JSON get/set helpers
- cache invalidation helper
- module-based cache keys

Current key patterns:
- `user:{id}`
- `org:{id}`
- `project:{id}`
- `blueprint:{id}`
- `blueprint:status:{id}`
- `subscription:org:{id}`

Done:
- Redis service is reusable and centralized
- several hot reads and write invalidations now go through the cache layer

Pending / follow-up:
- no Redis-backed distributed rate limiter middleware was added yet
- caching can be expanded to more list endpoints if needed

## Billing / Stripe
Primary files:
- `src/modules/subscription/subscription.service.ts`
- `src/modules/subscription/subscription.controller.ts`
- `src/modules/subscription/subscription.routes.ts`
- `src/services/billing/stripe.ts`

Included:
- plan creation
- organization subscription creation
- payment creation
- Stripe checkout session creation
- Stripe webhook handling
- subscription/payment mapping into existing schema

Done:
- Stripe-first billing service layer exists
- payment and subscription schema integration exists
- provider ids are kept inside billing-related tables

Pending / follow-up:
- webhook signature verification is not implemented yet
- customer portal, refunds, proration, dunning, and invoice sync behaviors are not fully expanded
- production Stripe secret management and webhook secret wiring must be completed in deployment

## Admin Module
Primary files:
- `src/modules/admin/admin.service.ts`
- `src/modules/admin/admin.controller.ts`
- `src/modules/admin/admin.routes.ts`
- `src/services/audit/audit.service.ts`

Included:
- dashboard summary
- list users
- update user global role
- list organizations
- update organization status
- list teams
- update team status
- list projects
- list subscriptions
- list payments
- list blueprints
- list audit logs

Done:
- super-admin app management surface exists
- global operational visibility endpoints exist
- critical admin actions are audit-log capable

Pending / follow-up:
- app-level settings storage itself is not yet implemented as a dedicated persisted settings module

## Resource Modules
Primary files:
- `src/modules/shape/*`
- `src/modules/shapePoint/*`
- `src/modules/calibration/*`

Included:
- list, get, create, update, delete for shapes
- list, get, create, update, delete for shape points
- list, get, create, update, delete for calibrations
- permission enforcement against blueprint/project access
- creator/updater attribution hooks

Done:
- blueprint-owned measurement resources now have real CRUD coverage and permission checks

Pending / follow-up:
- pagination/filtering is basic and can be extended later

## API Tooling
Included:
- `blueprint-backend.postman_collection.json`

Done:
- module-wise Postman collection created
- reusable variables like `{{base_url}}` and `{{token}}` are included

## Environment Configuration
Primary files:
- `.env.example`
- `src/config/env.ts`

Included:
- auth-related env vars
- Redis env vars
- SQS/worker env vars
- AI service env vars
- Stripe env vars

Done:
- backend configuration surface was expanded for the production-phase modules

Pending / follow-up:
- production secrets still need to be supplied in your deployment environment

## Legacy Backfill
Status:
- legacy backfill is not part of the current code path for this new codebase

Done:
- implementation assumes a clean new system, not migrated legacy ownership data

## Explicitly Pending Or Outside Current Backend Work
- frontend integration for org/project/auth UI flows
- deployment of AWS infrastructure for SQS/ECS/Redis/monitoring
- production email delivery integration
- Stripe webhook signature verification hardening
- automated test coverage for new backend flows
- app-level persistent settings module for super-admin defaults
- advanced pagination/search/reporting for large operational datasets

## Recommended Next Steps
1. Create and run Prisma migrations against the target database.
2. Provision AWS resources for SQS, ECS worker runtime, Redis, IAM, and monitoring.
3. Add real email provider integration for verification, invitations, and password reset delivery.
4. Add Stripe webhook signature validation before using billing in production.
5. Add backend tests for auth rotation, onboarding, permissions, worker processing, and billing webhooks.
6. Wire the frontend to the new auth, org, team, project, and billing endpoints.
