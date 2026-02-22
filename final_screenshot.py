import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        # Go to Umpire Management page
        await page.goto('http://localhost:4000/admin/t/testtour/umpire_manage')

        # Wait for Alice
        await page.wait_for_selector('.umpire_tile:has-text("Alice")')

        # Take final screenshot
        screenshot_path = '/home/jules/verification/final_umpire_management.png'
        await page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
