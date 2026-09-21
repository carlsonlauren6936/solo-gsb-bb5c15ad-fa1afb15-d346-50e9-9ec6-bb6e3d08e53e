'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/foldEngine.js');

const L = (obj) => Object.fromEntries(
  Object.entries(obj).map(([k, [f, b]]) => [k, { front: f, back: b }]));

test('初始状态：每格单片、正面朝上、正立', () => {
  const s = E.initialState(2, 3, L({ '0,0': ['1', '2'] }));
  assert.equal(Object.keys(s.stacks).length, 6);
  assert.deepEqual(s.stacks['0,0'], ['0,0']);
  assert.equal(E.visibleFace(s.panels['0,0']).side, 'front');
  assert.equal(E.visibleFace(s.panels['0,0']).upright, true);
  assert.equal(s.panels['0,0'].front, '1');
  assert.equal(s.panels['0,0'].back, '2');
});

test('1×2 向右对折（左瓣翻过折线落到右侧）：移动片在上，骑马钉顺序 1..4', () => {
  const s0 = E.initialState(1, 2, L({ '0,0': ['4', '1'], '1,0': ['2', '3'] }));
  assert.equal(E.validateFold(s0, { axis: 'v', line: 1, dir: 'r' }), null);
  const s = E.applyFold(s0, { axis: 'v', line: 1, dir: 'r' });
  assert.deepEqual(Object.keys(s.stacks), ['1,0']);
  assert.deepEqual(s.stacks['1,0'], ['0,0', '1,0']);
  const seq = E.pageSequence(s);
  assert.equal(seq.folded, true);
  assert.deepEqual(seq.stacks[0].sequence, ['1', '2', '3', '4']);
  // 顶片是被翻面的左瓣：朝上的是其背面（页码 1）
  assert.equal(seq.stacks[0].leaves[0].upper.face, 'back');
  assert.equal(seq.stacks[0].leaves[0].upper.label, '1');
});

test('向左对折：右瓣叠到左格上方', () => {
  const s = E.applyFold(E.initialState(1, 2), { axis: 'v', line: 1, dir: 'l' });
  assert.deepEqual(s.stacks['0,0'], ['1,0', '0,0']);
});

test('拒绝：折线越界 / 移动侧为空（折线不在当前外轮廓）', () => {
  const s0 = E.initialState(2, 2);
  assert.equal(E.validateFold(s0, { axis: 'v', line: 0, dir: 'l' }).code, 'contour');
  assert.equal(E.validateFold(s0, { axis: 'v', line: 2, dir: 'r' }).code, 'contour');
  const s1 = E.applyFold(s0, { axis: 'v', line: 1, dir: 'r' });   // 沿中线把左瓣折到右边
  assert.deepEqual(Object.keys(s1.stacks).sort(), ['1,0', '1,1']);
  // 再想“向右折”：左瓣已无占用
  assert.equal(E.validateFold(s1, { axis: 'v', line: 1, dir: 'r' }).code, 'contour');
});

test('拒绝：镜像悬空（折线不在当前外轮廓），标出冲突格', () => {
  const s0 = E.initialState(2, 3);
  // 沿 x=1 折左瓣：x=0 镜像到 x=1（有格）合法；
  // 沿 x=2 折左瓣（宽两列的瓣折向右边）：x=1→x=2 合法，但 x=0→x=3 悬空
  const e = E.validateFold(s0, { axis: 'v', line: 2, dir: 'r' });
  assert.equal(e.code, 'contour');
  assert.ok(e.conflicts.includes('0,0'));
  assert.ok(e.conflicts.includes('3,0'));
  assert.equal(Object.keys(s0.stacks).length, 6);   // 校验不改状态
});

test('拒绝：厚度不一致（包折/单折页），标出两侧冲突格', () => {
  const s0 = E.initialState(1, 3);
  // 先把最左列折到中列：中列 2 层，右列 1 层
  const s1 = E.applyFold(s0, { axis: 'v', line: 1, dir: 'r' });
  assert.equal(s1.stacks['1,0'].length, 2);
  // 再把右列折向中列（向左折）：1 层 vs 2 层
  const e = E.validateFold(s1, { axis: 'v', line: 2, dir: 'l' });
  assert.equal(e.code, 'thickness');
  assert.ok(e.conflicts.includes('2,0'));
  assert.ok(e.conflicts.includes('1,0'));
});

