# Changelog

## 1.0.0 - 2026-07-11

- Closed adversarial audit findings for IPv4-mapped IPv6 SSRF bypasses and fake WeChat image hostnames.
- Made the final image plan mandatory at the draft publishing entry point and strengthened two-signal news classification.
- Added real PNG/JPEG asset checks, local asset-directory boundaries, and complete body-image/cover preflight before WeChat requests.
- Allowed safety-checked coded SVG/HTML assets while rejecting every external resource scheme, including protocol-relative, FTP, and file references.
- Updated the optional OpenAI API fallback to GPT Image 2 with supported landscape dimensions.
- Split local-only and verified copy-ready preview controls, with strict remote/data-URI overrides.
- Removed macOS Keychain secret values from child-process arguments.
- Made generated-image routing Agent-agnostic: use any available native image tool, with Codex Image Gen as one implementation.
- Added a disclosed coded fallback, reusable external prompt, and required user accept/replace decision when the current Agent cannot generate images.
- Replaced loose image suggestions with a validated four-route semantic plan: user assets, evidence screenshots, generated images, and coded structural visuals.
- Added conservative news/mixed-news detection and a final captured-evidence gate.
- Required Codex Image Gen for every generated-image route, not only the hero.
- Added supplied-video frame timestamps, source authority tiers, route placement, and provenance checks.
- Added guarded remote-image downloads and real image-format validation.
- Added mandatory publish preflight before credentials or WeChat API calls.
- Added exact `900 x 383` generated-cover cropping.
- Added deterministic dependency versions, tests, and cross-platform CI preparation.
- Clarified source-package, installed-runtime, credential, and release boundaries.
