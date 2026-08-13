# Haven Shared Entity Shape (Arkiv → Haven)

> Source of truth copy for reference — **do not edit** except to sync with `arkiv-op-reth/contracts/src/EntityRegistry.sol` (precompile `0x44…0044`). The Haven ecosystem (`haven-dapp`, `haven-cli`, `haven-mobile`, `haven-aol`) must use this shape verbatim; no divergent TS/Python/Rust re-definitions.

See full media key specialization in `entities/MEDIA_CONTENT_SPEC.md` (this file = container, that file = standardized media keys).

## Solidity UDVTs + errors (verbatim)

```
type BlockNumber32 is uint32;          // distinct for btl / expiresAt
type Ident32 is bytes32;               // ≤32 bytes, left-aligned, lowercase-ASCII a-z0-9_./- valid, left-padded zero, validated in precompile
error Ident32Empty();
error Ident32InvalidByte(uint256 position, bytes1 value);
struct Mime128 { bytes32[4] data; }   // 128-byte MIME, 4×bytes32, validated
```

## Attribute container

```
library Entity {
  uint8 constant ATTR_UINT = 1;        // value[0] only, remaining words zero
  uint8 constant ATTR_STRING = 2;      // 128-byte, zero-padded, no embedded null-after-zero (AttributeStringInvalidByte)
  uint8 constant ATTR_ENTITY_KEY = 3; // value[0] only
  struct Attribute { Ident32 name; uint8 valueType; bytes32[4] value; }
  struct Operation { uint8 operationType (1 CREATE..6 EXPIRE/UNINITIALIZED=0); bytes32 entityKey; bytes payload; Mime128 contentType; Attribute[] attributes; BlockNumber32 btl; address newOwner; }
  error AttributeValueMalformed(bytes32 name, uint8 valueType, uint256 wordIndex);
  error AttributeStringInvalidByte(bytes32 name, uint256 position, bytes1 value);
  error EmptyBatch(); error InvalidOpType(uint8); error ZeroBtl(); error EntityNotFound(bytes32); error NotOwner(...); error EntityExpired(...); error ExpiryNotExtended(...); error TransferToZeroAddress(...); error TransferToSelf(...); error EntityNotExpired(...);
}
interface IEntityRegistry {
  function nonces(address) external view returns (uint32);
  function execute(Entity.Operation[] calldata) external; // atomic batch, emits EntityOperation per op, entityHash=bytes32(0) reserved
  event EntityOperation(bytes32 indexed entityKey, uint8 indexed operationType, address indexed owner, ...);
}
```

SDK stores as `ArkivSdkAttribute { key:string; value:string|number }` (snake_case) → on-chain `Ident32` after charset check. Keep TS `ArkivAttributes`/`ArkivSdkEntity` in `haven-dapp/src/types/arkiv.ts` as thin view over this, not a second definition.

## Haven mapping (shared, decoupled but consistent)

* **arkiv-chain** `crates/arkiv-entitydb` — precompile decode, system-account nonces/counter, `arkiv_query` interpreter.
* **haven-dapp** `src/types/arkiv.ts` `ArkivEntity` (`key`/`owner`/`attributes`/`payload` base64/`contentType`) → `Video` (`id: ArkivEntity.key`, `createdAtBlock` canonical for ordering, not `createdAt` string).
* **haven-cli** `haven_cli/media` → same `Ident32` names on write.
* Sync rule: any new `Ident32` key (e.g. for media) must be added here + `MEDIA_CONTENT_SPEC.md` first, then SDK/TS/Python/Rust consume — no per-repo ad-hoc keys.

Linked in `docs/README.md` stack and `architecture/00-platform-overview.md` shared-contract note.
