package db

import "testing"

// The embedded migration set must always be well-formed: this is what makes
// a bad filename fail CI instead of failing every boot in prod.
func TestMigrationFilesWellFormed(t *testing.T) {
	files, err := migrationFiles()
	if err != nil {
		t.Fatalf("migrationFiles: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("no embedded migrations found")
	}
	for i := 1; i < len(files); i++ {
		if files[i-1] >= files[i] {
			t.Fatalf("migrations out of order: %q before %q", files[i-1], files[i])
		}
	}
	for _, name := range files {
		sql, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		if len(sql) == 0 {
			t.Fatalf("migration %s is empty", name)
		}
	}
}

func TestOrderMigrations(t *testing.T) {
	tests := []struct {
		name    string
		in      []string
		want    []string
		wantErr bool
	}{
		{
			name: "sorts by numeric prefix",
			in:   []string{"0002_b.sql", "0001_a.sql"},
			want: []string{"0001_a.sql", "0002_b.sql"},
		},
		{
			name:    "duplicate version rejected",
			in:      []string{"0001_a.sql", "0001_b.sql"},
			wantErr: true,
		},
		{
			name:    "non-numeric prefix rejected",
			in:      []string{"abcd_a.sql"},
			wantErr: true,
		},
		{
			name:    "missing underscore rejected",
			in:      []string{"0001.sql"},
			wantErr: true,
		},
		{
			name:    "non-sql rejected",
			in:      []string{"0001_a.txt"},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := orderMigrations(tt.in)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("want error, got %v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("orderMigrations: %v", err)
			}
			if len(got) != len(tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("got %v, want %v", got, tt.want)
				}
			}
		})
	}
}
