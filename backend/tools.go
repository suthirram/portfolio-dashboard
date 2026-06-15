//go:build tools

package main

//go:generate go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen --config api/oapi-codegen-models.yaml api/specs/portfolio-api.yaml
//go:generate go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen --config api/oapi-codegen-server.yaml api/specs/openapi.yaml

import _ "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen"
