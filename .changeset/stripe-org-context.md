---
"@runtypelabs/persona-proxy": patch
---

Add optional `Stripe-Context` for checkout session creation (`stripeContext` / `STRIPE_CONTEXT`) and require it when using organization secret keys (`sk_org_…`), per Stripe’s organization key rules.
