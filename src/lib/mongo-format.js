export const OBJECT_ID_HEX_RE = /^[a-fA-F0-9]{24}$/;

export function isObjectIdHexString(value) {
  return typeof value === 'string' && OBJECT_ID_HEX_RE.test(value);
}

export function isObjectIdField(fieldName) {
  const last = String(fieldName || '').split('.').at(-1) || '';
  if (!last) return false;
  const normalized = last.toLowerCase();
  return normalized === '_id' || normalized.endsWith('_id') || normalized.endsWith('id');
}

export function shouldRenderAsObjectId(value, fieldName) {
  if (!isObjectIdHexString(value)) return false;
  const field = String(fieldName || '').trim();
  if (!field) return true;
  return isObjectIdField(field);
}

export function formatObjectId(value) {
  return `ObjectId("${value}")`;
}

function toMongoShellLiteral(value, fieldName, level, indentSize) {
  const indent = ' '.repeat(level * indentSize);
  const childIndent = ' '.repeat((level + 1) * indentSize);

  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);

  if (typeof value === 'string') {
    if (shouldRenderAsObjectId(value, fieldName)) return formatObjectId(value);
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const rows = value.map((item) => `${childIndent}${toMongoShellLiteral(item, '', level + 1, indentSize)}`);
    return `\n${rows.join(',\n')}\n${indent}`.replace(/^\n/, '[\n') + ']';
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    const rows = keys.map((key) => {
      const literal = toMongoShellLiteral(value[key], key, level + 1, indentSize);
      return `${childIndent}${JSON.stringify(key)}: ${literal}`;
    });
    return `\n${rows.join(',\n')}\n${indent}`.replace(/^\n/, '{\n') + '}';
  }

  return JSON.stringify(value);
}

export function toMongoShellString(value, indentSize = 2) {
  return toMongoShellLiteral(value, '', 0, indentSize);
}
