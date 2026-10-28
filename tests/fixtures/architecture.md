# Architecture

This document describes how the platform is built and how its parts talk to each other.

## Overview

The platform is split into a small number of services behind a single gateway.

| Feature        | Status      | Priority |
|----------------|-------------|----------|
| Authentication | Done        | High     |
| Notifications  | In progress | Medium   |

## System Components

### API Gateway

Routes every request, terminates TLS and applies rate limits.

### Authentication

Issues short-lived tokens. Refresh tokens are rotated on every use.

### Database

| Table    | Rows  | Owner   |
|:---------|------:|:-------:|
| users    | 1200  | auth    |
| sessions | 98000 | auth    |
| events   | 4.2M  | billing |

## Security

- All traffic is encrypted in transit.
- Secrets live in the vault, never in the repository.

## Deployment

Deploys run from `main` after the checks pass.

#### Rollback

Re-run the previous release.

## Open Questions

- Do we need a second region?
- Who owns the event store?

## Overview

A second section with the same title, on purpose.
