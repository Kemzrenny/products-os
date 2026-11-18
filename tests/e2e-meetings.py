# Meetings end to end, with AI_FAKE=1: paste a transcript, record with a fake mic,
# upload a recording, approve the proposed updates and check the logs.
import sys, time
from playwright.sync_api import sync_playwright
B = "http://localhost:3100"
errors = []
def step(msg): print("·", msg, flush=True)
def shot(p, name): p.screenshot(path=f"/tmp/shots/{name}.png", full_page=True)

TRANSCRIPT = """Tolu: I finished the flashcards and the audio reader on Cubbes Web. The homepage is next, two days once I start. I'll share the remaining components and estimates in the channel today.
Samson: Google recording is done and pushed. Website homepage is blocked, waiting on credentials from Emmanuel.
Jake: Sentry is configured on staging. I'll compare it with Datadog this week.
Joshua: We agreed to ship the homepage first, then account components."""

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
    ctx = br.new_context(viewport={"width": 1366, "height": 860}, permissions=["microphone"])
    p = ctx.new_page()
    p.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
    p.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    email = f"lead{int(time.time())}@cubbes.test"
    step("signup"); p.goto(B + "/signup")
    p.fill("#name", "Joshua Olawunmi"); p.fill("#email", email); p.fill("#password", "password123")
    p.click("button:has-text('Create account')"); p.wait_for_url("**/onboarding")
    p.fill("#org", "Cubbes"); p.fill("#vision", "Every student learns with the right tools."); p.fill("#product", "Cubbes Web")
    p.click("button:has-text('Create organisation')"); p.wait_for_url("**/app/import?welcome=1")

    step("initiative"); p.goto(B + "/app/initiatives/new")
    p.fill("input[name=title]", "Website homepage"); p.click("button:has-text('Add to roadmap')"); p.wait_for_url("**/app/initiatives/**")

    step("empty meetings"); p.goto(B + "/app/meetings"); p.wait_for_selector("text=No meetings yet")

    step("paste transcript")
    p.goto(B + "/app/meetings/new?source=paste")
    p.fill("input[name=title]", "Products and Engineering standup"); p.fill("textarea[name=attendees]", "Tolu, Samson, Jake, Joshua")
    p.click("button:has-text('Continue')"); p.wait_for_url("**/app/meetings/*")
    p.fill("textarea[name=transcript]", TRANSCRIPT); p.click("button:has-text('Write the notes')")
    p.wait_for_selector("text=Updates by person and workstream", timeout=60000)
    p.wait_for_selector("text=Proposed updates")
    shot(p, "m1-notes")
    assert p.locator("input[name=task]").count() >= 2, "expected proposed tasks"
    assert p.locator("input[name=blocker]").count() >= 1, "expected a blocker"
    assert p.locator("input[name=status]").count() == 1, "expected the homepage to go to Blocked"
    meeting_url = p.url
    # Untick the second task, rename the first.
    p.locator("input[name=task]").nth(1).uncheck()
    p.locator("[name='taskTitle-0']").fill("Share remaining components and estimates")
    p.click("button:has-text('Apply selected updates')"); p.wait_for_selector("text=Updates applied", timeout=30000)
    p.wait_for_selector("text=Tasks from this meeting (1)")
    p.wait_for_selector("text=Share remaining components and estimates")
    shot(p, "m2-applied")

    step("roadmap shows blocked"); p.goto(B + "/app/roadmap"); p.wait_for_selector("text=Website homepage")
    step("blockers log + command centre")
    p.goto(B + "/app/meetings"); p.wait_for_selector("text=Blockers (1)"); shot(p, "m3-list")
    p.goto(B + "/app"); p.wait_for_selector("text=Open blockers")
    p.goto(B + "/app/meetings?log=decisions"); p.wait_for_selector("text=We agreed to ship the homepage first")

    step("copy + day view")
    p.goto(meeting_url); p.wait_for_selector("button:has-text('Copy notes')")
    p.click("a:has-text('Day view')"); p.wait_for_url("**/app/meetings/day/*"); p.wait_for_selector("text=Copy the day"); shot(p, "m4-day")

    step("next day standup: follow-up closes the earlier task and clears the blocker")
    p.goto(B + "/app/meetings/new?source=paste")
    p.click("button:has-text('Continue')"); p.wait_for_url("**/app/meetings/*")
    p.fill("textarea[name=transcript]", "Tolu: I finished share remaining components and estimates, it's in the channel.\nSamson: Credentials came through, homepage is unblocked.")
    p.click("button:has-text('Write the notes')"); p.wait_for_selector("text=Proposed updates", timeout=60000)
    assert p.locator("input[name=close]").count() == 1, "expected the earlier task to be proposed for closing"
    p.click("button:has-text('Apply selected updates')"); p.wait_for_selector("text=Updates applied", timeout=30000)

    step("record with fake mic")
    p.goto(B + "/app/meetings/new")
    p.click("button:has-text('Continue')"); p.wait_for_url("**/app/meetings/*")
    p.click("button:has-text('Record this room')"); p.wait_for_selector("text=Recording")
    time.sleep(6)
    p.click("button:has-text('Stop')")
    p.wait_for_selector("[aria-label=Done]", timeout=60000)
    shot(p, "m5-recorded")
    p.click("button:has-text('Write the notes')"); p.wait_for_selector("text=Updates by person and workstream", timeout=60000)

    step("upload a recording (2.5 min → 2 parts)")
    p.goto(B + "/app/meetings/new?source=upload")
    p.click("button:has-text('Continue')"); p.wait_for_url("**/app/meetings/*")
    p.set_input_files("input[type=file]", "/tmp/media/standup.wav")
    p.wait_for_function("document.querySelectorAll('[aria-label=Done]').length >= 2", timeout=90000)
    p.click("button:has-text('Write the notes')"); p.wait_for_selector("text=Updates by person and workstream", timeout=60000)
    p.wait_for_selector("text=Show the transcript")

    step("mobile"); m = br.new_context(viewport={"width": 390, "height": 844}, storage_state=ctx.storage_state()).new_page()
    m.goto(meeting_url); m.wait_for_selector("text=Updates by person and workstream")
    w = m.evaluate("document.documentElement.scrollWidth"); assert w <= 392, f"mobile overflow {w}"
    shot(m, "m6-mobile")
    br.close()

errs = [e for e in errors if "favicon" not in e]
print("ERRORS:", errs or "none")
sys.exit(1 if errs else 0)
