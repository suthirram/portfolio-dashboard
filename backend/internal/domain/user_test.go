package domain

import "testing"

func TestEffectiveUiMode(t *testing.T) {
	t.Parallel()
	testCases := []struct {
		name string
		user User
		want string
	}{
		{name: "stored mode wins", user: User{UiMode: UiModeUi2, UiRevamp: true}, want: UiModeUi2},
		{name: "unstamped glass account", user: User{UiRevamp: true}, want: UiModeGlass},
		{name: "unstamped plain account", user: User{}, want: UiModeClassic},
		{name: "unknown stored value falls back", user: User{UiMode: "neon"}, want: UiModeClassic},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if got := testCase.user.EffectiveUiMode(); got != testCase.want {
				t.Errorf("EffectiveUiMode() = %q; want %q", got, testCase.want)
			}
		})
	}
}
