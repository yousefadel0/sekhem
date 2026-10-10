# SEKHEM Runtime — permanent Authenticode signing

This is the product signing architecture. It does not create certificates, ship private keys, or weaken `signtool verify /pa`.

Existing release tools remain authoritative:

- `runtime-windows/build.ps1` (full release: omit `-PayloadOnly`)
- `runtime-windows/sign-file.ps1`
- `runtime-windows/installer.iss` (`SignTool=sekhem`, `SignedUninstaller=yes`)

`-PayloadOnly` is unpublished **local development** output. It is not a production release artifact and must not be published as `public/runtime`. Run it with `run-local.ps1` (vendor-signed Node worker). Production Authenticode (`sign-file.ps1`, signed Setup.exe, `release.json` `signed: true`) remains a **release** prerequisite only. Do not disable Smart App Control or Authenticode `/pa` to make a local host EXE run.

## Trust split (do not merge)

| Layer | What it proves | Where the key lives |
| --- | --- | --- |
| Authenticode | Windows publisher of Setup.exe, host, picker, uninstaller | Product code-signing private key **outside** every user PC and **outside** git |
| Runtime identity | Enrolled device to SEKHEM (`identity.json`, Ed25519) | `%LOCALAPPDATA%\SEKHEM\trusted-runtime` on that PC only |
| TLS `trusted-ca.pem` / `localhost.crt` | Worker HTTPS to a specific Runtime origin | Server TLS material; **not** Authenticode |

A new PC never receives the product signing private key. It only verifies the signed installer with Windows Authenticode policy, then enrolls its own Runtime identity.

## A. Product signing identity

One **CA-issued RSA Authenticode Code Signing** certificate for the SEKHEM publisher (organization OV or EV from a public CA Windows already trusts, e.g. DigiCert / Sectigo / GlobalSign).

`sign-file.ps1` requires:

- RSA (`1.2.840.113549.1.1.1`)
- `Subject -ne Issuer` (not self-signed)
- `HasPrivateKey` on the **signing** machine
- store `Cert:\CurrentUser\My`
- SHA256 file digest, RFC 3161 timestamp (`/tr`, `/td SHA256`)
- `signtool sign /sha1 <thumbprint> /s My /fd SHA256 /td SHA256 /tr <url>`
- `signtool verify /pa /all /tw` and `Get-AuthenticodeSignature` `Valid`

RSA key size is **not** encoded in the scripts; order a current CA Authenticode product (typically 3072/4096 RSA). EKU is not parsed by `sign-file.ps1`, but `/pa` expects Code Signing (`1.3.6.1.5.5.7.3.3`).

Record the public subject and thumbprint in `runtime-windows/signing/publisher.json` after issuance. That file must never contain a private key.

## B. Private-key storage

Keep **one** product private key:

1. **Preferred:** hardware token or HSM (YubiKey PIV, HSM, DigiCert KeyLocker, or equivalent) whose KSP registers the cert in `CurrentUser\My` so existing SignTool `/s My /sha1` works.
2. **Acceptable:** cloud signing whose certificate appears in `CurrentUser\My` on a dedicated Windows signing host (same SignTool contract).
3. **Acceptable for CI only:** PFX held in a **secret store** (GitHub Actions secret, Azure Key Vault), imported into `CurrentUser\My` for the job, never written into the repository, installer, or `public/`.

Do not copy the signing PFX onto developer laptops or customer PCs.

## C. Release signing environment

A dedicated Windows x64 **signing runner** (self-hosted label `self-hosted, windows, sekhem-signing`):

- Node **v24.21.0** with Valid vendor Authenticode
- Windows SDK `signtool.exe`
- .NET Framework `csc.exe`
- Inno Setup `ISCC.exe`
- Product cert visible in `CurrentUser\My` with private key
- Repository secrets: `SEKHEM_CODE_SIGN_THUMBPRINT`, `SEKHEM_TIMESTAMP_URL`, `SEKHEM_SIGNTOOL_PATH`, `SEKHEM_INNO_COMPILER`

GitHub-hosted `windows-latest` is not sufficient until that runner has the same tools **and** the product identity. Do not lower verification to make hosted runners “work”.

