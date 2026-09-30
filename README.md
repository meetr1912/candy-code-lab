**Candy Code Lab**

I built this as a compatibility generator for a candy vending machine. It preserves the formulas and reported results from the supplied Gemini conversation. I do not treat matching arithmetic as proof that a machine will redeem a code or award a particular tier.

**Compatibility**

| Reported tier | Previously accepted codes |
| --- | --- |
| Gold | 93619, 22340, 50384, 47788, 33404 |
| Bronze | 10459 |
| Silver | 47724 |

I preserve 47788's later failed attempt without erasing its Gold acceptance. I also preserve the reported rejections of 10455 and 81755. Original attempt dates are unknown and remain null.

For a code d1d2d3d4d5, I retain the original checksum:

`d5 = (8*d1 + 8*d2 + 4*d3 + 9*d4) mod 10`

I retain the previous tier hypotheses as experimental cohorts:

- Gold: `d4 = (8*d1 + 7*d3 + 7) mod 10`
- Bronze: `d4 = (-d1 - d2 - d3) mod 10`

I normalize negative remainders to 0–9. I skip generated or recorded codes and codes that satisfy both cohort rules. The generated code 33404 matched the old Bronze rule but awarded Gold on first use on September 29, 2026. Silver code 47724 also matches it. Neither old rule can classify tiers. I leave Silver and Diamond generation unavailable.

**What the tool does**

- I generate and save unique batches of 1, 5, 10, or 25 candidates.
- I check previously supplied codes against the original checksum.
- I keep predicted tiers separate from observed tiers, including contradictory observations.
- I append every accepted or rejected attempt and preserve exact response notes.
- I export the observed history and generated candidates as JSON.
- I use database transactions and unique request IDs so network retries and concurrent generation do not duplicate batches or attempts.

**Limits of the model**

The six accepted examples identify one zero-constant linear checksum, but two affine checksums fit them. The alternate `(8*d1 + 8*d2 + 9*d3 + 4*d4 + 5) mod 10` also excludes rejected code 81755. I display that uncertainty without silently switching the requested original model.

The old Gold rule was fitted to four Gold examples and is falsified by 33404. No affine fourth-digit formula of the tested form fits all five distinct Gold codes. The first checksum fits the newly accepted code; the alternative previously discussed does not. I make no claim to have recovered the firmware.

**Saving and source of truth**

The owner-only ChatGPT Site now writes directly to its D1 database. The save form requires no GitHub token. The D1 database contains the original attempts and generated codes plus the newly reported Gold result. The public `data/ledger.json` is a historical snapshot, not a live synchronized database. GitHub Pages redirects to the Site to prevent new results from entering a second writable store. Do not use the JSON snapshot as current evidence after additional Site saves.

**Development**

I keep the pure formulas and source observations in `lib/promo.ts`, the prepared database operations in `lib/lab-store.ts`, the page in `app/page.tsx`, and schema plus migrations in `db/schema.ts` and `drizzle/`. I use the Site's private access boundary; the application is not designed as a public vending-machine redemption endpoint.

I follow [dev-mock-quickstart.md](dev-mock-quickstart.md) for local development without a cloud database or live vending machine. The source-backed tests cover every original accepted code, both reported failures, all 2,000 serial/tier combinations, ambiguous matches, malformed inputs, history preservation, and concurrent/idempotent writes against local SQLite.
