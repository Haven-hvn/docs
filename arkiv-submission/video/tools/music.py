#!/usr/bin/env python3
"""
Synthesizes the ambient bed for the Haven film. Standard library only — there is
no music model in this environment, so this is additive synthesis written by hand.

Design intent: this must sit *under* narration and never compete with it. So it is
a slow drone in D minor with a sparse bell figure, no percussion, no rhythm that
could pull attention, and a long fade at both ends. Anything more assertive would
make a protocol pitch feel like a product trailer.
"""
import math
import struct
import sys
import wave

SR = 48_000
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 77.0
ROOT = 73.416  # D2


def env(t, dur, attack, release):
    """Linear attack / release envelope."""
    if t < attack:
        return t / attack
    if t > dur - release:
        return max(0.0, (dur - t) / release)
    return 1.0


def synth():
    n = int(SR * DUR)
    buf = [0.0] * n

    # ── Drone: root, octave, fifth. Slight detune per partial so the stack
    #    breathes instead of sitting perfectly still.
    partials = [
        (1.0, 0.30, 0.00),   # root
        (2.0, 0.16, 0.13),   # octave
        (3.0, 0.10, 0.07),   # fifth above that
        (4.0, 0.05, 0.21),   # two octaves
        (6.0, 0.03, 0.11),
    ]
    for mult, amp, detune in partials:
        f = ROOT * mult + detune
        # Each partial swells on its own slow cycle, so the pad evolves.
        lfo_rate = 0.028 + mult * 0.006
        for i in range(n):
            t = i / SR
            swell = 0.72 + 0.28 * math.sin(2 * math.pi * lfo_rate * t + mult)
            buf[i] += amp * swell * math.sin(2 * math.pi * f * t)

    # ── Sparse bell figure: D, F, A, C — the minor seventh, arriving slowly.
    #    Struck notes with long decay, placed to breathe around the narration
    #    rather than land on it.
    # Placed as fractions of the run so a re-cut does not bunch them at the front.
    bells = [(f * DUR, i) for f, i in (
        (0.08, 4), (0.23, 6), (0.38, 3), (0.50, 7),
        (0.61, 4), (0.75, 6), (0.88, 3),
    )]
    scale = [587.33, 698.46, 880.00, 1046.50]  # D5 F5 A5 C6
    for start, idx in bells:
        f = scale[idx % len(scale)]
        length = 5.5
        s0 = int(start * SR)
        for i in range(int(length * SR)):
            if s0 + i >= n:
                break
            t = i / SR
            decay = math.exp(-t * 0.85)
            # Bell timbre: fundamental plus a quiet inharmonic partial.
            v = math.sin(2 * math.pi * f * t) * 0.055
            v += math.sin(2 * math.pi * f * 2.76 * t) * 0.012
            buf[s0 + i] += v * decay

    # ── Air: filtered noise substitute built from slow beating sines, to avoid
    #    needing an RNG-heavy noise floor that would encode badly at low bitrate.
    for k, f in enumerate((2100.0, 3300.0, 4700.0)):
        for i in range(n):
            t = i / SR
            drift = math.sin(2 * math.pi * (0.013 + k * 0.004) * t)
            buf[i] += 0.006 * drift * math.sin(2 * math.pi * (f + drift * 6) * t)

    # ── Master envelope and soft clip
    peak = max(abs(v) for v in buf) or 1.0
    out = bytearray()
    for i, v in enumerate(buf):
        t = i / SR
        v = v / peak * 0.5 * env(t, DUR, 4.0, 7.0)
        v = math.tanh(v * 1.15)          # gentle saturation, no hard edges
        s = int(max(-1.0, min(1.0, v)) * 32767)
        out += struct.pack('<hh', s, s)  # stereo, identical channels
    return bytes(out)


with wave.open('/tmp/haven-audio/music.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(synth())

print(f'music.wav written — {DUR:.0f}s, D minor drone with sparse bell figure')
