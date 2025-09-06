const fs = require('fs');
const path = require('path');
const paths = require('@utils/paths')
const parser = require("@babel/parser");
const generate = require("@babel/generator").default
const traverse = require("@babel/traverse").default
const t = require('@babel/types');


function valueHandle(operator, value) {
  switch(operator) {
    case '<':
      return value - 1
    case '==':
    case '===':
      return value
    case '<=':
      return value
  }
}

function getIfTestValue(test) {
  if (!test) return false
  const { operator, left, right } = test
  if (!['<', '==', '===', '<='].includes(operator)) return false
  if (!t.isIdentifier(left)) return false
  if (!t.isNumericLiteral(right)) return false
  return { name: left.name, value: valueHandle(operator, right.value) }
}

function getNode(node) {
  if (!node) return []
  if (t.isIfStatement(node)) return [node]
  if (t.isBlockStatement(node)) return node.body
  if (t.isExpressionStatement(node)) return [node.expression]
  // 三元表达式
  if (t.isConditionalExpression(node)) return [node]
  // 逗号表达式
  if (t.isSequenceExpression(node)) return node.expressions
  // 赋值表达式
  if (t.isAssignmentExpression(node)) return [node]
  if (t.isEmptyStatement(node)) return [node]
  console.error(`未知类型请检查: ${node.type}`)
  return [node]
}

function getIfNode(node, ans=[], opt = {}, codemap = {}) {
  const testValue = getIfTestValue(node?.test)
  if (testValue === false) return
  if (!opt.name) { Object.assign(opt, testValue) }
  if (testValue.name !== opt.name) return
  ['consequent', 'alternate'].forEach((key, idx) => {
    const nextNode = getNode(node[key])
    ans[testValue.value + idx] = nextNode
    codemap[testValue.value + idx] = nextNode.map(item => {
        return generate(item, { minified: false, concise: false, compact: false }).code;
    }).join('; ');
    // console.log(testValue.value + idx, nextNode)
    nextNode?.forEach(item => getIfNode(item, ans, opt, codemap))
  })
  codemap.name = opt.name;
  return [opt.name, ans.filter(Boolean), codemap]
}

function handleCode(cases, type, config, brower = '') {
  const codes = [];
  if (!brower && config) {
    for (let key of Object.keys(config)) {
      codes.push(...handleCode(cases, type, config, key));
    }
  }
  const cfgKey = type;
  const cfg = brower ? config[brower]?.[cfgKey] : config[cfgKey];
  if (!cfg) return codes;
  cfg.forEach((item, idx) => {
    const code = `${item.name[0] === '_' ? '' : '_'}${item.name}(${item.idx})`;
    const runList = item.data.length > 0 ? item.data.split(',') : [];
    const codelist = runList.reduce((ans, num, runIdx) => {
      if (!cases[num]) {
        console.error(`【ERROR】${type}=>(${item.current}, ${runIdx}): 下标${num}不存在`);
        return ans;
      }
      return [
        ...ans,
        ...cases[num].map((each, caseIdx) => {
          let node = t.cloneNode(each);
          if (!t.isStatement(node)) node = t.expressionStatement(node);
          if (caseIdx === 0) {
            const comment = [
              `命中：${num}`,
              `位置：${runIdx + 1}`,
              `断点：if(${type}===${num}&&current===${item.current}&&curLoop()===${runIdx + 1}){true}`,
            ];
            if (item.param && item.param[runIdx] && item.param[runIdx].next) {
              comment.push(`下级循环：${item.param[runIdx].next}`);
            }
            t.addComment(node, 'leading', comment.join('，'), false);
          }
          return node;
        })
      ]
    }, []);
    const result = generate(t.blockStatement(codelist), { minified: false, concise: false, compact: false });
    const content = [
      result.code,
      `// 实际运行：${item.data}`,
      `// 实际下标：${item.idxs}`,
      `// 完整运行：${item.list}`,
    ];
    if (item.pre && typeof item.pre.current === 'number' && typeof item.pre.curloop === 'number') {
      content.unshift(`// 上级循环: ${item.pre.current} / ${item.pre.curloop}`);
    }
    codes.push({
      path: paths.outputResolve(brower, `run${type}_${item.lens}${code}_${idx}_${item.current}.js`),
      content: content.join('\n')
    })
  })
  return codes;
}

function getVarible(scope, key) {
  const varibles = {};
  do {
    for (const name of Object.keys(scope.bindings)) {
      const binding = scope.bindings[name];
      const kind = binding.kind;
      // if (!['param', 'var'].includes(kind)) continue;
      if (!varibles[kind]) varibles[kind] = [];
      varibles[kind].push(name)
    }
    if (['FunctionExpression', 'FunctionDeclaration'].includes(scope.block.type)) {
      break;
    }
  } while ((scope = scope.parent));
  return {
    scope,
    path: paths.outputResolve(`varibles${key}`),
    content: [
      `【${key}】:`,
      ...Object.entries(varibles).map(([name, arr]) => `    【${name}】: ${arr.join(', ')}`),
      '',
    ].join('\n'),
  }
}

