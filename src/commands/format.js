const fs = require('fs');
const parser = require("@babel/parser");
const generate = require("@babel/generator").default
const traverse = require("@babel/traverse").default
const paths = require('@utils/paths');
const path = require('path');
const logger = require('@utils/logger');
const t = require('@babel/types');
const plugins = require('@src/plugins');
const { conditional2if, ifConditional2switch, sequence, common } = plugins;


function checkAndCreate(p) {
  const fdir = path.dirname(p);
  try {
    fs.statSync(fdir);
  } catch (err) {
    fs.mkdirSync(fdir, { recursive: true });
  }
}

module.exports = (argv) => {
  const ast = parser.parse(argv.input, { allowReturnOutsideFunction: true })
  const codes = []
  codes.push(...ifConditional2switch(ast, argv));
  codes.push(...sequence(ast, argv));
  codes.push(...conditional2if(ast, argv));
  codes.push(...common(ast, argv));
  const result = generate(ast, { minified: false, concise: false, compact: false })
  const formatPath = path.resolve(argv.output, 'format.js');
  checkAndCreate(formatPath);
  fs.writeFileSync(formatPath, result.code);
  console.info(`写入文件成功：${formatPath}`);
  codes.forEach(({ path: p, content }) => {
    console.info(`写入文件成功：${p}`);
    checkAndCreate(p);
    fs.writeFileSync(p, content);
  })
}

