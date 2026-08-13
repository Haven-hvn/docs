# Haven Media Content — Shared Attribute & Payload Spec

> **Shared contract** for all Haven surfaces (`arkiv-chain` Entity + `haven-dapp`/`haven-cli`/`haven-mobile`). Decoupled services must not re-define keys. Source of truth: `haven-dapp/src/types/arkiv.ts` (`ArkivAttributes` + `ArkivPayload`) + `EntityRegistry.sol` container (`Ident32`/`Mime128`/`Attribute`). Canonical chain: `arkiv-op-reth` `0x44…0044`.

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
| `thumbnail_cid` | `string` | Optional | Filecoin CID/URL |
| `duration` | `number` | Optional | seconds, mirror attr |
| `creator_handle` | `string` | Optional | mirror attr |
| `source_uri` | `string` | Optional | mirror attr |
| `vlm_json_cid` | `string` | Optional | VLM analysis JSON CID |
| `codec_variants` | `ArkivCodecVariant[]` | Optional | adaptive `codec: av1/h264/vp9/hevc`, `cid`, `bitrate`, `resolution`, `qualityScore` |
| `segment_metadata` | `ArkivSegmentMetadata` | Optional | multi-segment recordings |

**Invariants:** `payload.is_encrypted == (attributes.is_encrypted==1)`; if `is_encrypted`, `payload` must contain `encryption_metadata` (v1 or v3) and `cid` must be encrypted (no `filecoin_root_cid` in clear). `haven-mobile` `MediaKind VIDEO/AUDIO/IMAGE/PDF` derived from `contentType` + payload/file.

## Cross-surface mapping

- **arkiv-chain** `arkiv_entitydb` stores `payload` as `bytes` + attributes as `Ident32` array; query via `arkiv_query` (`eq("title", ...)`, SDK `createPublicClient` `braga` @ `NEXT_PUBLIC_ARKIV_RPC_URL`).
- **haven-dapp** `ArkivEntity` (`key`/`owner`/`attributes`/`payload` base64/`contentType`/`createdAt`) → `Video` (`id`, `owner`, `createdAt`, `createdAtBlock` canonical), `VideoSourceInfo` (`mimeType`, `fileName`, `fileSize`, `codecVariant`), `CodecVariant`.
- **haven-cli** `media/metadata` (`VideoTechnicalMetadata`, `detect_mime_type`, `extract_video_duration`) → writes same keys; `phash`/`thumbnail` pipelines feed `payload`.
- **haven-mobile** `MediaKind` enum maps `contentType`/`mime` to inline player vs generic download.

## Validation

* Precompile rejects `Ident32InvalidByte`/`AttributeValueMalformed`/`AttributeStringInvalidByte` (wordIndex/position) — SDK must use correct `valueType`/`value[0]` shape.
* Future `corbell spec review` constraint: `media-attributes: all media entities must include title + is_encrypted + matching payload.is_encrypted` — to be added as `reliability` constraint in next spec.

## Change log

2026-08-13 — extracted from `haven-dapp/src/types/arkiv.ts` (ArkivAttributes 13 keys) + `ArkivPayload` (13 keys) + `EntityRegistry.sol` container; decoupled intent — this doc is the single source for media keys. Next: add `thumbnail_cid`/`duration` parity check in CI (`havendapp type-check` + `corbell spec lint`).
