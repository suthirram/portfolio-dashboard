// The UI_2.0 History page (PD-059 slice 13), laid out 1:1 from the handoff:
// intro, month toolbar, Month in review, Daily records and the per-asset
// charts. HistoryPage owns the data and every action (useHistoryMonth); this
// component only renders them, and reuses the classic dialogs.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIN_YEAR, isAllManual } from '../../features/history/historyShared'
import { shiftMonth } from '../../features/history/MonthNavigator'
import type { useHistoryMonth } from '../../features/history/useHistoryMonth'
import {
  AddRowModal, ConflictDialog, EditRowModal, HoldingsModal, PasteModal,
} from '../../features/history/HistoryModals'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { longMonthLabel, monthOptions, visibleAssets, type AssetFilter, type HistoryAsset } from './historyCells'
import { Ui2AssetCharts } from './Ui2AssetCharts'
import { Ui2DailyRecords } from './Ui2DailyRecords'
import { Ui2MonthReview } from './Ui2MonthReview'
import './history.css'

type HistoryMonth = ReturnType<typeof useHistoryMonth>

export function Ui2History({ history, canForceDelete }: {
  history: HistoryMonth
  canForceDelete: boolean
}) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<AssetFilter>('ALL')
  const {
    year, setYear, month, setMonth, today, selectedMonthStart,
    rowsMonthStart, displayRows, loading, error,
    chartsOnTop, toggleChartsOnTop,
    addOpen, setAddOpen, pasteOpen, setPasteOpen, editRow, setEditRow,
    holdingsView, setHoldingsView, headConflict,
    handleAddSaved, handlePasteSubmit, handleConflictResolve, handleConflictSkip,
    handleEditSaved, handleDelete,
  } = history

  const min = { year: MIN_YEAR, month0: 0 }
  const selected = { year, month0: month }
  const choose = (next: { year: number; month0: number }) => { setYear(next.year); setMonth(next.month0) }
  const atMin = year === min.year && month === min.month0
  const atMax = year === today.year && month === today.month0
  const monthLabel = longMonthLabel(year, month)
  const hasGold = displayRows.some(row => row.gold)
  // A month without gold has no Gold filter: show All assets, but keep the
  // choice so returning to a gold month restores it.
  const effectiveFilter: AssetFilter = filter === 'GOLD' && !hasGold ? 'ALL' : filter
  const assets = visibleAssets(effectiveFilter, hasGold)
  const expand = (asset: HistoryAsset) => navigate(`/history/chart/${asset === 'GOLD' ? 'gold' : asset}`)

  const table = (
    <Ui2DailyRecords rows={displayRows} filter={effectiveFilter} onFilter={setFilter}
      onEdit={row => setEditRow(row)}
      onSelectRegion={(row, prev, region) => setHoldingsView({ row, prev, region })} />
  )
  const charts = <Ui2AssetCharts rows={displayRows} assets={assets} periodLabel={monthLabel} onExpand={expand} />

  return (
    <div className="u2h-page">
      <Ui2PageIntro title="Your portfolio through time"
        subtitle="Daily snapshots, monthly perspective, and the details behind every day." />

      <div className="u2h-toolbar">
        <div className="u2h-month-nav">
          <button type="button" className="ui2-btn" aria-label="Previous month" disabled={atMin}
            onClick={() => choose(shiftMonth(selected, -1, min, today))}>‹</button>
          <select className="u2h-month-select" aria-label="Snapshot month" value={`${year}-${month}`}
            onChange={e => {
              const [nextYear, nextMonth] = e.target.value.split('-').map(Number)
              choose({ year: nextYear, month0: nextMonth })
            }}>
            {monthOptions(today).map(option => (
              <option key={`${option.year}-${option.month0}`} value={`${option.year}-${option.month0}`}>{option.label}</option>
            ))}
          </select>
          <button type="button" className="ui2-btn" aria-label="Next month" disabled={atMax}
            onClick={() => choose(shiftMonth(selected, 1, min, today))}>›</button>
        </div>
        <div className="u2h-controls">
          <label><input type="checkbox" checked={chartsOnTop} onChange={toggleChartsOnTop} /> Charts on top</label>
          <button type="button" className="ui2-btn" onClick={() => setPasteOpen(true)}>Paste month</button>
          <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => setAddOpen(true)}>＋ Add record</button>
        </div>
      </div>

      {error && <div className="u2h-alert" role="alert">Error: {error}</div>}

      {!loading && displayRows.length === 0 && (
        <div className="ui2-panel u2h-empty">
          No data for {monthLabel} yet. Your first snapshot will be taken at the next daily run, or you can add records manually.
        </div>
      )}

      {/* Only when the loaded rows are the selected month's: mid-reload, or
          after a failed one, the rows still hold the previous month. */}
      {rowsMonthStart === selectedMonthStart && (
        <Ui2MonthReview rows={displayRows} monthStart={selectedMonthStart} monthLabel={monthLabel} />
      )}

      {displayRows.length > 0 && (chartsOnTop ? <>{charts}{table}</> : <>{table}{charts}</>)}

      {addOpen && <AddRowModal onSubmit={handleAddSaved} onCancel={() => setAddOpen(false)} />}
      {editRow && <EditRowModal row={editRow} onSubmit={handleEditSaved} onCancel={() => setEditRow(null)}
        onDelete={isAllManual(editRow.regions) || canForceDelete
          ? async date => { if (await handleDelete(date)) setEditRow(null) }
          : undefined} />}
      {pasteOpen && <PasteModal monthLabel={`${year}-${String(month + 1).padStart(2, '0')}`}
        onSubmit={async input => {
          const report = await handlePasteSubmit(input)
          if (report.conflicts.length === 0 && report.rejected.length === 0) setPasteOpen(false)
          return report
        }}
        onCancel={() => setPasteOpen(false)} />}
      {headConflict && <ConflictDialog conflict={headConflict} onResolve={handleConflictResolve} onSkip={handleConflictSkip} />}
      {holdingsView && <HoldingsModal row={holdingsView.row} prev={holdingsView.prev} region={holdingsView.region}
        onClose={() => setHoldingsView(null)} />}
    </div>
  )
}
