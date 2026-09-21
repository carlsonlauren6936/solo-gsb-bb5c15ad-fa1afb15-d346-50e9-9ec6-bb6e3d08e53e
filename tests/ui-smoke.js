'use strict';
/*
 * 轻量 DOM 桩：在无浏览器环境下加载 public/app.js，
 * 驱动“建格→标注→合法/非法折叠→回放→顺序→存取载荷”主流程冒烟。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function makeEl(id) {
  const listeners = {};
  const el = {
    id, hidden: false, value: '', textContent: '', innerHTML: '',
    style: { cssText: '' }, className: '', disabled: false,
    dataset: {}, files: [], max: '0',
    width: 0, height: 0,
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatch(t, ev = {}) { (listeners[t] || []).forEach((fn) => fn(ev)); },
    appendChild() {}, querySelector() { return makeEl('q'); },
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, contains() { return false; } },
    getContext: () => ({
      setTransform() {}, clearRect() {}, save() {}, restore() {},
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
      arcTo() {}, closePath() {}, fillText() {}, translate() {}, rotate() {},
      rect() {}, set fillStyle(v) {}, get fillStyle() { return ''; },
      set strokeStyle(v) {}, get strokeStyle() { return ''; },
      set lineWidth(v) {}, get lineWidth() { return 1; },
      set font(v) {}, get font() { return ''; },
      set textAlign(v) {}, set textBaseline(v) {},
      setLineDash() {}
    }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };
  return el;
}

const ids = ['rowsInput', 'colsInput', 'createGridBtn', 'axisSelect', 'lineSelect',
  'foldError', 'saveBtn', 'exportBtn', 'importBtn', 'importFile', 'loadListBtn',
  'deletePlanBtn', 'planList', 'saveMsg', 'firstBtn', 'prevBtn', 'playBtn', 'nextBtn',
  'stepSlider', 'stepLabel', 'statusBadge', 'board', 'canvasHint', 'stepList',
  'delStepBtn', 'clearStepsBtn', 'orientInfo', 'sequenceBox', 'foldState',
  'cellEditor', 'editorOrigin', 'editorRows', 'editorCancel', 'editorOk', 'planName',
  'imposeStart', 'imposeCount', 'imposeGenerateBtn', 'imposeCapacity', 'imposeMsg',
  'imposePreview', 'imposeSummary', 'imposeOverwrite', 'imposeTable',
  'imposeCancelBtn', 'imposeConfirmBtn'];
const els = Object.fromEntries(ids.map((id) => [id, makeEl(id)]));
els.rowsInput.value = '2';
els.colsInput.value = '2';
els.planName.value = '冒烟方案';
els.axisSelect.value = 'v';
els.imposeStart.value = '1';
els.imposeCount.value = '8';

const foldBtns = ['l', 'r', 'u', 'd'].map((dir) => {
  const b = makeEl('fold-' + dir);
  b.dataset.dir = dir;
  return b;
});

const win = { devicePixelRatio: 1, addEventListener() {} };
const sandbox = {
  console,
  window: win,
  document: {
    getElementById: (id) => els[id],
    querySelectorAll: (sel) => sel === 'button.fold' ? foldBtns : [],
    createElement: () => makeEl('dyn')
  },
  fetch: async () => ({ json: async () => ({ ok: false }) }),
  Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  FileReader: class { readAsText() {} },
  alert() {}, confirm() { return false; },
  setTimeout, clearInterval, setInterval: () => 1
};
vm.createContext(sandbox);
// foldEngine 通过 window.FoldEngine 暴露；让 window 也成为全局对象的一部分
sandbox.window.FoldEngine = undefined;

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'foldEngine.js'), 'utf8'), sandbox);
vm.runInContext('var FoldEngine = window.FoldEngine;', sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'), sandbox);
const ui = sandbox.window.__foldApp;

// init() 已在 app.js 末尾执行：默认创建了 2×2 网格
assert.equal(ui.plan.rows, 2);
assert.equal(ui.plan.cols, 2);

// 模拟添加合法竖折（左瓣向右落）
ui.plan.labels = {
  '0,0': { front: '4', back: '5' }, '1,0': { front: '6', back: '3' },
  '0,1': { front: '8', back: '1' }, '1,1': { front: '7', back: '2' }
};
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
assert.equal(ui.plan.steps.length, 1);
assert.equal(els.foldError.hidden, true);

// 非法折：水平方向用左右方向不匹配，由表单分支处理；直接给厚度冲突
// 先加合法水平折，再试图重复 -> contour
ui.requestStep({ axis: 'h', line: 1, dir: 'd' });
assert.equal(ui.plan.steps.length, 2);
ui.requestStep({ axis: 'h', line: 1, dir: 'd' }); // 上瓣已空
assert.equal(ui.plan.steps.length, 2, '非法步骤不应入列');
assert.equal(els.foldError.hidden, false);

// 回放与阅读顺序
ui.setUpto(0);
assert.equal(ui.upto, 0);
ui.setUpto(2);
const seq = require('../public/foldEngine.js').pageSequence(ui.replay.state).stacks[0].sequence;
assert.deepEqual(seq, ['3', '4', '1', '7', '2', '8', '5', '6']);
assert.ok(/单叠|阅读顺序/.test(els.foldState.textContent), '折叠状态已渲染');

// 厚度冲突场景（1×3）
els.rowsInput.value = '1'; els.colsInput.value = '3';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
ui.requestStep({ axis: 'v', line: 2, dir: 'l' });
assert.equal(ui.plan.steps.length, 1, '厚度冲突步应被拒绝');
assert.ok(els.foldError.textContent.includes('厚度不一致'));
assert.ok(ui.replay.error.code === 'thickness');
assert.deepEqual(ui.replay.error.conflicts, ['2,0', '1,0']);

// ---------- 自动拼版 ----------
// 非法/未单叠方案：生成按钮禁用，自动拼版被拒
assert.equal(ui.impositionEligibility().eligible, false, '1×3 仅一步非单叠');
ui.generateImposition();
assert.equal(ui.imposition, null);
assert.equal(els.imposeMsg.hidden, false);
assert.ok(els.imposeMsg.textContent.includes('单叠'));

// 回到 2×2 合法八页折帖
els.rowsInput.value = '2'; els.colsInput.value = '2';
els.imposeStart.value = '1'; els.imposeCount.value = '8';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
ui.requestStep({ axis: 'h', line: 1, dir: 'd' });
assert.equal(ui.plan.steps.length, 2);
assert.equal(ui.impositionEligibility().eligible, true);
assert.equal(els.imposeGenerateBtn.disabled, false);

// 现有标注非空：确认前必须汇总将被覆盖的面
ui.plan.labels = { '0,0': { front: '9', back: '9' } };
ui.generateImposition();
assert.ok(ui.imposition, '拼版结果已生成');
assert.equal(els.imposePreview.hidden, false, '预览已显示');
assert.equal(els.imposeMsg.hidden, true);
// 8 个面均与拼版结果不同（0,0 两面改值，其余 6 面由空变为页码）
assert.equal(ui.imposition.overwrites.length, 8);
const ow00 = ui.imposition.overwrites.filter((o) => o.panelId === '0,0');
assert.equal(ow00.length, 2);
assert.ok(ow00.every((o) => o.from === '9'));
// 预览明细覆盖全部 4 个原始纸格（桩环境 appendChild 为空操作，校验数据完整即可）
assert.deepEqual(
  ui.imposition.slots.map((s) => s.panelId).filter((v, i, a) => a.indexOf(v) === i).sort(),
  ['0,0', '0,1', '1,0', '1,1']);

// 预览不得直接改动当前标注
assert.deepEqual(ui.plan.labels, { '0,0': { front: '9', back: '9' } });

// 页数超容量被拒
ui.clearImposition();
els.imposeCount.value = '9';
ui.generateImposition();
assert.equal(ui.imposition, null);
assert.ok(els.imposeMsg.textContent.includes('超出纸格总面数'));

// 合法生成 + 确认后批量写入
els.imposeCount.value = '8';
ui.generateImposition();
ui.confirmImposition();
assert.equal(els.imposePreview.hidden, true);
// 写入后重放阅读顺序必须为 1..8
const rr = require('../public/foldEngine.js').pageSequence(
  require('../public/foldEngine.js').replay(2, 2, ui.plan.labels, ui.plan.steps).state).stacks[0].sequence;
assert.deepEqual(rr, ['1','2','3','4','5','6','7','8']);

// 自动生成后的标签进入方案载荷（保存/导入导出都保留）
assert.equal(ui.planPayload().labels['1,1'].back, '5');

// 页数 < 容量：末尾槽位空白，且对应纸格/面仍可读
els.rowsInput.value = '1'; els.colsInput.value = '2';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
els.imposeStart.value = '3'; els.imposeCount.value = '2';
ui.generateImposition();
assert.equal(ui.imposition.slots[2].blank, true);
assert.ok(ui.imposition.slots[2].panelId && ui.imposition.slots[2].face);
ui.confirmImposition();
const FE = require('../public/foldEngine.js');
const rr2 = FE.pageSequence(
  FE.replay(1, 2, ui.plan.labels, ui.plan.steps).state).stacks[0].sequence;
assert.deepEqual(rr2, ['3', '4', null, null]);

console.log('前端冒烟流程全部通过');
