# Arithmetic and signing audit — 2026-09-29 Halifax

Data: the ledger has 27 attempts, seven distinct accepted codes, and fourteen distinct codes rejected without any acceptance. Repeated attempts are not independent observations. Gold: 93619, 22340, 50384, 47788, 33404. Bronze: 10459. Silver: 47724. Diamond: no observations.

## Exact enumerations

- Exhausted all 100,000 affine checksum coefficient vectors modulo 10. Only `[8,8,4,9,0]` fits all seven accepted codes. It also fits thirteen of fourteen rejection-only codes; only 10455 fails it.
- Removing generated acceptance 33404 leaves two checksum formulas: `[8,8,4,9,0]` and `[8,8,9,4,5]`. Its digits were generated under the first checksum, so it is not an independent digit-level validation. Its successful redemption remains evidence about machine behavior.
- Exhausted all 10,000 affine fourth-digit formulas for the five Gold observations: zero fit. Also tested each other payload digit as an affine function of the remaining three: zero fit for each. This is arithmetic inconsistency, not simply a low success estimate.
- Exhausted all 10,000 linear scores of the four payload digits, requiring one constant residue per observed tier and different residues across tiers: zero fit. Adding a common intercept changes no equality or distinction, so cannot rescue this family.
- Quadratic checksums have fifteen coefficients (constant, four linear terms, ten quadratic terms). Finite-field ranks are six modulo 2 and seven modulo 5. Chinese remainder theorem gives `2^(15-6) * 5^(15-7) = 200,000,000` fitting coefficient vectors. Some vectors represent the same polynomial function. Thus the unique affine fit is unique only within its restricted model family.

## Proof broader than an affine search

For Gold codes 33404 and 93619, the first three digits are congruent modulo 2: `(1,1,0)` for both. The fourth digits are 0 and 1. Every integer-coefficient polynomial preserves congruence, so no such polynomial of the first three digits, of any degree, can produce both fourth digits modulo 10. This does not rule out arbitrary nonlinear functions, digit carries, lookup tables, hashes, or a rule that depends on campaign or other external state.

## Validation limits

Old Gold generation cohort: 0 accepted / 5 rejected. Old Bronze cohort: 1 accepted / 7 rejected; that acceptance awarded Gold. Seventeen generated candidates remain untested. Do not turn untested codes into failures. A single Bronze observation and a single Silver observation each leave 1,000 affine fourth-digit formulas. No Diamond observation constrains a Diamond rule.

State also matters: 47788 was both accepted and rejected at different attempts. A code-only function cannot reproduce both outcomes without additional inputs such as use count, campaign, time, or account. The ledger alone does not establish which input changed. Similarly, repeated logged acceptances of 47724 do not prove actual repeat redemption; logs may include duplicate reports.

## Signing limits and the actual fix

`lib/promo.ts` implements a public checksum, not a keyed MAC. It cannot prove a code was issued. Five decimal digits have at most `log2(100000) = 16.61` bits. Requiring a checksum leaves 10,000 compatible payloads, at most 13.29 bits. HMAC cannot increase the size of a five-digit namespace.

For an owned vending system, keep issuance and awarded tier in a private backend record. Validate campaign, expiry and machine scope there; decrement the permitted redemption count atomically. Keep user-reported research attempts separate from authoritative issuance/redemption records. For a longer offline token, authenticate version, campaign, machine scope, nonce, tier and expiry with a standard keyed MAC, and track replay. This is a new protocol requiring changes on the machine; it is not a compatible discovery of the old protocol.

References: RFC 2104 (keyed message authentication), RFC 4226 (short decimal authenticator guessing limits). No machine validator or issuer source is available in this repository, so this audit does not claim to repair the machine's signing implementation.

## Next evidence

Obtain independently issued fresh codes with known tiers and campaign, rather than only codes produced by the hypothesis being tested. Freeze hypotheses before observing a held-out set. Record first use, exact validator reason and issuance source. Inspect the owned machine's issuer/validator source to distinguish a checksum filter from issuance and tier lookup. More arbitrary batches from the falsified tier formulas do not establish the missing mechanism.
