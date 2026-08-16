# Haven Media Content — Shared Attribute & Payload Spec

> **Shared contract** for all Haven surfaces (`arkiv-chain` Entity + `haven-dapp`/`haven-cli`/`haven-mobile`). Decoupled services must not re-define keys. Source of truth: `haven-dapp/src/types/arkiv.ts` (`ArkivAttributes` + `ArkivPayload`) + `EntityRegistry.sol` container (`Ident32`/`Mime128`/`Attribute`). Canonical chain: `arkiv-op-reth` `0x44…0044`.

> **Implementation of record: `haven-dapp/src/lib/parse-arkiv-video.ts`.**
> That function is the only code that turns a real entity into a domain object, so it — not this
> document — decides what a consumer can rely on. Where the two disagree, the parser wins and this
> document is wrong. The tables below now mark each key with what the parser does:
>
> | Mark | Meaning |
> |---|---|
> | **read** | `parse-arkiv-video.ts` reads it. Safe to depend on. |
> | **read elsewhere** | Read by another surface (noted inline), not by the video parser. |
> | **unread** | Specified here and read by nothing. Do not depend on it; treat as absent. |
>
> Two keys are currently **unread** (`thumbnail_cid`, and any size key), and three fields consumers
> commonly expect are **not entity data at all** (`arkiv_status`, cache state, file name/extension).
> Gaps and proposed fixes: `haven-mobile/planning/ECOSYSTEM-SPEC-GAPS.md` (internal).

## Entity container (from `arkiv-op-reth/contracts/src/EntityRegistry.sol`)

- **Ident32** — bytes32 left-aligned lowercase-ASCII ≤32 chars; char set validated in precompile (`Ident32InvalidByte` / `Ident32Empty`).
- **Mime128** — 4×bytes32 packed MIME (128 bytes) validated in precompile.
- **Attribute** `struct Attribute { Ident32 name; uint8 valueType; bytes32[4] value; }` where `valueType`: `1=ATTR_UINT` (value[0] only), `2=ATTR_STRING` (128-byte, no embedded null-byte after zero), `3=ATTR_ENTITY_KEY` (value[0] only).
- **Operation** `struct Operation { uint8 operationType (1 CREATE, 2 UPDATE, 3 EXTEND, 4 TRANSFER, 5 DELETE, 6 EXPIRE); bytes32 entityKey; bytes payload; Mime128 contentType; Attribute[] attributes; BlockNumber32 btl; address newOwner; }` + `execute(Operation[])` / `nonces(address)` at `ARKIV_ADDRESS`. Payload is `bytes` (JSON/base64 per below) + `btl` expiry.

SDK stores attributes as array `ArkivSdkAttribute { key:string; value:string|number }` (snake_case keys) — current Haven build uses lowercase-ASCII Ident32 so TS `ArkivAttributes` maps 1:1.

## Media Content — standardized keys

All keys are `Ident32` lowercase; enum values below are the only accepted spellings. `snake_case` required by SDK/payload.

### Public Attributes (`ArkivAttributes` — searchable, on-chain, no secrets)

| Ident32 key | `valueType` | Required | Haven writer(s) | Notes |
|---|---|---|---|---|
| `title` | `STRING` | **Yes** | `haven-dapp`, `haven-cli` | Display title; `haven-dapp/src/types/arkiv.ts:115` `title?:string` |
| `duration` | `UINT` | Recommended | `haven-dapp`, `haven-cli` `media/metadata` | seconds; duplicate in payload for convenience |
| `creator_handle` | `STRING` | Recommended | `haven-dapp:123` | lowercased handle |
| `is_encrypted` | `UINT` | Required | `haven-dapp:133`, `haven-cli` | `1=encrypted`, `0/undef=clear` |
| `encrypted_cid` | `STRING` | If encrypted | `haven-dapp:140` | privacy-preserving lookup (encrypted Filecoin CID) |
| `phash` | `STRING` | Optional | `haven-cli` `phash` | perceptual hash for dedup |
| `analysis_model` | `STRING` | Optional | `haven-cli` VLM | e.g. `vlm_json_cid` producer |
| `source_uri` | `STRING` | Optional | `haven-dapp`, `haven-cli` | original URI |
| `tags` | `STRING` | Optional | `haven-dapp:161` | comma/cat string, not array |
| `category` | `STRING` | Optional | `haven-dapp:164` | single category |
| `language` | `STRING` | Optional | `haven-dapp:167` | BCP-47 `en` |
| `created_at` | `STRING` | System | `arkv-entitydb` | ISO-8601, also `payload.created_at_block` as block height |
| `updated_at` | `STRING` | System | — | ISO-8601 if UPDATE |
| `mint_id` | `STRING` | Optional | `haven-dapp:125` | if minted |

**Constraints:** No secrets in attributes; `title` ≤128 bytes; `creator_handle` validated `Ident32` charset if used as Ident32 elsewhere; `phash` hex `string`.

