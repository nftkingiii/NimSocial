# Threat model

## Assets and trust boundaries

- Wallet ownership and session authority
- Paid-post publication rights
- Job content and participant-only messages
- USDT held by the escrow contract
- Nimiq and Polygon RPC responses

The client, all request bodies, transaction hashes, post content, wallet addresses, and RPC responses are untrusted. PostgreSQL is trusted for consistency but not for custody. The API has no wallet private keys and cannot transfer escrowed USDT.

## Primary threats and controls

| Threat | Control |
|---|---|
| Login replay | Random nonce, five-minute expiry, one-time atomic consumption |
| Public-key substitution | Derive the Nimiq address from the supplied public key before accepting its signature |
| Session database leak | Store only SHA-256 token hashes; use random 256-bit tokens and expiries |
| Cross-site session use | Strict SameSite cookie, HttpOnly, Secure in production, explicit CORS allowlist |
| Payment spoofing | Fetch transaction server-side and match confirmation, sender, recipient, minimum value, and exact data reference |
| Payment reuse | Unique database constraint on transaction hash |
| Unauthorized job access | Client/accepted-worker authorization on messages and worker-only proof publishing |
| Injection and oversized input | Parameterized SQL, Zod schemas, bounded strings, and 64 KiB body limit |
| Brute force or resource exhaustion | Per-IP rate limits, stricter auth limits, pagination caps, RPC timeout |
| Client escrow theft | No unilateral cancellation after funding; state transitions use checks-effects-interactions and reentrancy protection |
| Worker deadline race | Evidence submission fails after deadline; client can refund expired funded work |
| Client disappears after delivery | Worker can claim after a three-day review window unless a dispute has opened |
| Arbiter conflict | Arbiter must differ from client and worker |
| Secret exposure | No keys in repository or environment examples; contract interactions are user-signed |

## Known limits before production

- Select and operate a trusted Nimiq RPC endpoint, or require agreement from multiple independent providers.
- Decide the arbiter policy and disclose its authority to users before contract deployment.
- Add production observability, database backups, and session/audit retention policies.
- Add an escrow-chain indexer or finality-aware refresh endpoint so API job state is derived from contract events.
- Commission an independent Solidity audit before handling material value.
- Validate the complete login and transaction response shapes inside the current Nimiq Pay release.
