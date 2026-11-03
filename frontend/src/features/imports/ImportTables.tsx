// The preview tables shared by the CSV imports: the status counts and the
// lines that need fixing before anything can be imported.
import { td, th } from '../history/historyShared'

export interface InvalidLine { line: number; reason: string }

// ImportCounts lists each status with its count, then the total in bold.
export function ImportCounts({ counts, total }: { counts: [label: string, count: number][]; total: number }) {
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 13, maxWidth: 320 }}>
      <thead><tr><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Count</th></tr></thead>
      <tbody>
        {counts.map(([label, count]) => (
          <tr key={label}><td style={td}>{label}</td><td style={{ ...td, textAlign: 'right' }}>{count}</td></tr>
        ))}
        <tr><td style={{ ...td, fontWeight: 700 }}>Total</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{total}</td></tr>
      </tbody>
    </table>
  )
}

// InvalidLines explains why the import is blocked, one row per bad line.
export function InvalidLines({ lines }: { lines: InvalidLine[] }) {
  if (lines.length === 0) return null
  return (
    <>
      <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}><strong>{lines.length} rows need fixing</strong> before you can import. Nothing has been saved.</p>
      <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr><th style={th}>Line</th><th style={th}>Problem</th></tr></thead>
        <tbody>{lines.map(invalidLine => <tr key={invalidLine.line}><td style={td}>{invalidLine.line}</td><td style={td}>{invalidLine.reason}</td></tr>)}</tbody>
      </table>
    </>
  )
}
