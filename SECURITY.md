# Secret storage and safe logging

## Store values outside Git

The application reads secrets through the validated server-only configuration in
`runtime-config.ts`. Keep `.env.example` empty of real credentials. Never print
`.env`, `process.env`, the complete configuration object, request headers/bodies,
or provider response bodies while troubleshooting. Never use `VITE_` for secrets:
those values are available to browser code.

For local setup, create `.env` only if it does not already exist:

```sh
umask 077
if [ ! -e .env ]; then
  cp .env.example .env
fi
chmod 600 .env
git check-ignore .env
```

Edit values locally rather than pasting them into chat, command arguments or shell
history. `.env` is already ignored, and its local permissions should be `600`.
Ignoring a file does not remove any copy already committed to Git.

| Value | Storage |
| --- | --- |
| `CRON_SECRET`, `RESEND_API_KEY` | Vercel project environment variables, type **Secret**; separate values for Production and other environments |
| `DATABASE_URL` / `POSTGRES_URL` | Keep the provider-managed production connection in the Production environment; use a separate test/preview database when needed |
| `DIGEST_TO`, `DIGEST_FROM` | Restricted environment configuration; treat recipient/sender addresses as private log data |
| Ports, timeouts, public site URL | Ordinary non-secret configuration |
| GitHub access token | OS credential manager or GitHub CLI credential helper; never a remote URL, source file or project log |

In Vercel's project environment settings, select **Secret** for manually managed
credentials and the intended target environment. Saved Secret values are
write-only; update them with the replacement after rotating at the issuer. Preserve integration-managed database
settings through the integration/provider's supported workflow. This project keeps
the production history database out of previews. No platform secret settings were
changed by the audit. See [Vercel's Config and Secret documentation](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

After changing runtime values, restart or redeploy. Do not rely on build-log
masking to protect application runtime logs.

## Log events through the shared logger

Server code imports `logger` from `server/logging.ts`:

```ts
import { logger } from './logging.js';

try {
  await performOperation();
} catch (error) {
  logger.error('[RegSonar] Operation failed', error);
  res.status(500).json({ success: false, error: 'Operation failed' });
}
```

The logger masks configured cron/API secrets, database URLs/passwords and private
digest addresses. Its shared sanitizer also masks sensitive object fields, URL
credentials/query values, Bearer/Basic credentials, common provider-token formats,
JWTs and private-key blocks. Error output includes sanitized name/message/code/cause,
without raw stacks, request bodies or arbitrary Error fields. Control characters
are escaped to prevent forged log lines. Inputs are not mutated.

For browser diagnostics, use `browserLogger` from `shared/logging.ts`; it has the
format-based sanitizer and receives no server secret values. Never import the
server logger or runtime configuration into `src/`.

Use structured arguments rather than pre-serializing whole request/configuration
objects. Redaction is a backup, not permission to log secret data: an unknown value
with no recognizable format or sensitive field name cannot always be detected.
Third-party/platform logs do not automatically pass through this helper, and
these changes do not retroactively scrub previously stored logs.
Unexpected API errors return fixed messages, while the internal event is sanitized.
Malformed request bodies return controlled JSON errors and are not echoed in logs.
The scheduled-check status route also sanitizes previously persisted error strings.
This follows [OWASP's logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude).

## Scan and handle historical exposure

Run a local scanner without displaying matched values. For example, with
[Gitleaks](https://github.com/gitleaks/gitleaks) installed:

```sh
umask 077
secret_audit_dir="$(mktemp -d)"
gitleaks git --log-opts="--all --reflog --full-history" --redact=100 \
  --report-format=json --report-path "$secret_audit_dir/history.json"
```

Keep reports private and outside the repository. Share only rule IDs, paths,
line numbers and commit IDs, never secret/match/source-line fields. Local scans
cover the available refs and reflogs; other clones, forks and platform caches
need separate investigation. A pattern-based scan does not prove a repository
contains no secrets. No secret-scanning CI automation was added by this task.
GitHub's secret-alert API reported scanning disabled during this audit. A repository
owner can enable [secret scanning and push protection](https://docs.github.com/en/code-security/secret-scanning/enabling-secret-scanning-features/enabling-secret-scanning-for-your-repository)
in the repository's code-security settings where available; that setting has not
been changed here.

If a real credential is exposed, revoke or rotate it with its issuer first, update
the appropriate secret store and redeploy. Check access/audit records. A new commit
that removes the value does not remove it from old commits, other clones or logs.

History rewriting is a separate coordinated operation: review affected refs, use a
private replacement file with `git-filter-repo`, coordinate collaborators and force
push only after explicit approval. Provider-side cache/PR references may also need
cleanup. A credential already revoked may not require rewriting history. See
[GitHub's sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
