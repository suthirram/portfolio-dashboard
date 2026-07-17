---
applyTo: 'backend/api/specs/**.yaml'
---

## OpenAPI Specs

### Structure

* `specs/openapi.yaml` — root spec (served live at `/api/specs/openapi.yaml`)
* `specs/portfolio-api.yaml` — all components (schemas, responses, params)
* `specs/{domain}/*.yaml` — per-domain path files; reference `../portfolio-api.yaml#/components/...`

### After any spec change — run both

```sh
# backend types
cd backend && go generate -tags tools ./...

# frontend types
cd frontend && npm run gen:api
```

### Post-generation checklist

* `go build ./...` passes.
* If server interface changed (new/modified endpoints), update controller implementations.
* If new model types generated, use them — don't hand-roll equivalent structs.

### Deprecation

`deprecated: true` must include `x-deprecated-reason` with migration path:

```yaml
fieldName:
  type: string
  deprecated: true
  x-deprecated-reason: Use newFieldName instead
```