test('2×2 两次对半折收成四片单叠（8 页折帖），输出骑马钉顺序', () => {
  const s0 = E.initialState(2, 2, L({
    '0,0': ['4', '5'], '1,0': ['6', '3'],
    '0,1': ['8', '1'], '1,1': ['7', '2']
  }));
  const s1 = E.applyFold(s0, { axis: 'v', line: 1, dir: 'r' });
  assert.equal(Object.keys(s1.stacks).length, 2);
  assert.equal(s1.stacks['1,0'].length, 2);
  assert.equal(s1.stacks['1,1'].length, 2);
  const s2 = E.applyFold(s1, { axis: 'h', line: 1, dir: 'd' });
  assert.equal(Object.keys(s2.stacks).length, 1);
  assert.equal(s2.stacks['1,1'].length, 4);
  const seq = E.pageSequence(s2);
  // stack['1,1'] 顶→底 = [b,a,c,d]；骑马钉序列 = 各上面(顶→底)+各下面(底→顶)
  assert.deepEqual(seq.stacks[0].sequence, ['3', '4', '1', '7', '2', '8', '5', '6']);
  // b、a 经过末轮水平折，页码倒置；c 只经竖直折、d 未被水平折，保持正立
  const leaves = Object.fromEntries(seq.stacks[0].leaves.map((l) => [l.panelId, l]));
  assert.equal(leaves['1,0'].upper.upright, false);   // b
  assert.equal(leaves['0,0'].upper.upright, false);   // a
  assert.equal(leaves['0,1'].upper.upright, true);    // c
  assert.equal(leaves['1,1'].upper.upright, true);    // d
});

test('2×3 竖折后水平对折：镜像对等厚，合法收成 4 层双格', () => {
  const s1 = E.applyFold(E.initialState(2, 3), { axis: 'v', line: 1, dir: 'r' });
  assert.equal(E.validateFold(s1, { axis: 'h', line: 1, dir: 'd' }), null);
  const s2 = E.applyFold(s1, { axis: 'h', line: 1, dir: 'd' });
  assert.deepEqual(Object.keys(s2.stacks).sort(), ['1,1', '2,1']);
  assert.equal(s2.stacks['1,1'].length, 4);
  assert.equal(s2.stacks['2,1'].length, 2);
});

test('3×1 连续同向单页折 → 第二次厚度冲突（1 层压向 2 层）', () => {
  const s1 = E.applyFold(E.initialState(3, 1), { axis: 'h', line: 1, dir: 'd' });
  assert.equal(s1.stacks['0,1'].length, 2);   // 上行折入中行
  const e = E.validateFold(s1, { axis: 'h', line: 2, dir: 'u' });
  assert.equal(e.code, 'thickness');
  assert.ok(e.conflicts.includes('0,2'));
  assert.ok(e.conflicts.includes('0,1'));
});

test('水平折使页码倒置可被检出（frame.y 翻转）', () => {
  const s0 = E.initialState(2, 1, L({ '0,0': ['A', 'B'], '0,1': ['C', 'D'] }));
  const s = E.applyFold(s0, { axis: 'h', line: 1, dir: 'd' });
  const top = s.stacks['0,1'][0];
  const p = s.panels[top];
  assert.deepEqual(p.frame.y, { x: 0, y: -1, z: 0 });
  const leaf = E.pageSequence(s).stacks[0].leaves.find((l) => l.panelId === top);
  assert.equal(leaf.upper.upright, false);
  assert.equal(leaf.lower.upright, false);
});

test('replay：重放全部步骤，失败步返回错误且冲突可定位', () => {
  const plan = {
    rows: 1, cols: 3, labels: {},
    steps: [
      { axis: 'v', line: 1, dir: 'r' },
      { axis: 'v', line: 2, dir: 'l' }   // 厚度冲突
    ]
  };
  const r = E.replay(plan.rows, plan.cols, plan.labels, plan.steps);
  assert.ok(r.error);
  assert.equal(r.error.stepIndex, 1);
  assert.equal(r.error.code, 'thickness');
  const r0 = E.replay(plan.rows, plan.cols, plan.labels, plan.steps, 1);
  assert.deepEqual(Object.keys(r0.state.stacks), ['1,0','2,0']);
  assert.equal(r0.error, null);
});

