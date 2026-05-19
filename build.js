const fs = require('fs');
const config = require('./config.json');

const template = fs.readFileSync('src/index.html', 'utf8');
const output = template
  .replace(/\$\{prize\}/g, () => config.prize)
  .replace(/\$\{discord\}/g, () => config.discord);
fs.writeFileSync('index.html', output, 'utf8');
fs.copyFileSync('src/styles.css', 'styles.css');
fs.copyFileSync('src/main.js', 'main.js');
console.log(`Built index.html, styles.css, main.js  (prize = ${config.prize})`);
