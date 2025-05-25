# Reverse Proxy Configuration

This document describes how the application handles client IPs when deployed behind a reverse proxy.

## Problem

When an application runs behind a reverse proxy (like Nginx), all requests appear to come from the proxy's IP address rather than the original client IP. This can be problematic for features that rely on client IP addresses such as:

- Rate limiting
- Security audit logging
- Blocking abusive users

## Solution

We've implemented a secure solution using a shared secret between Nginx and the backend:

1. **Shared Secret**: Both Nginx and the backend application share a secret key configured in environment variables.
2. **Authentication Header**: Nginx sends this secret with each request via the `X-Reverse-Proxy-Secret` header.
3. **Verification**: The backend verifies this secret before trusting any `X-Forwarded-For` headers.

## Configuration

### Setting Up the Secret

The easiest way to set up the reverse proxy secret is to use the provided script:

```bash
./scripts/generate-proxy-secret.sh
```

This script will generate a secure random string and add it to your `.env` file.

### Backend Configuration

Ensure the `REVERSE_PROXY_SECRET` environment variable is set in your `.env` file:

```
REVERSE_PROXY_SECRET=your-secure-random-string
```

The backend will automatically detect this setting at startup and enable secure handling of proxy headers.

### Nginx Configuration

After setting up the secret in your .env file, update your Nginx configuration:

```bash
./scripts/generate_nginx_config.sh -d yourdomain.com
```

The Nginx configuration uses Docker environment variables:

```nginx
proxy_set_header X-Reverse-Proxy-Secret '${REVERSE_PROXY_SECRET}';
```

This environment variable is passed from the .env file through Docker Compose to the Nginx container, so you don't need to rebuild the Nginx configuration when the secret changes.

## How It Works

1. The client sends a request to Nginx
2. Nginx adds headers including:
   - `X-Real-IP`: The direct client IP
   - `X-Forwarded-For`: Chain of client and proxy IPs
   - `X-Reverse-Proxy-Secret`: The shared secret
3. The backend:
   - Verifies the secret header matches the configured value
   - If valid, extracts the client IP from X-Forwarded-For
   - Otherwise, uses the direct connection IP

## Validation

You can validate the setup by accessing the `/ip` endpoint, which will show:

- The detected client IP
- Whether the request came from a trusted proxy
- Whether the proxy is properly configured
- Request headers

## Troubleshooting

If you see incorrect client IPs in logs or rate limiting, check:

1. That `REVERSE_PROXY_SECRET` is set in your `.env` file
2. That the same secret is used in your Nginx configuration
3. That Nginx is correctly sending the `X-Reverse-Proxy-Secret` header
4. Check the `/ip` endpoint to verify the configuration

## IP Detection Details

The detected proxy IP appears to be `::ffff:172.18.0.3`, which is the IPv6-mapped IPv4 address format. This is normal when services are running in Docker with an internal network. The Docker network uses its own private IP range (in this case 172.18.x.x), which is why you don't see 127.0.0.1.

## Security Considerations

- Keep the reverse proxy secret secure and random
- Rotate the secret periodically using the provided script
- Monitor for unauthorized attempts to set proxy headers
- This method prevents IP spoofing as only the trusted proxy can set the headers