## D. Timestamping

`TimestampUrl` must match `^https?://[A-Za-z0-9./:_-]+$`. Use the CA’s RFC 3161 service (examples that match the pattern: `http://timestamp.digicert.com`). Timestamped binaries remain verifiable after the signing cert expires.

## E. CI/CD

`.github/workflows/runtime-windows-release.yml` calls the **existing** `build.ps1` (no `-PayloadOnly`), then `verify-release.ps1`. It does not generate certificates.

Application CI (`.github/workflows/backend-ci.yml`) stays unsigned Ubuntu test/lint/build. Runtime signing is a separate Windows job.

## F. Certificate rotation

1. CA issues a new Code Signing cert for the same publisher.
2. Enroll it on the signing host (`CurrentUser\My`).
3. Update `publisher.json` `expectedThumbprint` / `expectedSubject`.
4. Update secret `SEKHEM_CODE_SIGN_THUMBPRINT`.
5. Build and publish a new Setup.exe. Old timestamped installers remain Valid until revocation or distrust.

## G. Expiration

Run `signing-preflight.ps1` before each release. It fails on expired certs and warns at ≤ 30 days. Start CA renewal before expiry; do not extend validity by disabling `/pa`.

## H. Compromise / revocation

1. Revoke the cert at the CA; publish CRL/OCSP as the CA requires.
2. Stop distributing installers signed with the revoked key.
3. Issue a new product identity; update `publisher.json` and secrets.
4. Publish a new signed Setup.exe; instruct operators to uninstall the old Runtime binaries and install the new publisher’s build.
5. Do **not** rotate Runtime `identity.json` as a substitute for Authenticode revocation. Device identity revocation remains the existing server-side Runtime revoke path.

## I. New Windows PC (no signing key)

1. Download **SEKHEM Runtime Setup.exe** from SEKHEM (UI offers it only when `public/runtime/release.json` has `format: 1`, `signed: true`, and a SHA-256).
2. Windows SmartScreen / Authenticode: `signtool verify /pa /all /tw` on the Setup.exe, or the installer UI publisher details.
3. Install per-user to `%LOCALAPPDATA%\Programs\SEKHEM Runtime`.
4. Run `verify-installed.ps1` (optional operator check). Confirm host/picker `Valid`, timestamp present, `runtime-client.cjs` contains `conditionalWriteProtocol`, `build-manifest.json` has `conditionalWriteProtocol: 1`.
5. Pair and Connect. Runtime identity is created locally. Signing private key is absent.

## J. Runtime trust after install

SEKHEM still requires pairing, grants, workspace consent, approvals, and execution permits. Authenticode does not grant filesystem write. `conditionalWriteProtocol: 1` is advertised by the bundled worker on connect; older unsigned workers must not be reinstalled as a workaround.

## Local machine with no certificate

Do not invent one. Order the product Authenticode cert, enroll it on the signing host, fill `publisher.json`, then:

```powershell
.\runtime-windows\signing-preflight.ps1 -CertificateThumbprint '<40-hex>'
.\runtime-windows\build.ps1 `
  -RuntimeUrl 'https://localhost:7443' `
  -WebUrl 'http://localhost:3000' `
  -TrustedCa 'backend\.runtime-state\localhost.crt' `
  -SignToolPath 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe' `
  -CertificateThumbprint '<40-hex>' `
  -TimestampUrl '<rfc3161-url>' `
  -InnoCompiler '.\runtime-windows\out\build-tools\inno\ISCC.exe'
.\runtime-windows\verify-release.ps1 `
  -SignToolPath 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe' `
  -CertificateThumbprint '<40-hex>' `
  -PayloadDirectory '.\runtime-windows\out\build-<id>\payload'
```

Install the published `public\runtime\SEKHEM Runtime Setup.exe`, then:

```powershell
.\runtime-windows\verify-installed.ps1 `
  -SignToolPath 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe' `
  -CertificateThumbprint '<40-hex>'
```

TLS `backend\scripts\setup-runtime-tls.ps1` remains localhost HTTPS only. It is not the product Code Signing identity.
