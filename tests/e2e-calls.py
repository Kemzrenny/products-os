# In-app calls without a LiveKit server (AI_FAKE=1; LIVEKIT_* set to test values):
# join tokens, two people's own-mic parts merged into one named transcript, end call, notes.
import sys, time, json, base64, subprocess
from playwright.sync_api import sync_playwright
B = "http://localhost:3100"
DB = "postgresql://pos:pos@localhost:5432/productsos"
errors = []
def step(msg): print("·", msg, flush=True)
def shot(p, name): p.screenshot(path=f"/tmp/shots/{name}.png", full_page=True)
def sql(q): return subprocess.run(["psql", DB, "-tAc", q], capture_output=True, text=True, check=True).stdout.strip()
def watch(p):
    p.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" and "livekit" not in m.text.lower() and "websocket" not in m.text.lower() and "Failed to load resource" not in m.text else None)
    p.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

def signup(br, name, email, org):
    ctx = br.new_context(viewport={"width": 1366, "height": 860}, permissions=["microphone"])
    p = ctx.new_page(); watch(p)
    p.goto(B + "/signup"); p.fill("#name", name); p.fill("#email", email); p.fill("#password", "password123")
    p.click("button:has-text('Create account')"); p.wait_for_url("**/onboarding")
    p.fill("#org", org); p.fill("#vision", "Test"); p.fill("#product", "Cubbes Web")
    p.click("button:has-text('Create organisation')"); p.wait_for_url("**/app/import?welcome=1")
    return ctx, p

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
    n = int(time.time())
    step("two people in one workspace")
    a_ctx, a = signup(br, "Joshua Olawunmi", f"josh{n}@cubbes.test", "Cubbes")
    b_ctx, b = signup(br, "Tolu Bakare", f"tolu{n}@cubbes.test", f"Tolu scratch {n}")
    org = sql(f"select m.\"organisationId\" from \"Member\" m join \"User\" u on u.id=m.\"userId\" where u.email='josh{n}@cubbes.test'")
    tolu = sql(f"select id from \"User\" where email='tolu{n}@cubbes.test'")
    sql(f"insert into \"Member\" (id, \"organisationId\", \"userId\", role) values (gen_random_uuid(), '{org}', '{tolu}', 'CONTRIBUTOR')")
    b_ctx.add_cookies([{"name": "pos_org", "value": org, "url": B}])

    step("start a call")
    a.goto(B + "/app/meetings"); a.click("a:has-text('Start a call')"); a.wait_for_url("**/app/meetings/new?source=call")
    a.fill("input[name=title]", "Products and Engineering standup"); a.click("button:has-text('Start the call')")
    a.wait_for_url("**/call"); a.wait_for_selector("button:has-text('Join call')")
    mid = a.url.split("/meetings/")[1].split("/")[0]
    shot(a, "c1-lobby")

    step("join token")
    j = a.evaluate(f"fetch('/api/meetings/{mid}/join', {{method:'POST'}}).then(r => r.json())")
    payload = json.loads(base64.urlsafe_b64decode(j["token"].split(".")[1] + "=="))
    assert payload["video"]["room"] == f"meeting-{mid}" and payload["video"]["roomJoin"] and payload["name"] == "Joshua Olawunmi", payload
    jb = b.evaluate(f"fetch('/api/meetings/{mid}/join', {{method:'POST'}}).then(r => r.json())")
    assert jb["callStartedAt"] == j["callStartedAt"], "call clock must be set once"
    verify = subprocess.run(["node", "-e", f"const {{TokenVerifier}}=require('livekit-server-sdk');new TokenVerifier('devkey','{'secret' * 6}').verify('{jb['token']}').then(c=>console.log(c.sub))"], capture_output=True, text=True, cwd="/home/claude/products-os")
    assert verify.stdout.strip() == tolu, verify.stderr

    step("joining without a server fails cleanly")
    a.click("button:has-text('Join call')"); a.wait_for_selector("p.bg-bad-soft", timeout=60000)
    print("  error shown:", a.locator("p.bg-bad-soft").inner_text())

    step("each person uploads their own mic")
    up = """async ([mid, idx, start]) => {
      const fd = new FormData();
      fd.append('audio', new Blob([new Uint8Array(6000)], {type: 'audio/webm'}), 'p.webm');
      fd.append('index', idx); fd.append('startSec', start); fd.append('durationSec', '120'); fd.append('track', 'self');
      const r = await fetch(`/api/meetings/${mid}/segments`, {method: 'POST', body: fd}); return r.status; }"""
    assert a.evaluate(up, [mid, "0", "0"]) == 200
    assert b.evaluate(up, [mid, "0", "2"]) == 200
    assert a.evaluate(up, [mid, "1", "120"]) == 200
    tracks = sql(f"select count(distinct track) from \"MeetingSegment\" where \"meetingId\"='{mid}'")
    assert tracks == "2", tracks

    step("meeting page: speakers, end call, notes")
    a.goto(B + f"/app/meetings/{mid}"); a.wait_for_selector("text=Tolu Bakare"); shot(a, "c2-panel")
    a.on("dialog", lambda d: d.accept())
    a.click("button:has-text('End call for everyone')"); a.wait_for_selector("text=The call has ended.")
    a.click("button:has-text('Write the notes')")
    try: a.wait_for_selector("text=Updates by person and workstream", timeout=60000)
    except Exception: shot(a, "c-fail"); raise
    a.click("summary:has-text('Show the transcript')")
    t = a.locator("pre").inner_text()
    assert "Joshua Olawunmi: " in t and "Tolu Bakare: " in t, t
    # Joshua's part started at 0s, Tolu's at 2s: their lines interleave by time.
    assert t.index("[0:12] Joshua Olawunmi:") < t.index("[0:14] Tolu Bakare:") < t.index("[0:55] Joshua Olawunmi:"), t
    shot(a, "c3-notes")

    step("ended call page")
    a.goto(B + f"/app/meetings/{mid}/call"); a.wait_for_selector("text=This call has ended")
    br.close()

errs = [e for e in errors if "favicon" not in e]
print("ERRORS:", errs or "none")
sys.exit(1 if errs else 0)
