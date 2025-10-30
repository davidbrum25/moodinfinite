import asyncio
import os
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Navigate to the local index.html file
        await page.goto(f'file://{os.path.abspath("index.html")}')

        # Click the "Add Box" button
        await page.click('#add-box-btn')

        # Get the canvas element
        canvas = await page.query_selector('#moodboard-canvas')

        # Get the bounding box of the canvas
        bounding_box = await canvas.bounding_box()

        # Perform a drag and drop operation to create a box
        await page.mouse.move(bounding_box['x'] + 100, bounding_box['y'] + 100)
        await page.mouse.down()
        await page.mouse.move(bounding_box['x'] + 200, bounding_box['y'] + 200)
        await page.mouse.up()

        # Click the "Select" tool
        await page.click('#select-tool-btn')

        # Click the box to select it
        await page.mouse.click(bounding_box['x'] + 150, bounding_box['y'] + 150)

        await page.wait_for_timeout(500)

        # Click the "Rotate" button
        await page.click('#rotate-btn')

        # Perform a drag and drop operation to rotate the box
        await page.mouse.move(bounding_box['x'] + 200, bounding_box['y'] + 180)
        await page.mouse.down()
        await page.mouse.move(bounding_box['x'] + 220, bounding_box['y'] + 200)
        await page.mouse.up()

        # Click the "Reset" button
        await page.click('#reset-transform-btn')

        # Take a screenshot
        await page.screenshot(path="jules-scratch/verification/verification.png")

        await browser.close()

asyncio.run(main())