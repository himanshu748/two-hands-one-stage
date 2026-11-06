const sensitiveKey = /authorization|cookie|password|secret|token|api.?key|credential/i;
const sensitiveValue = /\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)\b/gi;

/** Callers also avoid passing bodies, prompts, raw provider errors or credential-bearing URLs. */
export function redact(value: unknown, secrets: readonly string[] = [], depth = 0): unknown {
  if (depth > 8) return '[truncated]';
  if (typeof value === 'string') {
    let result = value;
    for (const secret of secrets) if (secret.length >= 4) result = result.split(secret).join('[redacted]');
    return result.replace(sensitiveValue, '[redacted]').slice(0, 2000);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redact(entry, secrets, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, entry]) => [key, sensitiveKey.test(key) ? '[redacted]' : redact(entry, secrets, depth + 1)]));
  }
  return '[omitted]';
}

export function createLogger(role: string, secrets: readonly string[] = [], write: (line: string) => void = console.log) {
  return (event: string, fields: Record<string, unknown> = {}): void => {
    write(JSON.stringify(redact({ time: new Date().toISOString(), role, event, ...fields }, secrets)));
  };
}
