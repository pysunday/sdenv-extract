const t = require('@babel/types');
const traverse = require("@babel/traverse").default
const { operator } = require('putout');
const {
    replaceWithMultiple,
    toExpression,
    compare,
    remove,
    insertBefore,
} = operator;

function isIfTest(path) {
  const { parentPath } = path;
  const pathTest = parentPath.get('test');
  if (!parentPath.isIfStatement()) return false;
  return pathTest === path;
}

function isArgs(path) {
  const {parentPath} = path;
  if (!parentPath.isCallExpression()) return false;
  return path === parentPath.get('arguments.0');
}

module.exports = (ast) => {
  traverse(ast, {
    SequenceExpression(path) {
      const { parentPath } = path;
      if (isArgs(path)) {
        // foo((a, b, c))  →  foo(a, b, c)
        parentPath.node.arguments = path.node.expressions;
        path.skip();
        return;
      }
      if (parentPath.isArrowFunctionExpression()) {
        // () => (a(), b(), c())  →  () => { a(); b(); return c(); }
        const expressions = parentPath.node.body.expressions.map(t.toExpression);
        const n = expressions.length - 1;
        const { expression } = expressions[n];
        expressions[n] = t.returnStatement(expression);
        parentPath.node.body = t.blockStatement(expressions);
        path.skip();
        return;
      }
      if(parentPath.isReturnStatement()) {
        // return (a(), b(), c());  →  a(); b(); return c();
        const { expressions } = path.node;
        const argument = expressions.pop();
        replaceWithMultiple(parentPath, [
            ...expressions,
            t.returnStatement(argument),
        ]);
        path.skip();
        return;
      }
      if (isIfTest(path)) {
        // if(a(), b(), c()) { ... }  →  a(); b(); if (c()) { ... }
        while (path.node.expressions.length > 1) {
          insertBefore(path.parentPath, t.expressionStatement(path.node.expressions.shift()));
        }
        path.skip();
        return;
      }
      const isExpressionAfterCall = compare(path, '__a(__args), __b');
      const callPath = path.get('expressions.0');
      const argPath = path.get('expressions.1');
      if (isExpressionAfterCall && argPath.isLiteral()) {
        debugger;
        // callPath.node.arguments.push(argPath.node);
        // remove(argPath);
        path.skip();
        return;
      }
      replaceWithMultiple(path, path.node.expressions);
      path.skip();
    }
  });
  return [];
}