function findFuncParent(funcNode, num) {
  // 方法节点向上查找第num父级方法
  if (num <= 0) return funcNode.node;
  if (!t.isFunctionDeclaration(funcNode)) {
    num -= 1;
  }
  return findFuncParent(funcNode.parentPath, num);
}

function codemapAddCommon(path, scope, codemap) {
  codemap.params = scope.block.params.map(n => n.name);
  if (codemap.params.length === 4 && t.isForStatement(path.parentPath.parentPath)) {
    const loopFunBody = scope.block.body.body;
    if (
      loopFunBody.length === 5
      && t.isVariableDeclaration(loopFunBody[0])
      && t.isExpressionStatement(loopFunBody[1])
      && t.isForStatement(loopFunBody[2])
      && t.isFunctionDeclaration(loopFunBody[4])
    ) {
      codemap.varible = loopFunBody[0].declarations.map(item => item.id.name);
      loopFunBody[1].expression.expressions.map((item, idx) => {
        // 赋值声明
        let key = '';
        if (t.isMemberExpression(item.right)) {
          if (item.right.object.name === codemap.params[0]) {
            key = 'taskarr'; // 任务队列
          } else if (t.isNumericLiteral(item.right.property)) {
            key = `ret${item.right.property.extra.raw}`; // 返回值容器
          }
        } else if (t.isCallExpression(item.right)) {
          key = 'dataKey'; // 数据键
        } else if (item.right.extra.rawValue === 0) {
          key = 'dataIdx'; // 数据下标
        }
        codemap[key] = item.left.name;
      })
      const forTest = loopFunBody[2].test;
      codemap.forcur = forTest.left.name; // 循环游标
      codemap.formax = forTest.right.name; // 循环最大值
      codemap.commonFunc = generate(loopFunBody[4], { minified: false, concise: false, compact: false }).code;
      codemap.globalRes = [...findFuncParent(scope.path, 2).params].pop().name;
      codemap.keyname = findFuncParent(scope.path, 2).params[4].name; // 变量名数组
      codemap.loopRes = findFuncParent(scope.path, 1).body.body[3].expression.expressions[0].left.name;
      const taskFunc = [...findFuncParent(scope.path, 2).body.body[2].body.body].pop().body.body
      codemap.taskAttr = [...taskFunc[1].expression.expressions, ...taskFunc[5].expression.expressions].filter(it => t.isMemberExpression(it.left) && it.left.object.name === taskFunc[0].declarations[0].id.name).map(it => it.left.property.name); // 分别为[lens, isReset, taskarr, one, two]
      codemap.taskFactory = findFuncParent(scope.path, 1).body.body[9].id.name;
    } else {
      throw new Error('瑞数主体循环代码有调整，请查看');
    }
  }
  return codemap;
}

module.exports = (ast, argv) => {
  const codes = []
  traverse(ast, {
    IfStatement(path) {
      const [key, cases, codemap] = getIfNode(path.node) || []
      if (!key || cases.length <= 6) return;
      codes.push(...handleCode(cases, key, argv.config || {}));
      const newNode = t.switchStatement(
        t.identifier(key),
        cases.map((mycase, idx) => {
          const statements = mycase.reduce((ans, item) => (
            ans.push(t.isStatement(item) ? item : t.expressionStatement(item)),
            ans
          ), [])
          if (!mycase.some(item => t.isReturnStatement(item))) {
            statements.push(t.breakStatement())
          }
          return t.switchCase(t.numericLiteral(idx), statements)
        })
      )
      const pushNode = parser.parseExpression(`addLoop(下标, ${key})`)
      const { scope, ...codeNode } = getVarible(path.scope, key);
      codes.push({ // 该处解析原始代码，应该在所有代码修改之前执行
        path: paths.outputResolve(`switch_codemap_${key}.json`),
        content: JSON.stringify(codemapAddCommon(path, scope, codemap)),
      })
      codes.push(codeNode);
      const defineNode = parser.parse(`var { current, addLoop, curLoop } = sdenv.tools.getUtil('initLoop')('${key}', 起始下标, '${scope.block.id?.name || "_ENTRY"}', 完整队列)`, { sourceType: 'module' });
      scope.block.body.body.unshift(defineNode.program.body[0]);
      path.replaceInline([pushNode, newNode]);
      path.skip();
    },
  });
  traverse(ast, {
    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      if (t.isFunctionExpression(callee)) {
        const newFuncExpr = t.functionExpression(
          null,
          args.map((item, idx) => {
            return t.assignmentPattern(
              t.identifier(callee.params[idx].name),
              item,
            );
          }),
          callee.body,
          callee.generator,
          callee.async,
        );
        const assignmentExpr = t.assignmentExpression(
          '=',
          t.identifier('sdenv_utils_dynamicFunc'),
          newFuncExpr,
        );
        path.replaceWith(assignmentExpr);
        path.skip();
      }
    }
  });
  return codes
}
