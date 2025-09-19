#!/usr/bin/env node
require('module-alias')(__dirname + '/package.json');
const yargs = require('yargs');
const fs = require('fs');
const utils = require('@utils/')
const { logger, paths, isValidUrl } = utils;
const pkg = require(paths.package);
const cmds = require('@src/');

function debugLog(argv) {
  if (pkg.logLevel === 'debug') {
    logger.log('execPath:', __dirname);
    logger.log('filePath:', __filename);
    logger.log('processCwd:', process.cwd());
    logger.log('paths:\n', JSON.stringify(paths, null, 2));
  }
}

module.exports = yargs
  .help('h')
  .alias('v', 'version')
  .version(pkg.version)
  .usage('使用: node $0 <commond> [options]')
  .command({
    command: 'format',
    describe: '提取出动态代码并格式化',
    handler: (argv) => {
      debugLog(argv);
      cmds.format({
        config: argv.config,
        input: argv.input,
        output: argv.output,
      })
    },
  })
  .option('i', {
      alias: 'input',
      describe: '输入文件',
      type: 'string',
      coerce: (s) => {
        const input = paths.resolveCwd(s)
        if (!fs.existsSync(input)) throw new Error('输入文件不存在');
        return fs.readFileSync(paths.resolve(input), 'utf8');
      }
  })
  .option('o', {
      alias: 'output',
      describe: '输出文件',
      type: 'string',
      default: './output',
      coerce: (path) => {
        return paths.resolveCwd(path);
      }
  })
  .option('c', {
      alias: 'config',
      describe: 'json配置文件',
      type: 'string',
      coerce: (s) => {
        const input = paths.resolveCwd(s);
        if (!fs.existsSync(input)) throw new Error('配置文件不存在');
        return JSON.parse(fs.readFileSync(paths.resolve(input), 'utf8'));
      }
  })
  .updateStrings({
    'Show version number': '显示版本号',
    'Show help': '显示帮助信息',
  })
  .example('$0 makecode -f example/codes/1-\$_ts.json')
  .example('$0 makecode -u http://url/path')
  .epilog('')
  .argv;
