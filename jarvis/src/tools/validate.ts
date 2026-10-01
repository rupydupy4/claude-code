/**
 * A small, strict validator for tool inputs. AI-generated arguments are untrusted: only declared
 * properties survive, types are coerced or rejected, strings are length-limited, enums enforced.
 */
export type PropSchema =
  | { type: 'string'; description?: string; enum?: readonly string[]; maxLength?: number }
  | { type: 'number' | 'integer'; description?: string; minimum?: number; maximum?: number }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; description?: string; items: { type: 'string' }; maxItems?: number };

export interface ObjectSchema {
  type: 'object';
  properties: Record<string, PropSchema>;
  required?: string[];
}

export class ToolInputError extends Error {}

export function validateInput(schema: ObjectSchema, input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) input = {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new ToolInputError('Arguments must be an object.');
  const raw = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    let v = raw[key];
    if (v === undefined || v === null || v === '') continue;
    switch (prop.type) {
      case 'string': {
        if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
        if (typeof v !== 'string') throw new ToolInputError(`“${key}” must be text.`);
        const s = v.trim().slice(0, prop.maxLength ?? 2000);
        if (prop.enum && !prop.enum.includes(s)) throw new ToolInputError(`“${key}” must be one of: ${prop.enum.join(', ')}.`);
        if (s) out[key] = s;
        break;
      }
      case 'number':
      case 'integer': {
        const n = typeof v === 'string' ? Number(v) : v;
        if (typeof n !== 'number' || !Number.isFinite(n)) throw new ToolInputError(`“${key}” must be a number.`);
        if (prop.type === 'integer' && !Number.isInteger(n)) throw new ToolInputError(`“${key}” must be a whole number.`);
        if (prop.minimum !== undefined && n < prop.minimum) throw new ToolInputError(`“${key}” must be at least ${prop.minimum}.`);
        if (prop.maximum !== undefined && n > prop.maximum) throw new ToolInputError(`“${key}” must be at most ${prop.maximum}.`);
        out[key] = n;
        break;
      }
      case 'boolean':
        if (typeof v === 'string') v = v === 'true';
        if (typeof v !== 'boolean') throw new ToolInputError(`“${key}” must be true or false.`);
        out[key] = v;
        break;
      case 'array': {
        const arr = typeof v === 'string' ? v.split(',') : v;
        if (!Array.isArray(arr)) throw new ToolInputError(`“${key}” must be a list.`);
        out[key] = arr.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, prop.maxItems ?? 20);
        break;
      }
    }
  }
  for (const r of schema.required ?? []) if (out[r] === undefined) throw new ToolInputError(`“${r}” is required.`);
  return out;
}
