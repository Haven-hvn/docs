# Haven Media Content — Shared Attribute & Payload Spec (v2.0.0)

> **Shared contract** for all Haven surfaces (`arkiv-chain` Entity + `haven-dapp`/`haven-cli`/`haven-mobile`). Decoupled services must not re-define keys. Sources of truth: this document (key names, types, taxonomy) + `haven-cli/docs/ARKIV_FORMAT.md` (CLI wire shape) + `EntityRegistry.sol` container (`Ident32`/`Mime128`/`Attribute`). Canonical chain: `arkiv-op-reth` `0x44…0044`.
> Query-language semantics (operators, literal tags, index rules) are defined by `@arkiv-network/sdk` `src/query/*` + `src/attr/*` — see ARKIV_FORMAT §"Query language" for the digest.

> **Status: v2.0.0 spec, straight migration, no backwards compatibility.**
> Writers and readers cut over together; there are no alias keys and no fallback reads.
> Until each surface lands its 2.0 implementation, `haven-dapp/src/lib/parse-arkiv-video.ts`
> remains the implementation of record for the *old* keys. Where code and this document
> disagree during the migration window, file an issue — do not fork keys locally.

> Key marks used below:
>
> | Mark | Meaning |
> |---|---|
> | **attr** | On-chain attribute (indexed, queryable). Must justify itself with a query pattern. |
> | **payload** | Inside `Operation.payload` JSON (read on detail/decrypt views, never for list rows). |
> | **system** | Free system attribute (`$createdAt`, `$expiresAt`, …) — selectable, some filterable. |

## Cost model (why v2.0 is shaped this way)

An attribute costs ~6 words ≈ **192 B on-chain regardless of value length**; a `str` always
occupies its full 128 B slot. So: attribute *count* dominates cost, `str`→numeric saves
~96 B/attr, and every attribute below carries the query pattern that pays for it.
Typical v1.x entity ≈ 5 KB on-chain (17–20 attrs + 1.1–1.7 KB payload); a v2.0 full record
targets ≈ 2.5 KB and a 10-stage drip ≈ 20 KB total (was ≈ 50 KB).

## Entity container (from `arkiv-op-reth/contracts/src/EntityRegistry.sol`)

