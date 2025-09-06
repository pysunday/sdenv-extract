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

module.exports = (ast) => {
  traverse(ast, {
    IfStatement(path) {
      const { node } = path;

      if (!t.isBlockStatement(node.consequent)) {
        node.consequent = t.blockStatement([node.consequent]);
      }

      if (node.alternate && !t.isIfStatement(node.alternate) && !t.isBlockStatement(node.alternate)) {
        node.alternate = t.blockStatement([node.alternate]);
      }
    },
  });
  return [];
}
