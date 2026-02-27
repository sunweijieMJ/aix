/**
 * Cloudflare Worker: Sentry Webhook → GitHub repository_dispatch
 *
 * Receives Sentry webhook events, deduplicates using KV,
 * fetches resolved stacktrace, and dispatches to GitHub Actions.
 *
 * Environment Variables (Cloudflare Worker Secrets):
 * - SENTRY_CLIENT_SECRET: Sentry webhook signing secret
 * - SENTRY_AUTH_TOKEN: Sentry API auth token (for fetching stacktrace)
 * - GITHUB_PAT: GitHub Personal Access Token
 *   NOTE: Must use a PAT (not GITHUB_TOKEN) because repository_dispatch
 *   events triggered by GITHUB_TOKEN will NOT trigger workflows.
 *   See: https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow
 *
 * KV Namespace Binding:
 * - SENTRY_DEDUP: KV namespace for deduplication (24h TTL)
 *
 * Replaceable Variables:
 * - __OWNER__: GitHub repository owner
 * - __REPO__: GitHub repository name
 */

interface Env {
  SENTRY_CLIENT_SECRET: string;
  SENTRY_AUTH_TOKEN: string;
  GITHUB_PAT: string;
  SENTRY_DEDUP: KVNamespace;
}

interface SentryEvent {
  action: string;
  data: {
    event: {
      event_id: string;
      title: string;
      culprit: string;
      level: string;
      url: string;
      issue_url: string;
      project: number;
      exception?: {
        values?: Array<{
          type: string;
          value: string;
          stacktrace?: {
            frames: Array<{
              filename: string;
              function: string;
              lineno: number;
              colno: number;
              context_line?: string;
              pre_context?: string[];
              post_context?: string[];
              in_app: boolean;
            }>;
          };
        }>;
      };
    };
    triggered_rule: string;
  };
  installation: {
    uuid: string;
  };
}

