import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CatalogValidationError,
  PUBLIC_CONTRACT,
  validateEventsCatalog,
  validateOperationsCatalog,
} from '../scripts/lib/catalog-validation.mjs';

// 合成公开契约只包含占位数据，避免测试夹具本身成为敏感数据泄露源。
function createOperation({ id, method, path, risk }) {
  const confirmation = {
    read: { mode: 'none', optIn: null },
    write: { mode: 'hmac-sha256', optIn: null },
    credential: { mode: 'hmac-sha256', optIn: 'credential' },
    destructive: { mode: 'hmac-sha256', optIn: 'destructive' },
  }[risk];
  return {
    id,
    operationId: id.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase()),
    category: 'Synthetic',
    title: { en: `Synthetic ${id}`, zhCN: `合成 ${id}` },
    method,
    path,
    docs: {
      en: `https://www.unifyport.ai/docs/synthetic/${id}/`,
      zhCN: `https://www.unifyport.ai/zh-CN/docs/synthetic/${id}/`,
    },
    pathParams: [...path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]),
    queryFields: [],
    bodyFields: method === 'GET' ? [] : ['value'],
    risk,
    sensitiveFields: ['id'],
    confirmation,
  };
}

function createOperationsCatalog() {
  const operations = Object.entries(PUBLIC_CONTRACT.operations).map(([id, value]) => createOperation({
    id,
    method: value.method,
    path: value.path,
    risk: value.method === 'GET' ? 'read' : value.method === 'DELETE' ? 'destructive' : 'write',
  }));

  return {
    schemaVersion: 1,
    source: {
      publicDocs: {
        en: 'https://www.unifyport.ai/docs/',
        zhCN: 'https://www.unifyport.ai/zh-CN/docs/',
      },
      scope: 'Synthetic public documentation fixture',
      retrievedAt: '2026-07-20',
    },
    counts: {
      documentedActions: 68,
      uniqueRoutes: 64,
      methods: { GET: 19, POST: 43, PATCH: 4, DELETE: 2 },
    },
    operations,
  };
}

function createEventsCatalog() {
  return {
    schemaVersion: 1,
    source: {
      publicDocs: {
        en: 'https://www.unifyport.ai/docs/receiving-events/webhook-events/',
        zhCN: 'https://www.unifyport.ai/zh-CN/docs/receiving-events/webhook-events/',
      },
      scope: 'Synthetic public event fixture',
      retrievedAt: '2026-07-20',
    },
    counts: { events: 18 },
    events: PUBLIC_CONTRACT.events.map((type, index) => ({
      type,
      description: { en: `Synthetic event ${index}`, zhCN: `合成事件 ${index}` },
      docs: {
        en: `https://www.unifyport.ai/docs/receiving-events/event-${type.replaceAll('.', '-')}/`,
        zhCN: `https://www.unifyport.ai/zh-CN/docs/receiving-events/event-${type.replaceAll('.', '-')}/`,
      },
      risk: index === 0 ? 'credential' : 'read',
      sensitiveFields: ['id'],
      confirmation: { mode: 'none', optIn: null },
    })),
  };
}

test('accepts the exact 68 action, 64 route, and method distribution contract', () => {
  const result = validateOperationsCatalog(createOperationsCatalog());
  assert.deepEqual(result, {
    documentedActions: 68,
    uniqueRoutes: 64,
    methods: { GET: 19, POST: 43, PATCH: 4, DELETE: 2 },
  });
});

test('rejects a downgraded write confirmation', () => {
  const catalog = createOperationsCatalog();
  const operation = catalog.operations.find((entry) => entry.method === 'POST');
  operation.confirmation = { mode: 'none', optIn: null };

  assert.throws(
    () => validateOperationsCatalog(catalog),
    (error) => error instanceof CatalogValidationError && error.issues.some((issue) => issue.includes('must be hmac-sha256 for write risk')),
  );
});

