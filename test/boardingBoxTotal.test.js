'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { renderTotal } = require('../public/public/box');
test('top total subtracts manual deletions in red and clears subtraction after restore', () => {
  const total = {children:[],replaceChildren(){this.children=[];},append(...nodes){this.children.push(...nodes);}};
  const doc = {getElementById:()=>total,createElement:()=>({})};
  const data = {expectedPassengers:290,expectedInfants:2,expectedTotal:292};
  const value = () => total.children.map(node=>node.textContent).join('');
  renderTotal(doc,data); assert.equal(value(),'290 + 2 = 292');
  renderTotal(doc,{...data,manualDeletedCount:1}); assert.equal(value(),'290 + 2 = 292 -1 = 291');
  assert.equal(total.children[1].className,'total-deleted');
  renderTotal(doc,{...data,manualDeletedCount:2}); assert.equal(value(),'290 + 2 = 292 -2 = 290');
  renderTotal(doc,{...data,manualDeletedCount:0}); assert.equal(value(),'290 + 2 = 292');
  renderTotal(doc,{...data,expectedTotal:null,manualDeletedCount:1}); assert.equal(value(),'290 + 2 = — -1 = —');
});
