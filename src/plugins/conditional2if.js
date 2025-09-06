// 非连续性三元表达式转if/else语句
const fs = require('fs');
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

function getPreValue(historys, val) {
  let len = historys.length
  while(len--) {
    const his = historys[len]
    if (!his.consequent && his.value > val) return his.value
  }
  return 'else'
}

function getIfNode(node, ans={}, opt = {}, historys = [], keytype=null) {
  const testValue = getIfTestValue(node?.test)
  if (testValue === false) return
  if (!opt.name) { Object.assign(opt, testValue) }
  if (testValue.name !== opt.name) return
  if (historys.length > 0 && keytype) {
    historys[historys.length - 1][keytype] = false
  }
  historys.push({ ...testValue, consequent: true, alternate: true })
  ;['consequent', 'alternate'].forEach(key => {
    const nextNode = getNode(node[key])
    const idx = key === 'consequent' ? testValue.value : getPreValue(historys, testValue.value)
    ans[idx] = nextNode
    // console.log(key, idx)
    nextNode?.forEach(item => getIfNode(item, ans, opt, historys, key))
  })
  return [opt.name, ans]
}

function grenIfAst(current, key, idxs, data) {
  if (current >= idxs.length) return undefined
  const statements = data[idxs[current]]?.reduce((ans, item) =>
    ([...ans, (t.isStatement(item) ? item : t.expressionStatement(item))])
  , []) || []
  if (idxs[current] === 'else') return t.blockStatement(statements)
  const node = grenIfAst(current + 1, key, idxs, data)
  if (current === 0) {
    return t.ifStatement(
      t.binaryExpression('<=', t.identifier(key), t.numericLiteral(Number(idxs[current]))),
      t.blockStatement(statements),
      node
    )
  } else {
    return t.ifStatement(
      t.logicalExpression(
        '&&',
        t.binaryExpression('>', t.identifier(key), t.numericLiteral(Number(idxs[current - 1]))),
        t.binaryExpression('<=', t.identifier(key), t.numericLiteral(Number(idxs[current])))
      ),
      t.blockStatement(statements),
      node
    )
  }
}

module.exports = (ast) => {
  traverse(ast, {
    ConditionalExpression(path) {
      const [key, data] = getIfNode(path.node) || []
      if (!data) return
      if (Object.keys(data).length < 5) return
      const newNode = grenIfAst(0, key, Object.keys(data), data)
      path.replaceWithMultiple([newNode])
      path.skip()
    },
  });
  return [];
}
