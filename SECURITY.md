# Security

This is a local desktop experiment. Keep the server bound to `127.0.0.1`; it is not designed to be exposed through a tunnel or hosted for multiple users.

- Keep keys in the ignored `.env` file or a private file selected with `JEV_API_KEY_FILE`.
- Credentials are read only by the server and used only with the fixed TypeSafe API endpoint.
- The browser sends allowlisted game observations. Receipts retain bounded actions, model, timing, identities, and token counts.
- Host and Origin checks reject requests from unrelated websites. Static files are constrained to explicit public directories, including symlink resolution.
- Generated recordings and evidence are ignored by Git. Review them before sharing; any new telemetry fields should receive the same scrutiny as code.
- Tests use an injected offline client. CI requires no API key.

For a suspected vulnerability, contact the maintainer through the public GitHub profile without posting credentials, exploit payloads containing private information, or real key values in an issue. Rotate any exposed key with its provider.
