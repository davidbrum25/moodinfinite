const puppeteer = require('puppeteer');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    await page.goto('file:///home/david/Documents/Apps and Themes/_moodinfinite/moodinfinite/index.html');
    await wait(1000);
    
    console.log('Clicking new board button...');
    await page.click('#add-moodinfinite-tab-btn');
    await wait(500);
    
    console.log('Clicking eyedropper button...');
    await page.click('#eyedropper-btn');
    await wait(500);
    
    console.log('Clicking canvas...');
    await page.mouse.click(200, 200);
    await wait(500);
    
    console.log('Done.');
    await browser.close();
})();
