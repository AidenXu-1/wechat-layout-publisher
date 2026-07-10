# Security

Do not commit AppID, AppSecret, OpenAI API keys, `.env`, generated article outputs, or uploaded-image URLs that are not intended to be public.

The Skill reads publishing credentials only from the current environment, a local ignored `.env`, or the standard `wechat-layout-publisher` entry in macOS Keychain or Windows Credential Manager. Diagnostic commands report presence only and must never print secret values.

Remote image fetching blocks local and private network targets, limits redirects, time, and bytes, and validates image bytes before upload. Treat any bypass of those checks or any secret disclosure as a security issue and stop release or publishing work until it is resolved.

The `198.18.0.0/15` benchmarking range is blocked together with private, loopback, link-local, documentation, translated-private, and other reserved targets. Requests are pinned to the validated DNS result and remain subject to protocol, redirect, timeout, byte, MIME, and image-signature checks.
