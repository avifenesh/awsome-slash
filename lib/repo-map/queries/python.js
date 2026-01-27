/**
 * Python query patterns for ast-grep
 */

'use strict';

module.exports = {
  exports: [],
  functions: [
    { pattern: 'def $NAME($$$): $$$', nameVar: 'NAME' },
    { pattern: 'async def $NAME($$$): $$$', nameVar: 'NAME' }
  ],
  classes: [
    { pattern: 'class $NAME($$$): $$$', nameVar: 'NAME' },
    { pattern: 'class $NAME: $$$', nameVar: 'NAME' }
  ],
  types: [],
  constants: [],
  imports: [
    { pattern: 'import $SOURCE', sourceVar: 'SOURCE', kind: 'import', multiSource: true },
    { pattern: 'from $SOURCE import $NAME', sourceVar: 'SOURCE', kind: 'from' },
    { pattern: 'from $SOURCE import ($$$)', sourceVar: 'SOURCE', kind: 'from' }
  ],
  references: [
    { pattern: '$NAME($$$)', nameVar: 'NAME', kind: 'call' },
    { pattern: '$OBJ.$NAME($$$)', nameVar: 'NAME', kind: 'method' },
    { pattern: 'class $NAME($BASE): $$$', nameVar: 'BASE', kind: 'extends' },
    { pattern: 'class $NAME($BASE, $$$): $$$', nameVar: 'BASE', kind: 'extends' }
  ]
};
