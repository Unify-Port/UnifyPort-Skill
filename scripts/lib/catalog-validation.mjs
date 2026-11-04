import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// 公开目录是运行时授权边界，因此任何结构漂移都必须显式失败，不能静默降级。
const EXPECTED_METHOD_COUNTS = Object.freeze({
  GET: 23,
  POST: 53,
  PATCH: 4,
  DELETE: 2,
});

const EXPECTED_OPERATION_COUNT = 82;
const EXPECTED_ROUTE_COUNT = 78;
const EXPECTED_EVENT_COUNT = 24;
const ALLOWED_RISKS = new Set(['read', 'write', 'credential', 'destructive']);
const ALLOWED_CONFIRMATION_MODES = new Set(['none', 'hmac-sha256']);
const ALLOWED_OPT_INS = new Set([null, 'credential', 'destructive']);
// 本次部署文档公开了配置字段，授权状态仍为服务端所有。
const FORBIDDEN_PUBLIC_BODY_FIELDS = new Set(['auth_status']);
const POST_READ_ACTIONS = new Set(['get-post','list-post-comments']);
const DUPLICATED_ROUTE = 'POST /v1/messages';
const PUBLIC_DOC_ORIGIN = 'https://www.unifyport.ai';
const MESSAGE_ALIAS_IDS = new Set([
  'send-text-message',
  'send-media-message',
  'send-contact-message',
  'send-reply-message',
  'send-mention-message',
]);

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

export const PUBLIC_CONTRACT = deepFreeze(JSON.parse(
  readFileSync(new URL('../public-contract.json', import.meta.url), 'utf8'),
));

function assertMaintainerContract() {
  const operationEntries = Object.entries(PUBLIC_CONTRACT.operations ?? {});
  const events = PUBLIC_CONTRACT.events ?? [];
  const sourceIssues = [];
  validateSource(PUBLIC_CONTRACT.source, 'maintainerContract.source', sourceIssues);
  const messageIds = operationEntries
    .filter(([, value]) => value.method === 'POST' && value.path === '/v1/messages')
    .map(([id]) => id);

  if (PUBLIC_CONTRACT.schemaVersion !== 1
    || operationEntries.length !== EXPECTED_OPERATION_COUNT
    || events.length !== EXPECTED_EVENT_COUNT
    || new Set(events).size !== EXPECTED_EVENT_COUNT
    || messageIds.length !== MESSAGE_ALIAS_IDS.size
    || messageIds.some((id) => !MESSAGE_ALIAS_IDS.has(id))
    || sourceIssues.length > 0) {
    throw new Error('scripts/public-contract.json violates the maintainer contract');
  }
}

assertMaintainerContract();

