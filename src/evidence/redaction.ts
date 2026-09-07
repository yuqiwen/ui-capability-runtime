export function redactSensitiveText(value: string): string {
  return value
    .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\b[A-Z][A-Z0-9]{0,15}-[A-Z0-9]{3,}\b/g, "[REDACTED_IDENTIFIER]")
    .replace(/\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g, "[REDACTED_SSN]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\$[0-9][0-9,]*(?:\.[0-9]{2})?/g, "[REDACTED_AMOUNT]")
    .replace(/\b(?:member|customer|client|user|account|ticket)[-_ ]?(?:id|number|identifier)?\s*[=:]\s*[^,;\s]+/gi, (match) => `${match.split(/[=:]/, 1)[0]}=[REDACTED]`);
}