> **Attributes are public and permanent — including `title`.**
> "No secrets in attributes" is a constraint of the mechanism, not a design goal: an attribute is
> on-chain, readable by anyone, and there is no way today for a publisher to keep one private. For a
> gated archive that means the subject (`title`), the topic (`tags`, `category`), the length
> (`duration`), the publishing address and the gate are all legible while the content stays sealed.
>
> The split that matters:
>
> - **`title` and the descriptive set are the gap.** `title` is required and public, so a reader who
>   cannot decrypt anything can still read the table of contents. Nothing prevents encrypting it — an
>   attribute slot holds bytes — beyond a length budget: AES-GCM plus base64 inside a 128-byte
>   `ATTR_STRING` leaves roughly 68 characters. `tags`, `category`, `language` and `source_uri` are in the
>   same position, and `source_uri` is sometimes an internal URL.
> - **The gate attributes are public *by design*.** `gate_token` / `gate_chain` / `gate_threshold` in the
>   clear make the co-membership graph computable from public chain state — which is the protocol's only
>   discovery mechanism once descriptive metadata is encrypted, and the basis for "holders of this also
>   hold that" recommendation that requires no server and no tracking. Do not blind these; a future
>   revision that hides them removes discovery.
>
>   Addresses are pseudonyms, not identities — Haven publishes no identity — so the accurate description
>   of the cost is *linkability*, not deanonymisation. What keeps the public graph from becoming
>   behavioural surveillance is that Haven records **no view events on any surface**: the graph states who
>   can read what, never who read what.
> - **`encrypted_cid` stays as it is.** A stable unique identifier is a functional requirement — dedup,
>   idempotent republication, lookup without revealing the plaintext CID — and this field provides it. Its
>   correlation property is an accepted cost of uniqueness, not a defect.
>
> There is currently **no member-visible-but-not-public tier**, so a publisher who needs a private title
> has no mechanism and no warning. A proposal for tiered metadata (public / member / private, using the
> Haven-AOL v3 epoch key for the middle tier) is in
> `haven-mobile/planning/ECOSYSTEM-SPEC-GAPS.md` item 0 (internal). Until it lands, treat every attribute
> as a published statement about sealed content.

### Private Payload (`ArkivPayload` — base64-encoded JSON in `Operation.payload`, decrypted via `haven-aol` VetKD)

See `haven-dapp/src/types/arkiv.ts:194–259`. MIME `contentType = application/json` (entity `Mime128`). Field `snake_case` per storage format.

| JSON key | Type | Required | Notes |
|---|---|---|---|
| `filecoin_root_cid` | `string` | If not encrypted | direct CID |
| `encrypted_cid` | `string` | If encrypted | duplicate of attr for convenience after decrypt |
| `cid_hash` | `string` | Optional | dedup hash |
| `cid_encryption_metadata` | `GateMetadataJson` | If CID encrypted | per-CID gate |
| `encryption_metadata` | `string|object` | If encrypted | `GateMetadataJson` (v1) / `GateMetadataV3Json` (v3 `epoch`); `haven-aol` `accessol_v1/v3` |
| `is_encrypted: boolean` | `boolean` | **Yes** | must match `is_encrypted` attr |
| `description` | `string` | Optional | longer than attr (no 128 limit) |
| `thumbnail_cid` | `string` | Optional | **unread** — specified here, read by no surface, written by no pipeline. Treat as absent until a writer exists. |
| `duration` | `number` | Optional | **read** (`parse-arkiv-video.ts` → `Video.duration`); seconds, mirror attr |
| `creator_handle` | `string` | Optional | mirror attr |
| `source_uri` | `string` | Optional | mirror attr |
| `vlm_json_cid` | `string` | Optional | VLM analysis JSON CID |
| `codec_variants` | `ArkivCodecVariant[]` | Optional | adaptive `codec: av1/h264/vp9/hevc`, `cid`, `bitrate`, `resolution`, `qualityScore` |
| `segment_metadata` | `ArkivSegmentMetadata` | Optional | multi-segment recordings |

**Invariants:** `payload.is_encrypted == (attributes.is_encrypted==1)`; if `is_encrypted`, `payload` must contain `encryption_metadata` (v1 or v3) and `cid` must be encrypted (no `filecoin_root_cid` in clear). `haven-mobile` `MediaKind VIDEO/AUDIO/IMAGE/PDF` derived from `contentType` + payload/file.

### Keys the implementation reads that this document omitted

Found by diffing `parse-arkiv-video.ts` and `community-feed.ts` against the tables above. All are
**read** — a consumer written from this document alone would have missed them.