test('normalizePlan：接受合法方案，拒绝非法步骤/越界标签', () => {
  const p = E.normalizePlan({
    name: 't', rows: 2, cols: 2,
    labels: { '0,0': { front: 1, back: 8 } },
    steps: [{ axis: 'v', line: 1, dir: 'r' }]
  });
  assert.equal(p.labels['0,0'].front, '1');
  assert.throws(() => E.normalizePlan({ rows: 0, cols: 2 }));
  assert.throws(() => E.normalizePlan({
    rows: 2, cols: 2,
    labels: { '5,5': { front: 'x', back: 'y' } }
  }));
  assert.throws(() => E.normalizePlan({ rows: 2, cols: 2, steps: [{ axis: 'z' }] }));
});

test('空白页码输出为 null', () => {
  const s = E.applyFold(E.initialState(1, 2), { axis: 'v', line: 1, dir: 'r' });
  assert.deepEqual(E.pageSequence(s).stacks[0].sequence, [null, null, null, null]);
});

// ---------- 自动拼版 ----------
test('autoImpose：1×2 骑马钉，起始 1、4 页 → 反推各格正反面页码', () => {
  const steps = [{ axis: 'v', line: 1, dir: 'r' }];
  const r = E.autoImpose({ rows: 1, cols: 2, steps, startPage: 1, pageCount: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.capacity, 4);
  // 阅读槽位 1..4 连续填码
  assert.deepEqual(r.slots.map((s) => s.label), ['1', '2', '3', '4']);
  // 反向映射：0,0 正面=4 反面=1；1,0 正面=2 反面=3（与既有用例标注一致）
  assert.deepEqual(r.labels['0,0'], { front: '4', back: '1' });
  assert.deepEqual(r.labels['1,0'], { front: '2', back: '3' });
});

test('autoImpose：每个槽位都带原始纸格 id 与面别、朝向，可直接反向定位', () => {
  const steps = [{ axis: 'v', line: 1, dir: 'r' }];
  const r = E.autoImpose({ rows: 1, cols: 2, steps, startPage: 1, pageCount: 4 });
  const byCell = {};
  for (const s of r.slots) {
    (byCell[s.panelId] = byCell[s.panelId] || []).push(s);
    assert.ok(['front', 'back'].includes(s.face));
    assert.equal(typeof s.upright, 'boolean');
  }
  // 每个原始纸格的正、反面各出现一次
  for (const id of ['0,0', '1,0']) {
    const faces = byCell[id].map((s) => s.face).sort();
    assert.deepEqual(faces, ['back', 'front']);
  }
});

test('autoImpose：2×2 八页折帖，页码 1..8 反推后回放恰为连续阅读顺序', () => {
  const steps = [
    { axis: 'v', line: 1, dir: 'r' },
    { axis: 'h', line: 1, dir: 'd' }
  ];
  const r = E.autoImpose({ rows: 2, cols: 2, steps, startPage: 1, pageCount: 8 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.slots.map((s) => s.label),
    ['1', '2', '3', '4', '5', '6', '7', '8']);
  // 强校验：把反推得到的 labels 放回引擎重放，阅读槽位必须严格 1..8
  const rep = E.replay(2, 2, r.labels, steps);
  assert.equal(rep.error, null);
  assert.deepEqual(E.pageSequence(rep.state).stacks[0].sequence,
    ['1', '2', '3', '4', '5', '6', '7', '8']);
});

test('autoImpose：支持非 1 起始页码（起始 9 → 9..12）', () => {
  const r = E.autoImpose({
    rows: 1, cols: 2,
    steps: [{ axis: 'v', line: 1, dir: 'r' }],
    startPage: 9, pageCount: 4
  });
  assert.deepEqual(r.slots.map((s) => s.label), ['9', '10', '11', '12']);
  assert.deepEqual(r.labels['1,0'], { front: '10', back: '11' });
});

test('autoImpose：页数小于容量时末尾槽位空白并标记 blank/纸格/面', () => {
  const r = E.autoImpose({
    rows: 1, cols: 2,
    steps: [{ axis: 'v', line: 1, dir: 'r' }],
    startPage: 1, pageCount: 2
  });
  assert.equal(r.ok, true);
  assert.equal(r.slots[0].blank, false);
  assert.equal(r.slots[1].label, '2');
  assert.equal(r.slots[2].blank, true);
  assert.equal(r.slots[2].label, null);
  assert.equal(r.slots[3].blank, true);
  assert.ok(r.slots[2].panelId);
  assert.ok(r.slots[3].panelId);
  assert.ok(['front', 'back'].includes(r.slots[3].face));
  // 只有前 2 页写入 labels，留空面保持空串
  const vals = Object.values(r.labels).flatMap((v) => [v.front, v.back]);
  assert.deepEqual(vals.sort(), ['', '', '1', '2']);
});

test('autoImpose：页数超出容量被拒，原因含容量数值', () => {
  const r = E.autoImpose({
    rows: 1, cols: 2,
    steps: [{ axis: 'v', line: 1, dir: 'r' }],
    startPage: 1, pageCount: 5
  });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'too_many');
  assert.match(r.error.message, /超出纸格总面数 4/);
});

test('autoImpose：起始页码/页数非法被拒', () => {
  const steps = [{ axis: 'v', line: 1, dir: 'r' }];
  assert.equal(E.autoImpose({ rows: 1, cols: 2, steps, startPage: 0, pageCount: 4 }).error.code, 'bad_start');
  assert.equal(E.autoImpose({ rows: 1, cols: 2, steps, startPage: 1, pageCount: 0 }).error.code, 'bad_count');
  assert.equal(E.autoImpose({ rows: 1, cols: 2, steps, startPage: -2, pageCount: 4 }).error.code, 'bad_start');
  assert.equal(E.autoImpose({ rows: 1, cols: 2, steps, startPage: 'x', pageCount: 4 }).error.code, 'bad_start');
});

test('autoImpose：存在非法折叠时禁用并给出具体原因与冲突格', () => {
  const steps = [
    { axis: 'v', line: 1, dir: 'r' },
    { axis: 'v', line: 2, dir: 'l' }   // 1×3 厚度冲突
  ];
  const r = E.autoImpose({ rows: 1, cols: 3, steps, startPage: 1, pageCount: 4 });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'illegal_fold');
  assert.match(r.error.message, /第 2 步/);
  assert.deepEqual(r.error.conflicts, ['2,0', '1,0']);
});

