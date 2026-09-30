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

I normalize negative remainders to 0–9 and skip generated or recorded codes. The old Bronze rule generated 33404, but the machine awarded Gold; it also matches the accepted Silver code 47724. Neither old rule predicts the tier. I leave Silver and Diamond generation unavailable.

**What the tool does**

- I generate and save unique batches of 1, 5, 10, or 25 candidates.
- I check previously supplied codes against the original checksum.
- I keep predicted tiers separate from observed tiers, including contradictory observations.
- I append every accepted or rejected attempt and preserve exact response notes.
- I export the observed history and generated candidates as JSON.
- I use database transactions and unique request IDs so network retries and concurrent generation do not duplicate batches or attempts.

**Limits of the model**

Seven distinct accepted codes leave exactly one affine checksum of the tested form: `(8*d1 + 8*d2 + 4*d3 + 9*d4) mod 10`. It also matches 13 of 14 codes rejected without any recorded acceptance. The old alternate checksum fails on accepted 33404.

Five distinct Gold examples have no common affine fourth-digit tier rule of the tested form. The old Gold-rule generated cohort has 0 accepted and 5 rejected; the old Bronze-rule cohort has 1 accepted (awarded Gold) and 7 rejected. These selected tests do not establish population success probabilities. Eight latest rejections have unknown first-use status.

**Storage**

The owner-only ChatGPT Site saves attempts directly to its D1 database, including the original attempts and generated history. GitHub Pages redirects to the Site. The public `data/ledger.json` is a snapshot, currently manually aligned with the Site. The prepared scheduled mirror requires a `CANDY_SITE_ACCESS_TOKEN` GitHub Actions secret before it can keep the JSON current automatically; this gives the workflow access to the private Site export endpoint.

**Development**

I keep the pure formulas and source observations in `lib/promo.ts`, the prepared database operations in `lib/lab-store.ts`, the page in `app/page.tsx`, and schema plus migrations in `db/schema.ts` and `drizzle/`. I use the Site's private access boundary; the application is not designed as a public vending-machine redemption endpoint.

I follow [dev-mock-quickstart.md](dev-mock-quickstart.md) for local development without a cloud database or live vending machine. The source-backed tests cover every original accepted code, both reported failures, all 2,000 serial/tier combinations, ambiguous matches, malformed inputs, history preservation, and concurrent/idempotent writes against local SQLite.
