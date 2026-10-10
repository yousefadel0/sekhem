# Provider contract

Owner: AI Platform + Security · Last verified: 2026-09-02

Non-mock providers must match an exact `SEKHEM_PROVIDER_URL_ALLOWLIST` entry. HTTPS is the default policy; any internal HTTP route is an explicit exception. Redirects are rejected. Credentials stay encrypted and are attached only to the approved request.

The verified llama.cpp dialect is `LLAMACPP_JSON_SCHEMA`; R&D applies `reasoning_effort: none`, `chat_template_kwargs.enable_thinking: false`, temperature 0, configured output budget, and the existing response-format schema. Provider Test and R&D are never CI/deployment checks.
