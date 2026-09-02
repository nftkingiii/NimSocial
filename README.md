# NimSocial

NimSocial is a wallet-native public work network for Nimiq Pay. People publish requests, service ads, progress updates, and proof of work into a public feed. Publishing is unlocked by a small, verifiable NIM payment; jobs use a separate non-custodial USDT escrow on Polygon.

The repository now contains the backend, tested escrow contract, and the first mobile-first frontend slice.

## What is implemented

- Nimiq message-signature login with expiring, single-use challenges
- Opaque sessions stored as SHA-256 hashes, with secure cookie and bearer-token support
- Public, cursor-paginated feed
- Paid post intents and Nimiq transaction verification before publication
- One-time transaction enforcement to prevent payment replay
- Jobs, applications, worker selection, and participant-only job messaging
- Proof-of-work posts restricted to the accepted worker
- PostgreSQL schema and parameterized repository
- Polygon USDT escrow contract with fund, submit, approve, dispute, arbitrate, and deadline-refund states
- Rate limiting, restricted CORS, security headers, bounded payloads, and Zod validation
- Responsive React frontend with feed, discovery, jobs, profile, and paid-post composer states
- Mobile-first six-destination navigation and horizontally scrollable feed categories
- Role-based profile onboarding for workers, clients, or people who do both
- Public professional profiles with follow relationships, availability, skills, posts, and work history
- Settled-job reviews with a derived, non-transferable reputation summary
- Nimiq Pay SDK flow for wallet discovery, signed login, payment-with-data, and publication confirmation
- Original NimSocial proof-path identity, favicon, and app icon

The contract is compiled and tested locally, but **is not deployed**. RPC endpoints, treasury address, Polygon token, and future escrow deployment addresses are environment configuration—not bundled secrets.

## Architecture

```text
Nimiq Pay mini app (React frontend)
       | signed login / API requests
       v
Fastify API ---- PostgreSQL (content, jobs, sessions)
       |
       +---- Nimiq JSON-RPC (verify paid-post transaction)

Nimiq Pay EIP-1193 provider
       |
       +---- Polygon USDT ---- NimSocialEscrow
```

The API never receives a private key and never takes custody of escrow funds. Full post content remains off-chain; the NIM transaction data contains only a compact `NSP:<reference>` value.

## Run locally

Requirements: Node.js 22+, npm 11+, Docker, and Foundry.

```bash
npm ci --ignore-scripts
docker compose up -d postgres
cp .env.example .env
# Set a valid Nimiq RPC URL and treasury address in .env
npm run db:migrate
npm run dev
npm run web:dev
```

Run all checks:

```bash
npm run check
npm audit --audit-level=high
```

The frontend runs at `http://localhost:5173` and proxies API requests to `http://127.0.0.1:8080`. Use `VITE_API_URL` when the API is hosted separately.

## Frontend and brand

The interface combines a wallet-aware public feed, a fixed six-icon mobile navigation bar, scrollable feed categories, and explicit proof metadata. Profiles expose work availability, skills, past work, posts, and payment-backed reputation evidence. New users choose whether they came to find work, hire, or do both; role, skills, availability, work preference, and follows provide the first recommendation signals before interaction history exists.

When the API has no published activity, the UI shows clearly labeled illustrative preview content rather than presenting fixtures as live data. Reputation credentials are also labeled as previews: scores are derived from completed job reviews, but no on-chain credential is claimed until an attestation flow is deployed and verified.

Brand files live in `web/public/brand/`. The mark is a continuous **proof path** forming an `N` between two verified endpoints. See `web/BRAND.md` for concept, palette, and usage rules.

## API surface

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/healthz` | Service health |
| `GET` | `/v1/config` | Public chain, fee, treasury, and deployment configuration |
| `POST` | `/v1/auth/challenges` | Create an expiring Nimiq sign-in challenge |
| `POST` | `/v1/auth/sessions` | Verify signature and create a session |
| `DELETE` | `/v1/auth/session` | Revoke the current session |
| `GET` | `/v1/feed` | Browse published requests, services, updates, and proofs |
| `GET/PATCH` | `/v1/me/profile` | Read or complete the signed-in user's professional profile |
| `GET` | `/v1/profiles` | Discover profiles by role, availability, and search query |
| `GET` | `/v1/profiles/:walletAddress` | Read a public profile and derived reputation |
| `GET` | `/v1/profiles/:walletAddress/posts` | Browse a person's published work and updates |
| `POST/DELETE` | `/v1/profiles/:walletAddress/follow` | Follow or unfollow a profile |
| `POST` | `/v1/posts/intents` | Create a draft and receive exact NIM payment fields |
| `POST` | `/v1/posts/:id/publish` | Verify the NIM transaction and publish |
| `GET` | `/v1/posts/:id` | Read a published post |
| `POST` | `/v1/jobs` | Open a USDT-budgeted job |
| `GET` | `/v1/jobs/:id` | Read job state |
| `POST` | `/v1/jobs/:id/applications` | Apply to an open job |
| `POST` | `/v1/jobs/:id/applications/:applicationId/accept` | Select a worker |
| `GET/POST` | `/v1/jobs/:id/messages` | Participant-only job messages |
| `GET/POST` | `/v1/conversations` | List or start authenticated direct conversations |
| `GET/POST` | `/v1/conversations/:id/messages` | Participant-only direct messages, optionally linked to a public request |
| `POST` | `/v1/jobs/:id/reviews` | Rate an accepted worker after the job is settled |

Authenticated routes accept `Authorization: Bearer <token>` or the HttpOnly session cookie. Amounts are decimal strings in the API (`luna` for NIM, six-decimal micros for USDT) to avoid JavaScript integer loss.

## Escrow lifecycle

1. The client chooses a worker and approves USDT.
2. `fundJob` transfers the exact amount into the escrow contract.
3. The worker commits a `bytes32` evidence hash before the deadline.
4. The client approves release, either party opens a dispute, or the worker claims after a three-day client review window.
5. The configured arbiter releases or refunds a disputed job; if no evidence arrives by the deadline, the client can refund.

There is deliberately no unilateral client cancellation after funding. That would undermine the worker’s protection.

## Current boundary

Built and locally verified: API logic, PostgreSQL adapter, Nimiq signature verification, transaction-proof adapter, escrow state machine, profile/onboarding/follow/review flows, responsive frontend build, and browser-rendered desktop/mobile states.

Not yet live-verified: a real Nimiq Pay signature/payment, a public Nimiq RPC payment confirmation, a deployed Polygon contract, and an on-chain reputation attestation. These require Nimiq Pay on a device, funded user-controlled test wallets, and deployment addresses.

See [the threat model](docs/THREAT_MODEL.md) for the security boundary.

## License

MIT