export class CatalogValidationError extends Error {
  constructor(label, issues) {
    super(`${label} validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'CatalogValidationError';
    this.issues = issues;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addIssue(issues, condition, message) {
  if (!condition) {
    issues.push(message);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateLocalizedText(value, label, issues) {
  addIssue(issues, isRecord(value), `${label} must be an object`);
  if (!isRecord(value)) {
    return;
  }

  addIssue(issues, isNonEmptyString(value.en), `${label}.en must be a non-empty string`);
  addIssue(issues, isNonEmptyString(value.zhCN), `${label}.zhCN must be a non-empty string`);
}

function parsePublicDocsUrl(value, locale, label, issues) {
  if (!isNonEmptyString(value)) {
    issues.push(`${label} must be a non-empty HTTPS URL`);
    return;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    issues.push(`${label} must be a valid URL`);
    return;
  }

  addIssue(issues, parsed.origin === PUBLIC_DOC_ORIGIN, `${label} must use the exact public origin ${PUBLIC_DOC_ORIGIN}`);
  addIssue(issues, parsed.username === '' && parsed.password === '', `${label} must not contain URL credentials`);
  addIssue(issues, parsed.search === '', `${label} must not contain query parameters`);

  const expectedPrefix = locale === 'zhCN' ? '/zh-CN/docs/' : '/docs/';
  addIssue(issues, parsed.pathname.startsWith(expectedPrefix), `${label} must point to ${expectedPrefix}`);
  addIssue(issues, !/(^|\/)internal(?:\/|$)/i.test(parsed.pathname), `${label} must not point to an internal route`);
}

function validateDocs(value, label, issues) {
  addIssue(issues, isRecord(value), `${label} must be an object`);
  if (!isRecord(value)) {
    return;
  }

  parsePublicDocsUrl(value.en, 'en', `${label}.en`, issues);
  parsePublicDocsUrl(value.zhCN, 'zhCN', `${label}.zhCN`, issues);
}

function validateSource(value, label, issues) {
  addIssue(issues, isRecord(value), `${label} must be an object`);
  if (!isRecord(value)) {
    return;
  }

  validateDocs(value.publicDocs, `${label}.publicDocs`, issues);
  addIssue(issues, isNonEmptyString(value.scope), `${label}.scope must be a non-empty string`);
  addIssue(issues, isValidIsoDate(value.retrievedAt), `${label}.retrievedAt must be a valid YYYY-MM-DD date`);
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validateStringArray(value, label, issues, { allowEmpty = true } = {}) {
  addIssue(issues, Array.isArray(value), `${label} must be an array`);
  if (!Array.isArray(value)) {
    return [];
  }

  if (!allowEmpty) {
    addIssue(issues, value.length > 0, `${label} must not be empty`);
  }

  const seen = new Set();
  value.forEach((entry, index) => {
    addIssue(issues, isNonEmptyString(entry), `${label}[${index}] must be a non-empty string`);
    if (isNonEmptyString(entry)) {
      addIssue(issues, !seen.has(entry), `${label} contains duplicate value: ${entry}`);
      seen.add(entry);
    }
  });
  return value;
}

function validateRisk(value, label, issues) {
  addIssue(issues, ALLOWED_RISKS.has(value), `${label} must be one of read, write, credential, destructive`);
}

function validateConfirmation(value, risk, label, issues, { event = false } = {}) {
  addIssue(issues, isRecord(value), `${label} must be an object`);
  if (!isRecord(value)) {
    return;
  }

  addIssue(issues, ALLOWED_CONFIRMATION_MODES.has(value.mode), `${label}.mode must be none or hmac-sha256`);
  addIssue(issues, ALLOWED_OPT_INS.has(value.optIn), `${label}.optIn must be null, credential, or destructive`);

  if (event) {
    addIssue(issues, value.mode === 'none' && value.optIn === null, `${label} for an informational event must be none/null`);
    return;
  }

  const expected = {
    read: { mode: 'none', optIn: null },
    write: { mode: 'hmac-sha256', optIn: null },
    credential: { mode: 'hmac-sha256', optIn: 'credential' },
    destructive: { mode: 'hmac-sha256', optIn: 'destructive' },
  }[risk];

  if (expected) {
    addIssue(issues, value.mode === expected.mode, `${label}.mode must be ${expected.mode} for ${risk} risk`);
    addIssue(issues, value.optIn === expected.optIn, `${label}.optIn must be ${String(expected.optIn)} for ${risk} risk`);
  }
}

function validateOperation(operation, index, issues) {
  const label = `operations[${index}]`;
  addIssue(issues, isRecord(operation), `${label} must be an object`);
  if (!isRecord(operation)) {
    return;
  }

  addIssue(issues, typeof operation.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(operation.id), `${label}.id must be a lowercase slug`);
  addIssue(issues, typeof operation.operationId === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(operation.operationId), `${label}.operationId must be an identifier`);
  addIssue(issues, isNonEmptyString(operation.category), `${label}.category must be a non-empty string`);
  validateLocalizedText(operation.title, `${label}.title`, issues);
  addIssue(issues, Object.hasOwn(EXPECTED_METHOD_COUNTS, operation.method), `${label}.method is unsupported`);
  addIssue(issues, typeof operation.path === 'string' && /^\/v1\/[A-Za-z0-9_{}./-]+$/.test(operation.path), `${label}.path must be a public /v1 route`);
  if (typeof operation.path === 'string') {
    addIssue(issues, !/(^|\/)internal(?:\/|$)/i.test(operation.path), `${label}.path must not contain an internal segment`);
  }
  validateDocs(operation.docs, `${label}.docs`, issues);
  if (isNonEmptyString(operation.id)) {
    for (const locale of ['en', 'zhCN']) {
      try {
        addIssue(issues, new URL(operation.docs?.[locale]).pathname.endsWith(`/${operation.id}/`), `${label}.docs.${locale} must end with the operation id`);
      } catch {
        // URL 格式错误已由统一 docs 校验报告，避免重复泄露原始值。
      }
    }
  }

  const pathParams = validateStringArray(operation.pathParams, `${label}.pathParams`, issues);
  validateStringArray(operation.queryFields, `${label}.queryFields`, issues);
  const bodyFields = validateStringArray(operation.bodyFields, `${label}.bodyFields`, issues);
  // 字段修正同样是公开授权边界，不能只核对 method/path 总数。
  for (const [key, expected] of Object.entries(PUBLIC_CONTRACT.reviewedRequestFields?.[operation.id] ?? {})) {
    addIssue(issues, JSON.stringify(operation[key]) === JSON.stringify(expected), `${label}.${key} differs from reviewed request fields`);
  }
  for (const field of bodyFields) {
    addIssue(issues, !FORBIDDEN_PUBLIC_BODY_FIELDS.has(field), `${label}.bodyFields contains undocumented or read-only field: ${field}`);
  }
  validateStringArray(operation.sensitiveFields, `${label}.sensitiveFields`, issues);
  if (operation.headerFields !== undefined) {
    const headers = validateStringArray(operation.headerFields, `${label}.headerFields`, issues);
    addIssue(issues, operation.id === 'create-account' && JSON.stringify(headers) === '["Idempotency-Key"]', `${label} has unsupported headers`);
  }
  validateRisk(operation.risk, `${label}.risk`, issues);
  validateConfirmation(operation.confirmation, operation.risk, `${label}.confirmation`, issues);

  if (operation.method === 'GET') {
    addIssue(issues, operation.risk === 'read' || operation.risk === 'credential', `${label} GET risk must be read or credential`);
  } else {
    addIssue(issues, operation.risk !== 'read' || POST_READ_ACTIONS.has(operation.id), `${label} non-GET operations must not be classified as read unless reviewed`);
  }

  if (typeof operation.path === 'string') {
    const placeholders = [...operation.path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
    const declared = [...pathParams].filter(isNonEmptyString).sort();
    addIssue(issues, JSON.stringify(placeholders) === JSON.stringify(declared), `${label}.pathParams must exactly match path placeholders`);
  }
}

function validateOperationCounts(counts, issues) {
  addIssue(issues, isRecord(counts), 'counts must be an object');
  if (!isRecord(counts)) {
    return;
  }

  addIssue(issues, counts.documentedActions === EXPECTED_OPERATION_COUNT, `counts.documentedActions must equal ${EXPECTED_OPERATION_COUNT}`);
  addIssue(issues, counts.uniqueRoutes === EXPECTED_ROUTE_COUNT, `counts.uniqueRoutes must equal ${EXPECTED_ROUTE_COUNT}`);
  addIssue(issues, isRecord(counts.methods), 'counts.methods must be an object');
  if (isRecord(counts.methods)) {
    for (const [method, expected] of Object.entries(EXPECTED_METHOD_COUNTS)) {
      addIssue(issues, counts.methods[method] === expected, `counts.methods.${method} must equal ${expected}`);
    }
    addIssue(issues, Object.keys(counts.methods).length === Object.keys(EXPECTED_METHOD_COUNTS).length, 'counts.methods must not contain undocumented methods');
  }
}

export function validateOperationsCatalog(catalog) {
  const issues = [];
  addIssue(issues, isRecord(catalog), 'catalog must be an object');
  if (!isRecord(catalog)) {
    throw new CatalogValidationError('Operations catalog', issues);
  }

  addIssue(issues, catalog.schemaVersion === 1, 'schemaVersion must equal 1');
  validateSource(catalog.source, 'source', issues);
  validateOperationCounts(catalog.counts, issues);
  addIssue(issues, Array.isArray(catalog.operations), 'operations must be an array');

  const operations = Array.isArray(catalog.operations) ? catalog.operations : [];
  addIssue(issues, operations.length === EXPECTED_OPERATION_COUNT, `operations must contain exactly ${EXPECTED_OPERATION_COUNT} documented actions`);
  operations.forEach((operation, index) => validateOperation(operation, index, issues));

  const ids = new Set();
  const operationIds = new Map();
  const docs = { en: new Set(), zhCN: new Set() };
  const routes = new Map();
  const methodCounts = Object.fromEntries(Object.keys(EXPECTED_METHOD_COUNTS).map((method) => [method, 0]));

  for (const operation of operations) {
    if (!isRecord(operation)) {
      continue;
    }
    if (isNonEmptyString(operation.id)) {
      addIssue(issues, !ids.has(operation.id), `operation id must be unique: ${operation.id}`);
      ids.add(operation.id);
      const expected = PUBLIC_CONTRACT.operations[operation.id];
      addIssue(issues, isRecord(expected), `operation id is not in the exact public contract: ${operation.id}`);
      if (isRecord(expected)) {
        addIssue(issues, operation.method === expected.method && operation.path === expected.path, `operation ${operation.id} must remain ${expected.method} ${expected.path}`);
      }
    }
    if (isNonEmptyString(operation.operationId)) {
      const entries = operationIds.get(operation.operationId) ?? [];
      entries.push(operation.id);
      operationIds.set(operation.operationId, entries);
    }
    for (const locale of ['en', 'zhCN']) {
      const url = operation.docs?.[locale];
      if (isNonEmptyString(url)) {
        addIssue(issues, !docs[locale].has(url), `operation docs.${locale} must be unique: ${url}`);
        docs[locale].add(url);
      }
    }
    if (Object.hasOwn(methodCounts, operation.method)) {
      methodCounts[operation.method] += 1;
    }
    if (isNonEmptyString(operation.method) && isNonEmptyString(operation.path)) {
      const route = `${operation.method} ${operation.path}`;
      const entries = routes.get(route) ?? [];
      entries.push(operation.id);
      routes.set(route, entries);
    }
  }

  for (const expectedId of Object.keys(PUBLIC_CONTRACT.operations)) {
    addIssue(issues, ids.has(expectedId), `exact public operation is missing: ${expectedId}`);
  }
  for (const [operationId, operationIdsForAlias] of operationIds.entries()) {
    if (operationId === 'sendMessage') {
      addIssue(
        issues,
        operationIdsForAlias.length === MESSAGE_ALIAS_IDS.size && operationIdsForAlias.every((id) => MESSAGE_ALIAS_IDS.has(id)),
        'sendMessage operationId aliases must exactly match the five public message cards',
      );
    } else {
      addIssue(issues, operationIdsForAlias.length === 1, `operationId must be unique: ${operationId}`);
    }
  }

  addIssue(issues, routes.size === EXPECTED_ROUTE_COUNT, `operations must contain exactly ${EXPECTED_ROUTE_COUNT} unique method/path routes`);
  for (const [method, expected] of Object.entries(EXPECTED_METHOD_COUNTS)) {
    addIssue(issues, methodCounts[method] === expected, `actual ${method} action count must equal ${expected}`);
  }

  for (const [route, routeIds] of routes.entries()) {
    if (route === DUPLICATED_ROUTE) {
      addIssue(issues, routeIds.length === 5, `${DUPLICATED_ROUTE} must have exactly five documented aliases`);
    } else {
      addIssue(issues, routeIds.length === 1, `only ${DUPLICATED_ROUTE} may have documented aliases; found ${route}`);
    }
  }
  addIssue(issues, routes.has(DUPLICATED_ROUTE), `${DUPLICATED_ROUTE} documented aliases are required`);

  if (issues.length > 0) {
    throw new CatalogValidationError('Operations catalog', issues);
  }

  return {
    documentedActions: operations.length,
    uniqueRoutes: routes.size,
    methods: methodCounts,
  };
}

function validateEvent(event, index, issues) {
  const label = `events[${index}]`;
  addIssue(issues, isRecord(event), `${label} must be an object`);
  if (!isRecord(event)) {
    return;
  }

  addIssue(issues, typeof event.type === 'string' && /^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(event.type), `${label}.type must be a lowercase event name`);
  validateLocalizedText(event.description, `${label}.description`, issues);
  validateDocs(event.docs, `${label}.docs`, issues);
  if (isNonEmptyString(event.type)) {
    const expectedSlug = `event-${event.type.replaceAll('.', '-')}`;
    for (const locale of ['en', 'zhCN']) {
      try {
        addIssue(issues, new URL(event.docs?.[locale]).pathname.endsWith(`/${expectedSlug}/`), `${label}.docs.${locale} must end with the event detail id`);
      } catch {
        // URL 格式错误已由统一 docs 校验报告，避免重复泄露原始值。
      }
    }
  }
  validateRisk(event.risk, `${label}.risk`, issues);
  validateStringArray(event.sensitiveFields, `${label}.sensitiveFields`, issues);
  validateConfirmation(event.confirmation, event.risk, `${label}.confirmation`, issues, { event: true });
}

export function validateEventsCatalog(catalog) {
  const issues = [];
  addIssue(issues, isRecord(catalog), 'catalog must be an object');
  if (!isRecord(catalog)) {
    throw new CatalogValidationError('Events catalog', issues);
  }

  addIssue(issues, catalog.schemaVersion === 1, 'schemaVersion must equal 1');
  validateSource(catalog.source, 'source', issues);
  addIssue(issues, isRecord(catalog.counts), 'counts must be an object');
  if (isRecord(catalog.counts)) {
    addIssue(issues, catalog.counts.events === EXPECTED_EVENT_COUNT, `counts.events must equal ${EXPECTED_EVENT_COUNT}`);
    addIssue(issues, Object.keys(catalog.counts).length === 1, 'counts must only declare the event count');
  }
  addIssue(issues, Array.isArray(catalog.events), 'events must be an array');

  const events = Array.isArray(catalog.events) ? catalog.events : [];
  addIssue(issues, events.length === EXPECTED_EVENT_COUNT, `events must contain exactly ${EXPECTED_EVENT_COUNT} entries`);
  events.forEach((event, index) => validateEvent(event, index, issues));

  const eventTypes = new Set();
  for (const event of events) {
    if (isRecord(event) && isNonEmptyString(event.type)) {
      addIssue(issues, !eventTypes.has(event.type), `event type must be unique: ${event.type}`);
      eventTypes.add(event.type);
    }
  }
  for (const expectedType of PUBLIC_CONTRACT.events) {
    addIssue(issues, eventTypes.has(expectedType), `exact public event is missing: ${expectedType}`);
  }
  for (const actualType of eventTypes) {
    addIssue(issues, PUBLIC_CONTRACT.events.includes(actualType), `event is not in the exact public contract: ${actualType}`);
  }

  if (issues.length > 0) {
    throw new CatalogValidationError('Events catalog', issues);
  }

  return { events: events.length };
}

export async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new CatalogValidationError(path.basename(filePath), [`invalid JSON: ${error.message}`]);
  }
}

export async function validateCatalogFiles(skillRoot) {
  const referencesRoot = path.join(skillRoot, 'references');
  const operations = await readJson(path.join(referencesRoot, 'operations.json'));
  const events = await readJson(path.join(referencesRoot, 'events.json'));

  return {
    operations: validateOperationsCatalog(operations),
    events: validateEventsCatalog(events),
  };
}

export const CATALOG_EXPECTATIONS = Object.freeze({
  documentedActions: EXPECTED_OPERATION_COUNT,
  uniqueRoutes: EXPECTED_ROUTE_COUNT,
  events: EXPECTED_EVENT_COUNT,
  methods: EXPECTED_METHOD_COUNTS,
});