const GITHUB_OWNER = '__OWNER__';
const GITHUB_REPO = '__REPO__';
const MAX_STACKTRACE_SIZE = 8 * 1024; // 8KB limit for stacktrace
const DEDUP_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verify Sentry signature
    const body = await request.text();
    const signature = request.headers.get('sentry-hook-signature');

    if (
      !signature ||
      !(await verifySentrySignature(body, signature, env.SENTRY_CLIENT_SECRET))
    ) {
      return new Response('Invalid signature', { status: 401 });
    }

    // Check for verification request (Sentry sends this when registering webhook)
    const hookResource = request.headers.get('sentry-hook-resource');
    if (hookResource === 'installation') {
      return new Response('OK', { status: 200 });
    }

    // Only process error/issue events
    if (hookResource !== 'event_alert') {
      return new Response('Ignored: not an event alert', { status: 200 });
    }

    let sentryEvent: SentryEvent;
    try {
      sentryEvent = JSON.parse(body);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const event = sentryEvent.data.event;
    const eventId = event.event_id;

    // Generate a safe key for dedup and branch naming
    const safeKey = await generateSafeKey(event.title, event.culprit);

    // KV-based deduplication (24h TTL)
    const dedupKey = `sentry:${safeKey}`;
    const existing = await env.SENTRY_DEDUP.get(dedupKey);
    if (existing) {
      return new Response(
        `Duplicate: already processed within 24h (key: ${safeKey})`,
        {
          status: 200,
        },
      );
    }

    // Mark as processed
    await env.SENTRY_DEDUP.put(dedupKey, new Date().toISOString(), {
      expirationTtl: DEDUP_TTL_SECONDS,
    });

    // Fetch resolved stacktrace from Sentry API
    let stacktrace = extractStacktrace(event);
    if (event.issue_url && env.SENTRY_AUTH_TOKEN) {
      try {
        const resolvedStacktrace = await fetchResolvedStacktrace(
          event.issue_url,
          eventId,
          env.SENTRY_AUTH_TOKEN,
        );
        if (resolvedStacktrace) {
          stacktrace = resolvedStacktrace;
        }
      } catch (e) {
        // Fall back to embedded stacktrace
        console.error('Failed to fetch resolved stacktrace:', e);
      }
    }

    // Truncate stacktrace to 8KB
    stacktrace = truncateStacktrace(stacktrace, MAX_STACKTRACE_SIZE);

    // Dispatch to GitHub Actions
    const dispatchPayload = {
      event_type: 'sentry-issue',
      client_payload: {
        title: event.title,
        culprit: event.culprit,
        level: event.level,
        url: event.url,
        event_id: eventId,
        stacktrace,
        safe_key: safeKey,
        triggered_rule: sentryEvent.data.triggered_rule,
      },
    };

    const githubResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_PAT}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'sentry-webhook-worker',
        },
        body: JSON.stringify(dispatchPayload),
      },
    );

    if (!githubResponse.ok) {
      const errorText = await githubResponse.text();
      console.error(
        `GitHub dispatch failed: ${githubResponse.status} ${errorText}`,
      );
      return new Response(`GitHub dispatch failed: ${githubResponse.status}`, {
        status: 502,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        safe_key: safeKey,
        event_id: eventId,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  },
};

/**
 * Verify Sentry webhook signature using HMAC-SHA256
 */
async function verifySentrySignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(body),
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Use constant-time comparison to prevent timing attacks
  const a = encoder.encode(signature);
  const b = encoder.encode(expectedSignature);
  if (a.length !== b.length) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * Extract stacktrace from Sentry event payload
 */
function extractStacktrace(event: SentryEvent['data']['event']): string {
  const exception = event.exception;
  if (!exception?.values?.length) {
    return 'No stacktrace available';
  }

  const parts: string[] = [];

  for (const exc of exception.values) {
    parts.push(`${exc.type}: ${exc.value}`);

    if (exc.stacktrace?.frames) {
      // Sentry frames are in reverse order (most recent last)
      const frames = [...exc.stacktrace.frames].reverse();
      for (const frame of frames) {
        if (!frame.in_app) continue;

        let line = `  at ${frame.function || '<anonymous>'} (${frame.filename}:${frame.lineno}:${frame.colno})`;
        if (frame.context_line) {
          line += `\n    > ${frame.context_line.trim()}`;
        }
        parts.push(line);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Fetch resolved (source-mapped) stacktrace from Sentry API
 */
async function fetchResolvedStacktrace(
  issueUrl: string,
  eventId: string,
  authToken: string,
): Promise<string | null> {
  // Extract Sentry host and issue ID from issue URL
  // Supports both SaaS (sentry.io) and self-hosted instances
  // Format: https://<host>/api/0/issues/{issue_id}/
  const urlMatch = issueUrl.match(/^(https?:\/\/[^/]+)\/.*\/issues\/(\d+)\/?/);
  if (!urlMatch) return null;

  const [, sentryHost, issueId] = urlMatch;

  // Fetch the latest event with full stacktrace
  const eventUrl = `${sentryHost}/api/0/issues/${issueId}/events/${eventId}/`;
  const response = await fetch(eventUrl, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) return null;

  const eventData = (await response.json()) as SentryEvent['data']['event'];
  return extractStacktrace(eventData);
}

/**
 * Truncate stacktrace to maxSize bytes, keeping the most relevant parts
 */
function truncateStacktrace(stacktrace: string, maxSize: number): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(stacktrace);

  if (encoded.length <= maxSize) {
    return stacktrace;
  }

  // Keep the first portion (error message + top frames) and add truncation notice
  const truncationNotice = '\n\n... [stacktrace truncated to 8KB] ...';
  const availableSize = maxSize - encoder.encode(truncationNotice).length;

  // Decode back to string, handling multi-byte chars safely
  const decoder = new TextDecoder();
  let truncated = decoder.decode(encoded.slice(0, availableSize));

  // Cut at last newline to avoid breaking a line mid-way
  const lastNewline = truncated.lastIndexOf('\n');
  if (lastNewline > 0) {
    truncated = truncated.substring(0, lastNewline);
  }

  return truncated + truncationNotice;
}

/**
 * Generate a safe key from error title and culprit for branch naming and dedup
 *
 * Always appends a hash suffix to prevent collisions when non-ASCII characters
 * (e.g., Chinese error messages) are stripped during sanitization.
 */
async function generateSafeKey(
  title: string,
  culprit: string,
): Promise<string> {
  const raw = `${title}-${culprit}`;

  // Hash for uniqueness (prevents collisions from non-ASCII stripping)
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw),
  );
  const hashHex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8);

  // Sanitize for branch naming: keep only alphanumeric, collapse hyphens
  const sanitized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);

  return sanitized ? `${sanitized}-${hashHex}` : `error-${hashHex}`;
}
