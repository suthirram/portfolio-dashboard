package migration

import (
	"context"
	"errors"
	"slices"
	"strconv"
	"sync"
	"testing"
	"time"

	"go.uber.org/zap"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

// memoryStore applies the same claim and lease rules as
// persistence.MigrationStore, in memory.
type memoryStore struct {
	mu        sync.Mutex
	records   map[string]domain.MigrationRecord
	renewals  int
	renewErr  error
	cursorLog []string
}

func newMemoryStore() *memoryStore {
	return &memoryStore{records: map[string]domain.MigrationRecord{}}
}

func (m *memoryStore) Claim(_ context.Context, version, owner string, now, leaseUntil time.Time) (domain.MigrationRecord, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, exists := m.records[version]
	claimable := !exists || record.Status == domain.MigrationFailed ||
		(record.Status == domain.MigrationInProgress && !record.LeaseExpiresAt.After(now))
	if !claimable {
		return record, false, nil
	}
	record.Version = version
	record.Status = domain.MigrationInProgress
	record.LeaseOwner = owner
	record.LeaseExpiresAt = leaseUntil
	record.StartedAt = now
	record.Attempts++
	record.FinishedAt = nil
	record.LastError = ""
	m.records[version] = record
	return record, true, nil
}

func (m *memoryStore) held(version, owner string) (domain.MigrationRecord, error) {
	record, exists := m.records[version]
	if !exists || record.LeaseOwner != owner || record.Status != domain.MigrationInProgress {
		return domain.MigrationRecord{}, persistence.ErrNotFound
	}
	return record, nil
}

func (m *memoryStore) SaveCursor(_ context.Context, version, owner string, cursor string, _, leaseUntil time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, err := m.held(version, owner)
	if err != nil {
		return err
	}
	record.Cursor = &cursor
	record.LeaseExpiresAt = leaseUntil
	m.records[version] = record
	m.cursorLog = append(m.cursorLog, cursor)
	return nil
}

func (m *memoryStore) Renew(_ context.Context, version, owner string, _, leaseUntil time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.renewals++
	if m.renewErr != nil {
		return m.renewErr
	}
	record, err := m.held(version, owner)
	if err != nil {
		return err
	}
	record.LeaseExpiresAt = leaseUntil
	m.records[version] = record
	return nil
}

func (m *memoryStore) Finish(_ context.Context, version, owner string, runErr error, now time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, err := m.held(version, owner)
	if err != nil {
		return err
	}
	record.LeaseExpiresAt = now
	if runErr == nil {
		record.Status = domain.MigrationDone
		record.FinishedAt = &now
		record.Cursor = nil
	} else {
		record.Status = domain.MigrationFailed
		record.LastError = runErr.Error()
	}
	m.records[version] = record
	return nil
}

func (m *memoryStore) record(version string) domain.MigrationRecord {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.records[version]
}

// batchStep counts down batches: each Run advances the cursor by one until
// it reaches batches. failAt makes the batch starting at that cursor fail.
type batchStep struct {
	version string
	batches int
	failAt  int
	runs    []string // cursors Run was called with ("" for nil)
	run     func(ctx context.Context) error
}

func (s *batchStep) Version() string { return s.version }

func (s *batchStep) Run(ctx context.Context, cursor *string) (*string, error) {
	position := 0
	if cursor != nil {
		position, _ = strconv.Atoi(*cursor)
		s.runs = append(s.runs, *cursor)
	} else {
		s.runs = append(s.runs, "")
	}
	if s.run != nil {
		if err := s.run(ctx); err != nil {
			return nil, err
		}
	}
	if s.failAt > 0 && position == s.failAt {
		return nil, errors.New("batch failed")
	}
	if position+1 >= s.batches {
		return nil, nil
	}
	return new(strconv.Itoa(position + 1)), nil
}

func testRunner(store Store) *Runner {
	return &Runner{store: store, logger: zap.NewNop(), owner: "test-runner", lease: time.Minute, now: time.Now}
}

func TestRunPending_RunsNewStepsInOrderAndMarksThemDone(t *testing.T) {
	store := newMemoryStore()
	first := &batchStep{version: "20261116_01", batches: 1}
	second := &batchStep{version: "20261116_02", batches: 1}

	report, err := testRunner(store).RunPending(context.Background(), []Step{first, second})
	if err != nil {
		t.Fatalf("RunPending: %v", err)
	}
	if !slices.Equal(report.Ran, []string{"20261116_01", "20261116_02"}) {
		t.Errorf("Ran = %v; want both steps in order", report.Ran)
	}
	for _, version := range report.Ran {
		record := store.record(version)
		if record.Status != domain.MigrationDone || record.FinishedAt == nil || record.Attempts != 1 {
			t.Errorf("%s = %+v; want done after one attempt", version, record)
		}
	}
}

func TestRunPending_DoneStepNeverRunsAgain(t *testing.T) {
	store := newMemoryStore()
	step := &batchStep{version: "20261116_01", batches: 1}
	runner := testRunner(store)
	if _, err := runner.RunPending(context.Background(), []Step{step}); err != nil {
		t.Fatalf("first RunPending: %v", err)
	}

	report, err := runner.RunPending(context.Background(), []Step{step})
	if err != nil {
		t.Fatalf("second RunPending: %v", err)
	}
	if len(step.runs) != 1 {
		t.Errorf("step ran %d times; want once", len(step.runs))
	}
	if !slices.Equal(report.Skipped, []string{"20261116_01"}) || len(report.Ran) != 0 {
		t.Errorf("report = %+v; want the step skipped", report)
	}
}

func TestRunPending_NewStepRunsWhenOlderStepsAreDone(t *testing.T) {
	store := newMemoryStore()
	first := &batchStep{version: "20261116_01", batches: 1}
	runner := testRunner(store)
	if _, err := runner.RunPending(context.Background(), []Step{first}); err != nil {
		t.Fatalf("first RunPending: %v", err)
	}

	added := &batchStep{version: "20261120_01", batches: 1}
	report, err := runner.RunPending(context.Background(), []Step{first, added})
	if err != nil {
		t.Fatalf("second RunPending: %v", err)
	}
	if !slices.Equal(report.Ran, []string{"20261120_01"}) || len(added.runs) != 1 {
		t.Errorf("report = %+v, added ran %d times; want only the new step run", report, len(added.runs))
	}
}

func TestRunPending_SavesEachCursorAndPassesItToTheNextBatch(t *testing.T) {
	store := newMemoryStore()
	step := &batchStep{version: "20261116_01", batches: 3}

	if _, err := testRunner(store).RunPending(context.Background(), []Step{step}); err != nil {
		t.Fatalf("RunPending: %v", err)
	}
	if !slices.Equal(step.runs, []string{"", "1", "2"}) {
		t.Errorf("Run cursors = %v; want nil, 1, 2", step.runs)
	}
	if !slices.Equal(store.cursorLog, []string{"1", "2"}) {
		t.Errorf("saved cursors = %v; want 1, 2", store.cursorLog)
	}
	if record := store.record("20261116_01"); record.Cursor != nil {
		t.Errorf("done record cursor = %q; want cleared", *record.Cursor)
	}
}

func TestRunPending_FailureIsRecordedAndStopsLaterSteps(t *testing.T) {
	store := newMemoryStore()
	failing := &batchStep{version: "20261116_01", batches: 3, failAt: 1}
	later := &batchStep{version: "20261116_02", batches: 1}

	report, err := testRunner(store).RunPending(context.Background(), []Step{failing, later})
	if err == nil {
		t.Fatal("RunPending = nil error; want the step's failure")
	}
	if report.Failed != "20261116_01" || len(later.runs) != 0 {
		t.Errorf("report = %+v, later ran %d times; want failure to stop the run", report, len(later.runs))
	}
	record := store.record("20261116_01")
	if record.Status != domain.MigrationFailed || record.LastError != "batch failed" {
		t.Errorf("record = %+v; want failed with the error", record)
	}
	if record.Cursor == nil || *record.Cursor != "1" {
		t.Errorf("record cursor = %v; want the last saved cursor 1 kept", record.Cursor)
	}
}

func TestRunPending_RetryResumesFailedStepFromItsSavedCursor(t *testing.T) {
	store := newMemoryStore()
	step := &batchStep{version: "20261116_01", batches: 3, failAt: 2}
	runner := testRunner(store)
	if _, err := runner.RunPending(context.Background(), []Step{step}); err == nil {
		t.Fatal("first RunPending = nil error; want failure")
	}

	step.failAt = 0
	step.runs = nil
	report, err := runner.RunPending(context.Background(), []Step{step})
	if err != nil {
		t.Fatalf("retry RunPending: %v", err)
	}
	if !slices.Equal(step.runs, []string{"2"}) {
		t.Errorf("retry Run cursors = %v; want to resume at 2", step.runs)
	}
	record := store.record("20261116_01")
	if !slices.Equal(report.Ran, []string{"20261116_01"}) || record.Status != domain.MigrationDone || record.Attempts != 2 {
		t.Errorf("report = %+v, record = %+v; want done on the second attempt", report, record)
	}
}

func TestRunPending_ExpiredLeaseIsClaimedAndResumed(t *testing.T) {
	store := newMemoryStore()
	cursor := "1"
	store.records["20261116_01"] = domain.MigrationRecord{
		Version: "20261116_01", Status: domain.MigrationInProgress, Cursor: &cursor, Attempts: 1,
		LeaseOwner: "killed-run", LeaseExpiresAt: time.Now().Add(-time.Second),
	}
	step := &batchStep{version: "20261116_01", batches: 2}

	report, err := testRunner(store).RunPending(context.Background(), []Step{step})
	if err != nil {
		t.Fatalf("RunPending: %v", err)
	}
	if !slices.Equal(step.runs, []string{"1"}) || !slices.Equal(report.Ran, []string{"20261116_01"}) {
		t.Errorf("runs = %v, report = %+v; want the dead run resumed from its cursor", step.runs, report)
	}
}

func TestRunPending_LiveLeaseStopsTheRunWithoutError(t *testing.T) {
	store := newMemoryStore()
	store.records["20261116_01"] = domain.MigrationRecord{
		Version: "20261116_01", Status: domain.MigrationInProgress,
		LeaseOwner: "other-run", LeaseExpiresAt: time.Now().Add(time.Minute),
	}
	held := &batchStep{version: "20261116_01", batches: 1}
	later := &batchStep{version: "20261116_02", batches: 1}

	report, err := testRunner(store).RunPending(context.Background(), []Step{held, later})
	if err != nil {
		t.Fatalf("RunPending: %v", err)
	}
	if report.Held != "20261116_01" || len(held.runs) != 0 || len(later.runs) != 0 {
		t.Errorf("report = %+v; want the held step and every later one left alone", report)
	}
}

func TestRunPending_CancelledRunIsRecordedFailed(t *testing.T) {
	store := newMemoryStore()
	ctx, cancel := context.WithCancel(context.Background())
	step := &batchStep{version: "20261116_01", batches: 3, run: func(ctx context.Context) error {
		cancel() // SIGTERM arrives during the first batch
		return ctx.Err()
	}}

	report, err := testRunner(store).RunPending(ctx, []Step{step})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("RunPending error = %v; want context.Canceled", err)
	}
	if record := store.record("20261116_01"); report.Failed != "20261116_01" || record.Status != domain.MigrationFailed {
		t.Errorf("record = %+v; want failed so the next run resumes at once", record)
	}
}