| Key | Where | Read by | Notes |
|---|---|---|---|
| `piece_cid` | payload | `parse-arkiv-video.ts` → `Video.pieceCid` | The FOC piece handle. Absent from both tables above, and the only way a client locates content in the cache layer. |
| `content_mime_type` | payload | `parse-arkiv-video.ts` → `Video.contentMimeType` | Distinct from the entity's `Mime128 contentType`, which is `application/json` for the payload itself. This is the *media's* type, and what viewer dispatch keys off. |
| `original_hash` | payload | `parse-arkiv-video.ts` | Pre-encryption content hash. |
| `has_ai_data` | payload | `parse-arkiv-video.ts` | Boolean, also inferred from the presence of `vlm_json_cid`. |
| `expires_at_block` | payload | `parse-arkiv-video.ts` → `Video.expiresAtBlock` | Entity expiry, compared against head to decide staleness. Not the same as the container's `btl`. |
| `created_at_block` | payload | `parse-arkiv-video.ts` via `arkiv-recency` | Canonical recency key — preferred over the `created_at` string. |
| `gate_token`, `gate_chain`, `gate_threshold` | **attributes** | `community-feed.ts` `discoverUserCommunities` | The gate condition, queryable on-chain. This is what makes community discovery possible at all, and it is missing from the attribute table above. `gate_chain` values are Haven canonical names (`EthMainnet`, `BaseMainnet`, `ArbitrumOne`, `OptimismMainnet`, `EthSepolia`) — see `haven-aol-client.ts`. |

### Fields consumers expect that are not entity data

| Field | Reality |
|---|---|
| `arkiv_status` | Hard-coded to `'active'` by `parse-arkiv-video.ts`. Liveness is derived from `expires_at_block`, not stored. |
| cache/residency state, last-accessed | Per-device local state. Never on the entity. |
| file name, file extension | Not stored. Derive from `content_mime_type`, or from the tail of `source_uri`. |
| byte size | Not stored anywhere in this spec. `PieceRef.size` from the FOC layer is the size of record; until a piece is resolved, a consumer has no size to show. |
| provider list, CDN flag, trustless gateways | FOC's own resolution, not index data. A provider list published in an index goes stale and sends fetches at the wrong hosts. |
| thumbnail | `thumbnail_cid` is specified below but **unread and unwritten**. See the gaps note. |

## Cross-surface mapping

- **arkiv-chain** `arkiv_entitydb` stores `payload` as `bytes` + attributes as `Ident32` array; query via `arkiv_query` (`eq("title", ...)`, SDK `createPublicClient` `braga` @ `NEXT_PUBLIC_ARKIV_RPC_URL`).
- **haven-dapp** `ArkivEntity` (`key`/`owner`/`attributes`/`payload` base64/`contentType`/`createdAt`) → `Video` (`id`, `owner`, `createdAt`, `createdAtBlock` canonical), `VideoSourceInfo` (`mimeType`, `fileName`, `fileSize`, `codecVariant`), `CodecVariant`.
- **haven-cli** `media/metadata` (`VideoTechnicalMetadata`, `detect_mime_type`, `extract_video_duration`) → writes same keys; `phash`/`thumbnail` pipelines feed `payload`.
- **haven-mobile** `MediaKind` enum maps `contentType`/`mime` to inline player vs generic download.

## Validation

* Precompile rejects `Ident32InvalidByte`/`AttributeValueMalformed`/`AttributeStringInvalidByte` (wordIndex/position) — SDK must use correct `valueType`/`value[0]` shape.
* Future `corbell spec review` constraint: `media-attributes: all media entities must include title + is_encrypted + matching payload.is_encrypted` — to be added as `reliability` constraint in next spec.

## Change log

2026-08-15 — trued up against the implementation. Added the implementation-of-record note, the seven
keys the code reads that this document omitted (`piece_cid`, `content_mime_type`, `original_hash`,
`has_ai_data`, `expires_at_block`, `created_at_block`, and the `gate_*` attribute triple), and a table
of fields consumers expect that are not entity data (status, cache state, filename, size, provider
list, thumbnail). Marked `thumbnail_cid` **unread**. Recorded the metadata split: `title` and the
descriptive set are public with no private option, which is the gap; the `gate_*` attributes are public
**by design** because the co-membership graph they enable is the protocol's discovery and recommendation
mechanism, and it works without a server or view tracking; `encrypted_cid` stays as-is because uniqueness
is a functional requirement. Found while porting `haven-mobile`'s parser, which had been reading five
non-existent fields and requiring three that always throw. Gaps and proposed fixes, including a
tiered-metadata proposal: `haven-mobile/planning/ECOSYSTEM-SPEC-GAPS.md` (internal).

2026-08-13 — extracted from `haven-dapp/src/types/arkiv.ts` (ArkivAttributes 13 keys) + `ArkivPayload` (13 keys) + `EntityRegistry.sol` container; decoupled intent — this doc is the single source for media keys. Next: add `thumbnail_cid`/`duration` parity check in CI (`havendapp type-check` + `corbell spec lint`).