test('rejects read-only or undocumented top-level request fields', () => {
  for (const field of ['runtime_status', 'proxy']) {
    const catalog = createOperationsCatalog();
    const operation = catalog.operations.find((entry) => entry.id === 'create-account');
    operation.bodyFields.push(field);

    assert.throws(
      () => validateOperationsCatalog(catalog),
      (error) => error instanceof CatalogValidationError
        && error.issues.some((issue) => issue.includes(`undocumented or read-only field: ${field}`)),
    );
  }
});

test('requires credential and destructive opt-in scopes', () => {
  const catalog = createOperationsCatalog();
  const operation = catalog.operations[0];
  operation.risk = 'credential';
  operation.confirmation = { mode: 'hmac-sha256', optIn: null };

  assert.throws(
    () => validateOperationsCatalog(catalog),
    (error) => error instanceof CatalogValidationError && error.issues.some((issue) => issue.includes('credential risk')),
  );
});

test('allows aliases only for the five documented message cards', () => {
  const catalog = createOperationsCatalog();
  const first = catalog.operations.find((entry) => entry.id === 'get-workspace');
  const second = catalog.operations.find((entry) => entry.id === 'list-accounts');
  second.path = first.path;

  assert.throws(
    () => validateOperationsCatalog(catalog),
    (error) => error instanceof CatalogValidationError && error.issues.some((issue) => issue.includes('only POST /v1/messages')),
  );
});

test('rejects a same-count route replacement outside the exact public contract', () => {
  const catalog = createOperationsCatalog();
  const operation = catalog.operations.find((entry) => entry.id === 'get-workspace');
  operation.path = '/v1/foo';

  assert.throws(
    () => validateOperationsCatalog(catalog),
    (error) => error instanceof CatalogValidationError && error.issues.some((issue) => issue.includes('get-workspace must remain GET /v1/workspace')),
  );
});

test('rejects internal routes and non-canonical documentation origins', () => {
  const catalog = createOperationsCatalog();
  catalog.operations[0].path = ['/v1', 'internal', 'example'].join('/');
  catalog.operations[0].docs.en = 'https://unifyport.ai/docs/synthetic/example/';

  assert.throws(
    () => validateOperationsCatalog(catalog),
    (error) => error instanceof CatalogValidationError
      && error.issues.some((issue) => issue.includes('internal segment'))
      && error.issues.some((issue) => issue.includes('exact public origin')),
  );
});

test('requires an actual retrieval calendar date', () => {
  const catalog = createOperationsCatalog();
  catalog.source.retrievedAt = '2026-02-30';

  assert.throws(
    () => validateOperationsCatalog(catalog),
    (error) => error instanceof CatalogValidationError && error.issues.some((issue) => issue.includes('valid YYYY-MM-DD')),
  );
});

test('accepts 18 unique bilingual informational events', () => {
  assert.deepEqual(validateEventsCatalog(createEventsCatalog()), { events: 18 });
});

test('rejects duplicate events and missing bilingual descriptions', () => {
  const catalog = createEventsCatalog();
  catalog.events[1].type = catalog.events[0].type;
  delete catalog.events[1].description.zhCN;

  assert.throws(
    () => validateEventsCatalog(catalog),
    (error) => error instanceof CatalogValidationError
      && error.issues.some((issue) => issue.includes('event type must be unique'))
      && error.issues.some((issue) => issue.includes('description.zhCN')),
  );
});

test('rejects a same-count event replacement outside the exact public contract', () => {
  const catalog = createEventsCatalog();
  catalog.events[0].type = 'synthetic.replacement';

  assert.throws(
    () => validateEventsCatalog(catalog),
    (error) => error instanceof CatalogValidationError
      && error.issues.some((issue) => issue.includes('exact public event is missing'))
      && error.issues.some((issue) => issue.includes('event is not in the exact public contract')),
  );
});
