# Billing Service

Manages subscriptions, usage tracking, invoicing, and Stripe webhook integration for the Nimbus platform.

## Port

`BILLING_SERVICE_PORT` (default: `3014`)

## Key Endpoints

- `GET /health` -- Health check
- `GET /api/billing/status?teamId=...` -- Get billing status
- `POST /api/billing/subscribe` -- Subscribe to a plan
- `POST /api/billing/cancel` -- Cancel subscription
- `GET /api/billing/usage?teamId=...` -- Get usage metrics
- `POST /api/billing/usage` -- Record usage event
- `GET /api/billing/invoices?teamId=...` -- List invoices
- `POST /api/billing/invoices/generate` -- Generate invoice
- `POST /api/billing/webhooks/stripe` -- Stripe webhook handler

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BILLING_SERVICE_PORT` | Service port | `3014` |
| `STRIPE_SECRET_KEY` | Stripe API secret key | -- |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | -- |

## Running

```bash
cd services/billing-service
bun run dev
```

## Testing

```bash
bun test services/billing-service
```
