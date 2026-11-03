// sniffDelimiter picks the separator of a spreadsheet export from its first
// non-blank line: tab (a copy-paste or .tsv), semicolon (a comma-decimal
// locale) or comma, whichever appears most; comma when none does.
export function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find(line => line.trim() !== '') ?? ''
  const counts = [',', '\t', ';'].map(delimiter => ({ delimiter, count: firstLine.split(delimiter).length - 1 }))
  const best = counts.reduce((top, candidate) => (candidate.count > top.count ? candidate : top))
  return best.count > 0 ? best.delimiter : ','
}

// parseCsv tokenises RFC-4180 CSV: quoted fields, "" escapes, embedded
// delimiters/newlines, CRLF or LF, a leading BOM. Blank lines are kept as
// [''] so file line numbers stay true. The delimiter defaults to the
// sniffed one, so a tab-separated file reads the same as a comma one.
export function parseCsv(text: string, delimiter = sniffDelimiter(text)): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows
}