test('autoImpose：未收成单叠时禁用并给出叠层数', () => {
  // 2×2 只折一次 → 两个分离叠层
  const r = E.autoImpose({
    rows: 2, cols: 2,
    steps: [{ axis: 'v', line: 1, dir: 'r' }],
    startPage: 1, pageCount: 8
  });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'not_single');
  assert.match(r.error.message, /2 个分离叠层/);
});

test('autoImpose：1×1 零步本身即单叠，正反两槽', () => {
  const r = E.autoImpose({ rows: 1, cols: 1, steps: [], startPage: 1, pageCount: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.capacity, 2);
  assert.deepEqual(r.slots.map((s) => s.label), ['1', '2']);
  assert.deepEqual(r.labels['0,0'], { front: '1', back: '2' });
});

test('autoImpose：覆盖汇总逐个面列出（现有标注非空）', () => {
  // 现有标注全部写 9：4 个面都会被覆盖；其中页数=2 时另两个面被清空
  const existing = {
    '0,0': { front: '9', back: '9' },
    '1,0': { front: '9', back: '9' }
  };
  const steps = [{ axis: 'v', line: 1, dir: 'r' }];
  const full = E.autoImpose({ rows: 1, cols: 2, steps, startPage: 1, pageCount: 4, existingLabels: existing });
  assert.equal(full.overwrites.length, 4);
  const byKey = Object.fromEntries(full.overwrites.map((o) => [`${o.panelId}:${o.face}`, o]));
  assert.equal(byKey['0,0:back'].to, '1');
  assert.equal(byKey['0,0:back'].from, '9');

  const partial = E.autoImpose({ rows: 1, cols: 2, steps, startPage: 1, pageCount: 2, existingLabels: existing });
  // 槽位 3、4 被清空
  const cleared = partial.overwrites.filter((o) => o.to === '');
  assert.equal(cleared.length, 2);
  cleared.forEach((o) => assert.equal(o.from, '9'));
});

test('autoImpose：现有标注与拼版结果一致时覆盖汇总为空', () => {
  const labels = { '0,0': { front: '4', back: '1' }, '1,0': { front: '2', back: '3' } };
  const r = E.autoImpose({
    rows: 1, cols: 2,
    steps: [{ axis: 'v', line: 1, dir: 'r' }],
    startPage: 1, pageCount: 4, existingLabels: labels
  });
  assert.equal(r.overwrites.length, 0);
});
