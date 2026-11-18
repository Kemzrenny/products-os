import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeTranscript } from "../lib/meetings-merge";

const seg = (track: string, speaker: string | null, startSec: number, text: string, status = "DONE") => ({ track, speaker, startSec, text, status });

test("room recordings join in order with a time mark per part", () => {
  const t = mergeTranscript([seg("", null, 120, "Second part"), seg("", null, 0, "First part")]);
  assert.equal(t, "[0:00]\nFirst part\n[2:00]\nSecond part");
});

test("call tracks interleave by time, with names on every line", () => {
  const t = mergeTranscript([
    seg("u1", "Tolu", 0, "[0:05] Morning all.\n[1:10] I'll share the estimates today."),
    seg("u2", "Samson", 0, "[0:30] Google recording is done.\nZoom is still blocked."),
    seg("u1", "Tolu", 120, "[0:15] One more thing on the homepage."),
  ]);
  assert.equal(
    t,
    ["[0:05] Tolu: Morning all.", "[0:30] Samson: Google recording is done. Zoom is still blocked.", "[1:10] Tolu: I'll share the estimates today.", "[2:15] Tolu: One more thing on the homepage."].join("\n"),
  );
});

test("lines without a time mark keep the part's start; failed and empty parts are skipped", () => {
  const t = mergeTranscript([seg("u3", "Jake", 240, "Sentry is on staging."), seg("u1", "Tolu", 0, "", "DONE"), seg("u2", "Samson", 0, "x", "FAILED")]);
  assert.equal(t, "[4:00] Jake: Sentry is on staging.");
});

test("hour-long calls: h:mm:ss marks", () => {
  assert.equal(mergeTranscript([seg("u1", "Tolu", 3600, "[0:01:05] Late point.")]), "[61:05] Tolu: Late point.");
});
