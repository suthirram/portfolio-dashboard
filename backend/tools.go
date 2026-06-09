//go:build tools

package main

//go:generate go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen --config api/oapi-codegen.yaml api/openapi.yaml

import _ "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen"
