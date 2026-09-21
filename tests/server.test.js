'use strict';
/**
 * server.test.js —— 启动真实 Express 服务，验证：
 *  - /api/simulate?impose 自动拼版槽位/反推标签/禁用原因
 *  - /api/plans 保存/读取往返保留自动生成后的标签
 *  - 不带 impose 时响应向后兼容
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = Number(process.env.TEST_PORT || 31234);
const BASE = `http://127.0.0.1:${PORT}`;
const STEPS_8 = [
  { axis: 'v', line: 1, dir: 'r' },
  { axis: 'h', line: 1, dir: 'd' }
];

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(buf || '{}') }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(buf || '{}') }));
    }).on('error', reject);
  });
}

function del(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'DELETE' }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(buf || '{}') }));
    });
    req.on('error', reject);
    req.end();
  });
}

let server;
before(async () => {
  process.env.PORT = String(PORT);
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fold-test-'));
  // 必须在设置环境变量之后再 require：server.js 顶层读取 PORT/DATA_DIR
  server = require('../server.js');
  await new Promise((r) => setTimeout(r, 150));
});

after(async () => {
  await new Promise((r) => server.close(r));
});

test('simulate + impose：合法单叠返回槽位与反推标签，回放为 1..8', async () => {
  const r = await post(`${BASE}/api/simulate`, {
    rows: 2, cols: 2, steps: STEPS_8,
    impose: { startPage: 1, pageCount: 8 }
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.folded, true);
  assert.equal(r.json.imposition.capacity, 8);
  assert.deepEqual(r.json.imposition.slots.map((s) => s.label),
    ['1', '2', '3', '4', '5', '6', '7', '8']);
  // 槽位都带原始纸格与正/反面
  for (const s of r.json.imposition.slots) {
    assert.match(s.panelId, /^\d+,\d+$/);
    assert.ok(['front', 'back'].includes(s.face));
  }
  // 用反推标签再次 simulate（不带 impose），阅读顺序即 1..8
  const verify = await post(`${BASE}/api/simulate`, {
    rows: 2, cols: 2, steps: STEPS_8, labels: r.json.imposition.labels
  });
  assert.deepEqual(verify.json.stacks[0].sequence,
    ['1', '2', '3', '4', '5', '6', '7', '8']);
});

test('simulate + impose：页数不足时末尾槽 blank=true', async () => {
  const r = await post(`${BASE}/api/simulate`, {
    rows: 1, cols: 2,
    steps: [{ axis: 'v', line: 1, dir: 'r' }],
    impose: { startPage: 1, pageCount: 2 }
  });
  assert.equal(r.json.ok, true);
  const labels = r.json.imposition.slots.map((s) => s.label);
  assert.deepEqual(labels, ['1', '2', null, null]);
  assert.equal(r.json.imposition.slots[2].blank, true);
  assert.equal(r.json.imposition.slots[3].panelId, r.json.imposition.slots[3].panelId);
});

test('simulate + impose：页数超容量 → ok=false 且 imposeError 给出容量', async () => {
  const r = await post(`${BASE}/api/simulate`, {
    rows: 1, cols: 2,
    steps: [{ axis: 'v', line: 1, dir: 'r' }],
    impose: { startPage: 1, pageCount: 5 }
  });
  assert.equal(r.json.ok, false);
  assert.equal(r.json.imposeError.code, 'too_many');
  assert.match(r.json.imposeError.message, /超出纸格总面数 4/);
  assert.equal(r.json.imposition, null);
});

test('simulate + impose：非法折叠 → illegal_fold；未单叠 → not_single', async () => {
  const bad = await post(`${BASE}/api/simulate`, {
    rows: 1, cols: 3,
    steps: [
      { axis: 'v', line: 1, dir: 'r' },
      { axis: 'v', line: 2, dir: 'l' }
    ],
    impose: { startPage: 1, pageCount: 4 }
  });
  assert.equal(bad.json.imposeError.code, 'illegal_fold');
  assert.match(bad.json.imposeError.message, /第 2 步/);

  const multi = await post(`${BASE}/api/simulate`, {
    rows: 2, cols: 2,
    steps: [{ axis: 'v', line: 1, dir: 'r' }],
    impose: { startPage: 1, pageCount: 8 }
  });
  assert.equal(multi.json.imposeError.code, 'not_single');
});

test('simulate 不带 impose：响应无 imposition/imposeError（向后兼容）', async () => {
  const r = await post(`${BASE}/api/simulate`, {
    rows: 1, cols: 2, steps: [{ axis: 'v', line: 1, dir: 'r' }]
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal('imposition' in r.json, true);
  assert.equal(r.json.imposition, null);
  assert.equal(r.json.imposeError, null);
});

test('方案保存/读取往返保留自动生成后的标签', async () => {
  const imposed = (await post(`${BASE}/api/simulate`, {
    rows: 2, cols: 2, steps: STEPS_8,
    impose: { startPage: 1, pageCount: 8 }
  })).json.imposition.labels;

  const saved = await post(`${BASE}/api/plans`, {
    name: '自动拼版八页折帖', rows: 2, cols: 2,
    labels: imposed, steps: STEPS_8
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.ok, true);

  const loaded = await get(`${BASE}/api/plans/${saved.json.id}`);
  assert.deepEqual(loaded.json.labels, imposed);
  assert.equal(loaded.json.steps.length, 2);

  // 清理
  const removed = await del(`${BASE}/api/plans/${saved.json.id}`);
  assert.equal(removed.json.ok, true);
});
