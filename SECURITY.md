# Security Policy

## Supported Versions

We recommend all users and contributors run the latest version from the `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability

The Dit Shop team takes security vulnerabilities seriously.

If you discover a security issue, please **DO NOT** open a public issue on GitHub. Instead:

1. Send an email to the project maintainers or submit a private security advisory via GitHub Security Advisories.
2. Include detailed steps to reproduce the vulnerability, including proof-of-concept payloads or code if applicable.
3. Allow reasonable time for the maintainers to review and address the issue before any public disclosure.

---

## Security Best Practices for Deployments

- **Change Default Admin Credentials:** Always update the default admin password (`khamphet`) upon first setup.
- **JWT Secret:** Generate a strong, high-entropy random string for `JWT_SECRET` in `backend/.env`.
- **HTTPS:** Ensure production deployments use TLS/HTTPS to protect passwords and auth tokens in transit.
- **Database Permissions:** Grant the database user only the required privileges on the `ditshop` database.
