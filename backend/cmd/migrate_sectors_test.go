package cmd

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestSectorBackfillScope(t *testing.T) {
	t.Parallel()
	userId := primitive.NewObjectID()
	testCases := []struct {
		name     string
		user     string
		allUsers bool
		want     primitive.ObjectID
		wantErr  bool
	}{
		{name: "one user", user: userId.Hex(), want: userId},
		{name: "all users", allUsers: true},
		{name: "scope is required", wantErr: true},
		{name: "both scopes are rejected", user: userId.Hex(), allUsers: true, wantErr: true},
		{name: "user must be an id", user: "alice", wantErr: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := sectorBackfillScope(testCase.user, testCase.allUsers)
			if (err != nil) != testCase.wantErr || got != testCase.want {
				t.Errorf("sectorBackfillScope = %s, %v; want %s, error %v", got.Hex(), err, testCase.want.Hex(), testCase.wantErr)
			}
		})
	}
}
