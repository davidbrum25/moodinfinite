from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Browser Error: {err.message}"))
    page.goto("http://localhost:8080/")
    
    # Wait a bit for initial load
    page.wait_for_timeout(1000)
    
    # Click the add-colorseeker-tab-btn
    print("Clicking button...")
    page.locator("#add-colorseeker-tab-btn").click()
    page.wait_for_timeout(1000)
    print("Done")
    browser.close()
