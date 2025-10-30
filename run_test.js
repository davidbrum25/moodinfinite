const puppeteer = require('puppeteer');

async function runTest() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Listen for console events and log them to the terminal
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'log') {
            console.log(text);
        } else if (type === 'error') {
            console.error(text);
        }
    });

    await page.goto('http://localhost:8000/test_undo_bug.html');

    // Give the test time to run and log results
    await new Promise(resolve => setTimeout(resolve, 1000));

    await browser.close();
}

runTest();
