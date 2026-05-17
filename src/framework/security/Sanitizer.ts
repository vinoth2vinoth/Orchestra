/**
 * Sanitizer provides utilities to prevent Prompt Injection (Indirect and Direct).
 * It ensures that untrusted data from memory or blackboard doesn't break out of its context.
 */
export class Sanitizer {
    /**
     * Escapes critical structural tags that could be used for prompt injection.
     */
    public static escapePromptInjections(text: string): string {
        if (!text) return '';
        
        // Escape standard XML/Markdown like tags if they match our internal structural blocks
        let escaped = text
            .replace(/\[MEMGPT_CORE_MEMORY\]/g, '\\[MEMGPT_CORE_MEMORY\\]')
            .replace(/\[\/MEMGPT_CORE_MEMORY\]/g, '\\[\\/MEMGPT_CORE_MEMORY\\]')
            .replace(/\[LEARNED_EXPERIENCE_ORCHESTRATION\]/g, '\\[LEARNED_EXPERIENCE_ORCHESTRATION\\]')
            .replace(/\[INSTRUCTIONAL_MUTATION_ACTIVE\]/g, '\\[INSTRUCTIONAL_MUTATION_ACTIVE\\]')
            .replace(/SYSTEM_INSTRUCTION:/g, 'SYSTEM_INSTRUCTION\\:')
            .replace(/SECURITY DIRECTIVE:/g, 'SECURITY DIRECTIVE\\:');

        // Prevent triple-backtick breakout if used in markdown blocks
        escaped = escaped.replace(/```/g, '`\\`\\`');

        return escaped;
    }

    /**
     * Wraps untrusted data in a sterile boundary.
     */
    public static wrapSterile(text: string, label: string = 'UNTRUSTED_DATA'): string {
        const escaped = this.escapePromptInjections(text);
        return `\n<${label}>\n${escaped}\n</${label}>\n`;
    }

    /**
     * Basic PII/Secret scrubbing - targeted patterns for API keys, JWTs, and sensitive IDs.
     */
    public static scrubSecrets(text: string): string {
        if (!text) return '';
        
        let scrubbed = text;
        
        // Redact standard API keys (e.g. sk-..., AIza...)
        scrubbed = scrubbed.replace(/(sk-[a-zA-Z0-9]{20,})|(AIza[a-zA-Z0-9_-]{35,})/g, '[REDACTED_API_KEY]');
        
        // Redact JWTs
        scrubbed = scrubbed.replace(/eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]');

        // Redact emails
        scrubbed = scrubbed.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');

        // Universal entropy-based long string check (e.g. hex/base64 secrets)
        scrubbed = scrubbed.replace(/[a-zA-Z0-9/+]{32,}/g, (match) => {
            // Only redact if it looks like high-entropy data (random-ish)
            // This is a naive check to avoid redacting long legitimate words
            const hasNumbers = /[0-9]/.test(match);
            const hasSpecial = /[+/]/.test(match);
            if (match.length > 40 || (hasNumbers && match.length > 32) || hasSpecial) {
                return '[REDACTED_SECRET_DATA]';
            }
            return match;
        });

        return scrubbed;
    }
}
