//go:build tools

package api

//go:generate go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen --config oapi-codegen-models.yaml specs/portfolio-api.yaml
//go:generate go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen --config oapi-codegen-server.yaml specs/openapi.yaml

import _ "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen"
