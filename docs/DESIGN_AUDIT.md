# NimSocial design audit — 2026-09-07

Direction: an approachable work community with electric blue identity, clear white surfaces, readable social content and an expressive welcome moment.

## Findings and changes

| Surface | Finding | Change | Risk |
| --- | --- | --- | --- |
| Identity | Fine strokes and colored endpoints lose clarity at small sizes | Folded N silhouette in blue; matching favicon and app icon | Low |
| Fonts | Remote Muli/Fira request mixed with bundled Manrope/Newsreader | Bundled Manrope interface, Newsreader welcome headline, system mono fallback | Low |
| Palette | Warm backgrounds and inconsistent inline values | White surfaces, cool neutral canvas, electric blue actions | Low |
| Hierarchy | Large editorial screen titles compete with posts | Compact sans headings; 16px post body; 12px metadata | Medium |
| Controls | Small engagement targets and hardcoded profile badge | 44px engagement targets; remove fake badge | Medium |
| Welcome | Generic wallet card without brand or purpose | Branded responsive introduction and explicit connection action | Medium |
| Error state | Undefined muted/canvas tokens and overridden red text | Define tokens and scope error styling | Low |
| Motion | Inconsistent transitions | Restrained color transitions and reduced-motion override | Low |

## Behavioral boundaries

Wallet signatures, account selection, session API, posting/payment handlers, data fetching, navigation handlers, thread interactions, and mobile fixed navigation are retained. This visual work does not establish session restoration or a completed escrow workflow.

Local design.html is a DEV-only isolated preview of the real feed and discovery components using labeled fixtures. It neither authenticates nor transacts and is not a production build entry.

## Remaining product gaps

- Session restoration and account-change handling still need implementation and verification.
- Nimiq Pay device signing and Polygon escrow user journey remain unproven.
- Jobs and portions of reputation/notifications still contain illustrative or incomplete behavior.
- Browser design previews verify layout, not live multi-user financial acceptance.