func TestRunPending_LostLeaseCancelsTheStep(t *testing.T) {
	store := newMemoryStore()
	store.renewErr = persistence.ErrNotFound
	runner := testRunner(store)
	runner.lease = 30 * time.Millisecond
	step := &batchStep{version: "20261116_01", batches: 1, run: func(ctx context.Context) error {
		<-ctx.Done() // a slow batch outlives the lease
		return ctx.Err()
	}}

	_, err := runner.RunPending(context.Background(), []Step{step})
	if !errors.Is(err, persistence.ErrNotFound) {
		t.Fatalf("RunPending error = %v; want the lost-lease cause", err)
	}
}

func TestRunPending_SlowBatchRenewsItsLease(t *testing.T) {
	store := newMemoryStore()
	runner := testRunner(store)
	runner.lease = 30 * time.Millisecond
	step := &batchStep{version: "20261116_01", batches: 1, run: func(context.Context) error {
		time.Sleep(100 * time.Millisecond)
		return nil
	}}

	if _, err := runner.RunPending(context.Background(), []Step{step}); err != nil {
		t.Fatalf("RunPending: %v", err)
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.renewals == 0 {
		t.Error("lease never renewed during a batch longer than the lease")
	}
}

func TestRunPending_StepRepeatingItsCursorFails(t *testing.T) {
	store := newMemoryStore()
	step := stuckStep{}

	_, err := testRunner(store).RunPending(context.Background(), []Step{step})
	if err == nil {
		t.Fatal("RunPending = nil error; want the repeated cursor rejected")
	}
	if record := store.record("20261116_01"); record.Status != domain.MigrationFailed {
		t.Errorf("record = %+v; want failed", record)
	}
}

type stuckStep struct{}

func (stuckStep) Version() string { return "20261116_01" }

func (stuckStep) Run(context.Context, *string) (*string, error) { return new("same"), nil }

func TestRunPending_InvalidRegistryRunsNothing(t *testing.T) {
	store := newMemoryStore()
	valid := &batchStep{version: "20261116_01", batches: 1}
	invalid := &batchStep{version: "2026-11-16", batches: 1}

	if _, err := testRunner(store).RunPending(context.Background(), []Step{valid, invalid}); err == nil {
		t.Fatal("RunPending = nil error; want the registry rejected")
	}
	if len(valid.runs) != 0 {
		t.Error("a step ran although the registry was invalid")
	}
}
