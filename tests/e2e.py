import re, sys, time
from playwright.sync_api import sync_playwright, expect
B = "http://localhost:3100"
errors = []
def shot(p, name, full=True): p.screenshot(path=f"/tmp/shots/{name}.png", full_page=full)
def step(msg): print("·", msg, flush=True)

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx = br.new_context(viewport={"width": 1366, "height": 860})
    p = ctx.new_page()
    p.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
    p.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    step("landing"); p.goto(B + "/"); shot(p, "01-landing")
    step("signup"); p.goto(B + "/signup")
    p.fill("#name", "Joshua Olawunmi"); p.fill("#email", "joshua@cubbes.test"); p.fill("#password", "password123")
    p.click("button:has-text('Create account')"); p.wait_for_url("**/onboarding")
    shot(p, "02-onboarding")
    p.fill("#org", "Cubbes"); p.fill("#vision", "Every African student learns with the right tools."); p.fill("#product", "Study app")
    p.click("button:has-text('Create organisation')"); p.wait_for_url("**/app/import?welcome=1"); p.goto(B + "/app/strategy")

    step("pillar")
    p.click("summary:has-text('Add a pillar')"); p.fill("input[aria-label='Pillar name']", "Growth"); p.click("button:has-text('Add pillar')")
    p.wait_for_selector("text=Pillar added.")
    step("objectives")
    for title, metric, target in [("Grow paying subscribers 40%", "Paying subscribers", "12,000 by June"), ("Cut week-1 churn to 20%", "Week-1 churn", "20%")]:
        p.goto(B + "/app/strategy")
        det = p.locator("details:has(summary:has-text('Add a company objective'))")
        if not det.locator("input[name=title]").is_visible(): det.locator("summary").click()
        det.locator("input[name=title]").fill(title); det.locator("input[name=metric]").fill(metric); det.locator("input[name=target]").fill(target)
        det.locator("button:has-text('Add objective')").click(); p.wait_for_selector(f"h3:has-text('{title}')")
    shot(p, "03-strategy")

    step("product KPI"); p.goto(B + "/app/products")
    p.click("summary:has-text('Add a KPI')")
    f = p.locator("form:has(button:has-text('Add KPI'))")
    f.locator("input[name=name]").fill("Paying subscribers"); f.locator("input[name=baseline]").fill("8000"); f.locator("input[name=current]").fill("9100"); f.locator("input[name=target]").fill("12000")
    f.locator("button:has-text('Add KPI')").click(); p.wait_for_selector("text=KPI added.")
    shot(p, "04-products")

    step("OKR + KR"); p.goto(B + "/app/strategy")
    p.click("summary:has-text('Add a product OKR')")
    f = p.locator("form:has(button:has-text('Add OKR'))")
    f.locator("select[name=objectiveId]").select_option(index=1)
    f.locator("input[name=title]").fill("Make paying effortless"); f.locator("input[name=period]").fill("Q1 2027"); f.locator("button:has-text('Add OKR')").click()
    p.wait_for_selector("text=OKR added.")
    p.goto(B + "/app/strategy"); p.click("[id^=okr-] summary:has-text('Key result')")
    f = p.locator("[id^=okr-] form:has(button:has-text('Add key result'))")
    f.locator("input[name=title]").fill("Checkout conversion 2.1% to 3.5%"); f.locator("input[name=baseline]").fill("2.1"); f.locator("input[name=current]").fill("2.8"); f.locator("input[name=target]").fill("3.5"); f.locator("input[name=unit]").fill("%")
    f.locator("button:has-text('Add key result')").click(); p.wait_for_selector("text=Key result added.")

    step("invite"); p.goto(B + "/app/settings")
    p.fill("#inv-email", "ada@cubbes.test"); p.check("input[name=role][value=VIEWER]"); p.click("button:has-text('Create invite link')")
    p.wait_for_selector("text=Invite created.")
    p.reload(); shot(p, "05-settings")
    token = p.locator("text=ada@cubbes.test").locator("xpath=ancestor::li").inner_html()
    invite_html = p.content(); 

    step("idea"); p.goto(B + "/app/ideas/new")
    p.fill("#title", "Subscription through wallet"); p.select_option("#source", "CEO / leadership"); p.fill("#problemWho", "Students on monthly plans")
    p.fill("#problemWhat", "Card payments fail for 1 in 4 students, so they drop at checkout."); p.fill("#evidence", "I tried three times and my card failed. I have money in my wallet."); p.select_option("#effort", "M")
    p.click("button:has-text('Submit idea')"); p.wait_for_url("**/app/ideas/**")
    p.locator("form:has(button:has-text('Add evidence')) textarea[name=content]").fill("27% of checkout attempts failed in October (Paystack dashboard)")
    p.locator("form:has(button:has-text('Add evidence')) select[name=kind]").select_option("METRIC")
    p.click("button:has-text('Add evidence')"); p.wait_for_selector("text=Evidence added.")
    step("evaluate"); p.click("button:has-text('Evaluate with AI')"); p.wait_for_selector("text=Evaluation ready.")
    p.reload(); shot(p, "06-idea-evaluated")
    step("decide approve"); p.check("input[name=outcome][value=APPROVED]"); p.fill("#reason", "Directly serves subscriber growth and the wallet already exists.")
    p.click("button:has-text('Record decision')"); p.wait_for_selector("text=Approved and on the roadmap as")

    step("second idea (unevaluated)"); p.goto(B + "/app/ideas/new"); p.fill("#title", "Offline study packs"); p.click("button:has-text('Submit idea')"); p.wait_for_url("**/app/ideas/**")

    step("roadmap"); p.goto(B + "/app/roadmap"); shot(p, "07-roadmap")
    p.click("a:has-text('Subscription through wallet')"); p.wait_for_url("**/app/initiatives/**")
    init_url = p.url
    step("milestone + task"); p.click("summary:has-text('Add a milestone')")
    f = p.locator("form:has(button:has-text('Add milestone'))"); f.locator("input[name=title]").fill("Beta with 50 students"); f.locator("input[name=dueDate]").fill("2026-11-01"); f.locator("button:has-text('Add milestone')").click()
    p.wait_for_selector("text=Milestone added.")
    f = p.locator("form:has(button:has-text('Add task'))"); f.locator("input[name=title]").fill("Wallet balance check API"); f.locator("select[name=ownerId]").select_option(index=1); f.locator("button:has-text('Add task')").click()
    p.wait_for_selector("text=Task added.")
    step("status at risk without note -> error")
    sf = p.locator("form:has(button:has-text('Update status'))"); sf.locator("select[name=status]").select_option("AT_RISK"); sf.locator("textarea[name=note]").fill("")
    sf.locator("button:has-text('Update status')").click(); p.wait_for_selector("text=Say what's putting it at risk")
    sf.locator("textarea[name=note]").fill("Waiting on Paystack wallet API access"); sf.locator("button:has-text('Update status')").click(); p.wait_for_selector("text=Status updated.")
    assert p.locator("text=Waiting on Paystack wallet API access").count() and sf.locator("select[name=status]").input_value()=="AT_RISK", "status not kept"
    step("PRD agent"); p.click("button:has-text('Draft with PRD Agent')"); p.wait_for_url("**/app/agents/drafts/**")
    shot(p, "08-prd-draft")
    p.click("button:has-text('Approve PRD')"); p.wait_for_selector("text=Approved by")
    p.goto(init_url); shot(p, "09-initiative")

    step("strategy agent"); p.goto(B + "/app/agents"); p.click("button:has-text('Run') >> nth=0"); p.wait_for_url("**/app/agents/drafts/**")
    shot(p, "10-strategy-draft")
    p.click("button:has-text('Approve selected')"); p.wait_for_selector("text=Approved by")
    step("prioritisation agent"); p.goto(B + "/app/agents"); p.click("button:has-text('Run') >> nth=1"); p.wait_for_url("**/app/agents/drafts/**")
    p.click("button:has-text('Apply this order')"); p.wait_for_selector("text=Approved by")
    step("briefing"); p.goto(B + "/app/briefings"); p.click("button:has-text('Draft a briefing now')"); p.wait_for_url("**/app/agents/drafts/**")
    p.click("button:has-text('Approve briefing')"); p.wait_for_selector("text=Approved by")
    p.goto(B + "/app/briefings"); shot(p, "11-briefings")
    share = re.search(r"/b/[A-Za-z0-9_-]+", p.content())
    step("copilot"); p.goto(B + "/app/copilot?q=What%27s%20at%20risk%3F"); p.locator("textarea[name=question]").press("Enter"); p.wait_for_url("**/app/copilot?c=**")
    p.wait_for_selector("text=initiatives serve no objective"); shot(p, "12-copilot")
    step("decisions + tasks"); p.goto(B + "/app/decisions"); shot(p, "13-decisions"); p.goto(B + "/app/tasks"); shot(p, "14-tasks")
    p.goto(B + "/app/roadmap?view=timeline"); shot(p, "15-timeline")
    step("command centre"); p.goto(B + "/app"); shot(p, "16-command-centre")

    step("share link logged out")
    pub = br.new_context().new_page(); pub.goto(B + share.group(0)); shot(pub, "17-shared-briefing"); assert "Weekly briefing" in pub.content() or "briefing" in pub.content().lower()

    step("invite accept as viewer")
    m = re.search(r'/invite/([A-Za-z0-9_-]+)', invite_html) 
    tok = None
    p.goto(B + "/app/settings")
    # read the copy button's text from the server-rendered list via DB instead
    import subprocess
    tok = subprocess.check_output(["psql","postgresql://pos:pos@localhost:5432/productsos","-tAc","select token from \"Invitation\" where email='ada@cubbes.test'"]).decode().strip()
    v = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page()
    v.on("pageerror", lambda e: errors.append(f"viewer pageerror: {e}"))
    v.goto(B + f"/invite/{tok}"); shot(v, "18-invite-mobile")
    v.fill("#name", "Ada Viewer"); v.fill("#password", "password123"); v.click("button:has-text('Join your team')"); v.wait_for_url(B + "/app")
    shot(v, "19-app-mobile")
    v.goto(B + "/app/strategy"); assert v.locator("summary:has-text('Add a company objective')").count() == 0, "viewer sees admin form"
    v.goto(B + "/app/ideas/new"); v.fill("#title", "Dark mode for night study"); v.click("button:has-text('Submit idea')"); v.wait_for_url("**/app/ideas/**")
    assert v.locator("button:has-text('Evaluate with AI')").count() == 0
    shot(v, "20-idea-mobile")
    v.goto(B + "/app/roadmap"); shot(v, "21-roadmap-mobile")
    v.goto(B + "/app/initiatives/new"); assert "/app" in v.url and "initiatives/new" not in v.url, v.url
    v.goto(B + "/"); shot(v, "22-landing-mobile")
    for path in ["/app","/app/strategy","/app/ideas","/app/roadmap","/app/agents","/app/copilot","/app/settings","/app/tasks","/app/briefings","/"]:
        v.goto(B + path); w = v.evaluate("document.documentElement.scrollWidth")
        assert w <= 390, f"{path} overflows: {w}px"
    br.close()

print("ERRORS:", errors if errors else "none")
