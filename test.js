const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<body><div id="toast-container"></div></body>`);
console.log(dom.window.document.getElementById('toast-container'));