- **Ident32** — bytes32 left-aligned lowercase-ASCII ≤32 chars; char set validated in precompile (`Ident32InvalidByte` / `Ident32Empty`). Dots legal — the `grp` hierarchy relies on this.
- **Mime128** — 4×bytes32 packed MIME (128 bytes) validated in precompile. Entity `contentType` stays `application/json` (fixed overhead, not our problem).
- **Attribute** `struct Attribute { Ident32 name; uint8 valueType; bytes32[4] value; }`.
  v2.0.0 specifies **SDK tags**: `bool=1, i32=2, u64=3, u256=4, dec=5, bytes32=6, str=8, addr=9,
  key=10` (`bytes=7` is system-only, never settable). Older docs' `1=ATTR_UINT/2=ATTR_STRING/
  3=ATTR_ENTITY_KEY` vocabulary is superseded — verify the writer lib's tag mapping at
  implementation time.
- **Operation** `struct Operation { uint8 operationType (1 CREATE, 2 UPDATE, 3 EXTEND, 4 TRANSFER, 5 DELETE, 6 EXPIRE); bytes32 entityKey; bytes payload; Mime128 contentType; Attribute[] attributes; BlockNumber32 btl; address newOwner; }` + `execute(Operation[])` / `nonces(address)` at `ARKIV_ADDRESS`. v2.0 uses CREATE, UPDATE, **EXTEND** (drip-part refresh), DELETE (10-year-pin cleanup), EXPIRE.

## Taxonomy (`grp: str` — one key replaces `project` + `type` + `category` + `tags`)

Usenet/Big-8 style dot hierarchy. Exact match per group, `STARTSWITH str('haven.video.')` per subtree (prefix index, raw bytes — always lowercase ASCII).

| `grp` value | Producer | Content |
|---|---|---|
| `haven.video.full` | haven-cli | Full media record (v1 per-file / v3 per-epoch gates) |
| `haven.video.drip.series` | haven-dapp | v4 drip series header — shared facts stored once |
| `haven.video.drip.part` | haven-dapp | v4 drip chunk — per-stage facts + crypto material |
| `haven.audio.full` / `haven.image.full` / `haven.text.full` | reserved | Future media types (same attribute shape, other `mime` enum values) |
| `haven.meta.gate` | reserved | Future shared gate-corpus records |

## Attributes (public, indexed, no secrets)

All keys lowercase snake_case. `snake_case` everywhere — no camelCase duals.

### `haven.video.full` (max 10 attrs)

| Key | Tag | Required | Query justification |
|---|---|---|---|
| `grp` | `str` | Yes | `= str('haven.video.full')` / subtree `STARTSWITH` |
| `title` | `str` | Yes | list display + prefix search; ≤128 B |
| `gate_type` | `i32` | If gated (`1`\|`3`) | gate-class filter; `== gate.version` numerically |
| `gate_token` | `addr` | If gated | co-membership / community discovery (**by design public**) |
| `gate_chain` | `i32` | If gated | EIP chain id — replaces `EthMainnet`-style strings |
| `gate_threshold` | `i32` | If gated | threshold filter (must fit i32) |
| `gate_epoch` | `i32` | If v3 | epoch corpus grouping |
| `sha256_ct` | `bytes32` | Yes | sha256 hex digest of the record's root locator string — dedup (`find_existing_entity`) + restore key; the locator itself lives in payload `piece`/`fcid`. Renamed from `cid_hash` (which never hashed a CID). Attrs-side only, never mirrored |
| `mime` | `i32` | Yes | MIME enum (shared table below); viewer dispatch without payload fetch |
| `dur_s` | `i32` | Recommended | whole seconds (`0`/omit = unknown); display/sort without payload |

### `haven.video.drip.series` (stored once per run)

| Key | Tag | Notes |
|---|---|---|
| `grp` | `str` | `haven.video.drip.series` |
| `title` | `str` | series title |
| `gate_type` | `i32` | always `4` |
| `gate_token` | `addr` | drip token contract (lowercased) |
| `gate_chain` | `i32` | EIP chain id |
| `gate_threshold` | `i32` | threshold (full corpus triple lives on the series; parts carry none) |
| `drip_id` | `str` | stable run id (uuid) — the thread key |
| `drip_total` | `i32` | stage count |

Series payload: `{ targets: <uint[] per-stage whole-USD targets>, creator?: <handle>, mime?: <enum int> }`.

### `haven.video.drip.part` (max 7 attrs — was 17)

| Key | Tag | Notes |
|---|---|---|
| `grp` | `str` | `haven.video.drip.part` |
| `gate_type` | `i32` | always `4` |
| `drip_id` | `str` | thread key (joins to series) |
| `drip_idx` | `i32` | 0-based stage index |
| `series_ref` | `key` | entity key of the series header — `series_ref = key(0x…)` fans out in one indexed query (weak ref, no joins needed) |
| `mcap_usd` | `i32` | whole-USD unlock target for **this** stage; range-indexed (`mcap_usd >= i32(50000)`); caps a stage at ~$2.1 B |
| `sha256_ct` | `bytes32` | sha256 of ciphertext bytes |

Part payload: `{ piece, gate }` (v4 gate JSON inside `gate`; no top-level mirrors).

### MIME enum (`mime: i32`, shared across all `haven.*` groups)

`1=video/mp4, 2=video/webm, 3=video/quicktime, 4=audio/mpeg, 5=audio/wav, 6=audio/ogg,
7=image/png, 8=image/jpeg, 9=image/webp, 10=image/gif, 11=image/svg+xml, 12=text/plain,
13=text/markdown, 14=application/pdf`, `0`/omit = unknown. Extend by appending, never renumber.

### Deleted in 2.0.0 (do not write, do not read)

`project`, `type`, `category`, `tags`, `language`, `is_encrypted` (infer from `gate_type`
presence), `encrypted_cid` (locator is `sha256_ct` + payload `piece`), `cid_hash` (renamed),
`created_at` / `updated_at` / `created_at_ts` (use system `$createdAt`), `mint_id`,
`creator_handle`, `source_uri`, `phash`, `analysis_model` as attributes (payload-only now),
`gate_epoch` as payload mirror, `market_cap_target_usd` (renamed `mcap_usd`),
`drip_index` (renamed `drip_idx`), `oracle_address` (unused — re-add only when enforced),
`published_by` (never queried; provenance is `$creator`), `description` (unbounded — off-chain),
`thumbnail_cid` (never written/read — stays out until a writer exists),
`gate_version` (removed in 1.1.0), `expires_at_block` / `created_at_block` (system
`$expiresAt` / `$createdAt`), `has_ai_data` (infer from `vlm` presence).

## Payload (`Operation.payload` JSON — short keys, no attribute mirrors)

Payload mirrors of attributes are forbidden: attrs are always readable alongside payload,
and the Filecoin-without-Arkiv restore case does not exist, so mirrors only duplicate bytes.

### `haven.video.full` payload

| JSON key | Type | Notes |
|---|---|---|
| `piece` | `string` | piece CID — **encrypted records only** |
| `fcid` | `string` | Filecoin CID — **clear records only** (never both, never thrice) |
| `gate` | `string` | content-gate JSON (`version,cid,chain,tokenAddress,threshold[,epoch],encryptedAesKey`); frozen Haven-AOL spellings stay inside the blob |
| `cid_gate` | `string` | CID-gate JSON, only if distinct from content gate |
| `size` | `number` | bytes |
| `pt_hash` | `string` | sha256 of plaintext before encryption (was `original_hash`) |
| `seg` | `object` | `{segment_index,start_timestamp,end_timestamp,mint_id,recording_session_id}` |
| `codecs` | `string[]` | e.g. `["h264","hevc"]` |
| `vlm` | `string` | VLM analysis JSON CID |
| `vlm_model` | `string` | e.g. `zai-org/glm-4.6v-flash` (was attr `analysis_model`) |
| `src` | `string` | provenance URI (was attr `source_uri`) |
| `creator` | `string` | handle (was attr `creator_handle`) |
| `phash` | `string` | perceptual hash (was attr) |
| `attn` | `object` | single `{evmAddress,…,signature}` or Merkle-v2 (distinguished by `merkleProof` presence) |

**Constraints:** gated ⟹ `gate` present and no `fcid` in clear. Recency/expiry come from
system `$createdAt`/`$expiresAt` — never custom timestamp keys.

### Gate JSON (frozen Haven-AOL layer — NOT changed by 2.0.0)

`version: 1` / `3` (+`epoch`, 2592000 s epochs) / `4` (+`marketCapTarget`, `oracleAddress`).
`gate_type == gate.version` numerically, always.

## Expiry (BTL) policy

Cost scales with block-to-live.

| Record class | Default BTL | Mechanism |
|---|---|---|
| `haven.video.full` | **4 weeks** | unchanged CLI default (`ARKIV_EXPIRATION_WEEKS`, min 1) |
| `haven.video.drip.series` | **52 weeks** | header outlives parts |
| `haven.video.drip.part` | **12 weeks** | `EXTEND` (op 3) while the series is active |

The dapp's former 10-year pin is abolished. All 10-year-pinned v4 records must be explicitly
`DELETE`d (op 5) — list via old markers (`gate_type = i32(4)`, `gate_version = str('v4')`).

## Query cookbook (exact SDK spellings)

- Feed scope: `grp STARTSWITH str('haven.video.')`
- Drip feed rows (attributes only — never select payload for list rows; the old feed
  over-fetched `encryptedAesKey` per row and ignored it):
  `AND(grp = str('haven.video.drip.part'), gate_type = i32(4))`
- Stages of one drip: `series_ref = key(0x<series key>)` — one indexed query
- Upload dedup: `sha256_ct = bytes32(0x…)`
- Price-gated discovery: `mcap_usd >= i32(50000)` (ordered index)
- Complement: `NOT gate_type = i32(4)` (`!=` misses entities lacking the attribute)
- `select()` only what the view renders; recency client-side from `$createdAt`

## Cross-surface mapping

- **arkiv-chain** `arkiv_entitydb` stores `payload` as `bytes` + attributes array; query via
  SDK `createPublicClient` (`eq`, `startsWith`, `and`, …).
- **haven-dapp** publisher (series + parts) + feed (parts query, attributes-only rows, one
  series fetch per `drip_id`); detail/decrypt views add payload.
- **haven-cli** `media/metadata` pipelines → `haven.video.full` keys; `phash`/VLM feed payload.
- **haven-mobile** parses canonical snake_case keys (alias chains collapse); gateway
  `GET /api/arkiv/media` family unchanged.

## Privacy design (preserved from v1.x)

> **Attributes are public and permanent — including `title`.**
> An attribute is on-chain, readable by anyone. For a gated archive the subject (`title`),
> the length (`dur_s`), the publishing address and the gate are all legible while the content
> stays sealed. v2.0 shrinks this surface (no `source_uri`, no `creator_handle`, no
> free-text `tags` on-chain) but `title` stays required and public: a reader who cannot
> decrypt anything can still read the table of contents.
>
> **The gate attributes are public *by design*.** `gate_token` / `gate_chain` / `gate_threshold`
> in the clear make the co-membership graph computable from public chain state — the
> protocol's only discovery mechanism and the basis for "holders of this also hold that"
> recommendation with no server and no tracking. Do not blind these.
>
> Addresses are pseudonyms, not identities — Haven publishes no identity — so the cost is
> *linkability*, not deanonymisation. What keeps the public graph from becoming behavioural
> surveillance is that Haven records **no view events on any surface**: the graph states who
> can read what, never who read what.
>
> There is still **no member-visible-but-not-public tier**; a publisher who needs a private
> title has no mechanism and no warning. Tiered-metadata proposal:
> `haven-mobile/planning/ECOSYSTEM-SPEC-GAPS.md` item 0 (internal).

## Validation

* Precompile rejects `Ident32InvalidByte`/`AttributeValueMalformed`/`AttributeStringInvalidByte` — writers must use the exact SDK tag per table.
* Recommended `corbell spec review` constraint: `media-attributes-v2: all media entities must include grp + title + matching gate corpus (gate_type/token/chain/threshold)` — to be added as `reliability` constraint.

## Change log

2026-09 — **v2.0.0.** Usenet-style `grp` taxonomy replaces `project`/`type`/`category`/`tags`;
numeric SDK types (`addr`/`bytes32`/`i32` chain ids, shared MIME enum); drip threading
(series + `series_ref: key` parts, 17 attrs → 7 per chunk); payload short keys; all
attribute↔payload mirrors deleted; system `$createdAt`/`$expiresAt` replace all timestamp
keys; BTL policy (4 w full / 52 w series / 12 w parts, 10-year pins abolished with explicit
DELETE cleanup). Straight migration, no backcompat. Prior v1.x key inventory and the
public-by-design gate rationale preserved above in updated form.

2026-09 — v1.1.0. `gate_version` → `gate_type` (numeric `1|3|4`, one word instead of a
128-byte string slot). Writers emit `gate_type` only; readers read `gate_type` only.

2026-08-15 — trued up against the implementation (seven keys the code read that the doc
omitted; unread `thumbnail_cid`; non-entity fields; public-by-design gate rationale).
Superseded by v2.0.0 above.
