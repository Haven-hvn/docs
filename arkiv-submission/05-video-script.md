# Video — script and production

**Delivered: `video/haven-arkiv-ideathon.mp4` — 92 s, 1280×800, h264 + AAC, 13 MB.**

The middle of this film is about **what shape Haven chose**, not about how Arkiv works. Two
earlier cuts got this wrong in opposite directions: the first spent its time on Filecoin
tonnage, the second explained Arkiv's precompile, primitive types and operation codes back to
the people who wrote them. Neither is the submission. What a judge cannot know without being
told is which attributes Haven indexes, which it deliberately refuses to index, and which
surfaces depend on the index at all.

---

### 0:00 – 0:11 · The premise

> "Haven is a protocol for community-owned archives. The premise is that a community's back
> catalogue should outlive the platform that hosted it. So the asset a member already owns is
> what opens it."

*Home page. "Ownership is the only password." The footer names four networks with **Arkiv
first** — the index, `0x4400…0044`, marked `INDEX PENDING`.*

An earlier cut opened on "there is nothing to join." That was cut deliberately: it is a
negation, so it describes what Haven omits rather than what it is for — and it works against a
submission whose entire purpose is making archives *discoverable*.

---

### 0:15 – 0:30 · The five attributes Haven indexes

> "Haven indexes five attributes and nothing more. Title, whether it is encrypted, duration,
> creator handle, and the pointer to the ciphertext. Everything bulky goes in the payload,
> because an attribute you cannot filter on is an index wasted."

*Codex II.03, Media specialisation: `title`, `is_encrypted`, `duration`, `creator_handle`,
`encrypted_cid` — with type and whether each is required. Then the payload line naming what is
kept out: `encryption_metadata`, `codec_variants`, `segment_metadata`, `thumbnail_cid`.*

This is the whole schema discipline in one table: index what you filter on, and put everything
else where it cannot pretend to be queryable.

---

### 0:31 – 0:44 · One shape, four transcriptions

> "The shape is written once, then transcribed by hand into four languages. No shared package.
> It costs duplication, and buys shipping a mobile release without coordinating a version with
> a canister upgrade."

*ADR-001. Defined in `EntityRegistry.sol`, transcribed into Rust, TypeScript, Python and
Kotlin, with no generated bindings — and the cost stated plainly beside the benefit.*

---

### 0:45 – 0:55 · Who reads the index, and who deliberately does not

> "And only two of the five surfaces read the index at all. The gate deliberately has no Arkiv
> dependency, which is why keys still derive today while the index is offline."

*`haven-dapp` and `haven-cli` speak to Arkiv; `haven-mobile` reads the dapp's cache; `haven-aol`
has no Arkiv dependency at all. A decision made before the outage that is the reason the outage
is survivable.*

---

### 1:02 – 1:14 · What the missing index costs

> "But here is what the missing index costs. These byte totals are real. The line beneath them
> says the attribution is a placeholder. We can prove the bytes exist, and we cannot say whose
> they are."

*The Atlas measured by stored bytes, inspector open, cursor tracing the admission.*

---

### 1:16 – 1:31 · The four entities

> "So we propose four entities in the shape Haven already uses. An archive at a hundred and
> eighty days, its pieces beside it, an entitlement that lapses in forty-eight hours so access
> cannot outlive ownership, and an attribution that names the uploader's community."

*The telemetry strip: five chains reporting block heights and latencies, and **`ARKIV —`** with
nothing to report.*

---

## Production

No screen-capture app, so the take is deterministic and regenerable after any site change.

- `video/tools/record.mjs` drives Chrome's CDP `Page.startScreencast` directly and writes JPEG
  frames plus a concat manifest carrying real per-frame durations. Playwright's `recordVideo`
  was not used: it depends on a bundled ffmpeg the OS refused to execute, and it only emits
  webm, costing a lossy generation on the way to mp4.
- Every beat is wrapped so one failure cannot cost the take, and the granted/heading beats
  **assert** they are clear of the sticky masthead before filming.
- `video/tools/music.py` synthesizes the bed with the standard library alone — a D-minor drone,
  five detuned partials on independent swell cycles, a sparse bell figure on the minor seventh
  placed as fractions of the run so a re-cut cannot bunch them. No percussion, nothing that
  competes with speech.
- Narration is macOS `say` (**Daniel**, 174 wpm) as six cues at measured offsets, so each line
  lands on the shot it describes.
- Mixed with ffmpeg: narration +1.25, music 0.13 (**≈13 dB under speech**, measured), limiter
  at 0.94.

Verified on the delivered file: speech present in all six windows at −19 to −21 dB, tail faded
to −53 dB, peak −1.3 dB, no clipping.

## Three bugs filming exposed

1. **Telemetry lane labels overlapped at 1280×800** — `.atlas-telemetry` made the network group
   the flexible column, squeezing six lanes into 263 px so their labels, which have an
   irreducible width, overflowed into each other. The storage note is prose and can wrap; lanes
   cannot. Reallocated to `auto minmax(0,1fr) auto` with `flex: 0 0 auto` on lanes. Verified
   clean at 1280 / 1440 / 1680. This was live on the site.
2. **The sticky masthead covered the eligibility results** — `scrollIntoViewIfNeeded` parks its
   target under a `position: sticky` header. Now offset by the masthead's measured height.
3. **The encoder silently compressed the film** — Chrome only emits screencast frames on
   change, so a static Codex page can go seconds between frames. A per-frame duration clamp of
   0.5 s turned 84 s of walkthrough into 51 s of video. The clamp is now 15 s, raw timestamps
   are persisted so a re-cut never needs a re-record, and the recorder **asserts manifest total
   matches captured span** rather than leaving it to be noticed by eye.
