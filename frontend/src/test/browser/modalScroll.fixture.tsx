// Browser fixture for modalScroll.browser.test.ts: a page tall enough to
// scroll, with one real app modal open on top. ?modal= picks the modal so
// each way a modal gets its containment is covered on its own:
//   delete-all    the shared modalBackdrop / modalCard inline styles only
//   opening-date  the .modal-overlay / .modal-card classes only
//   add-row       both (the class and the inline styles)
//   palette       the .palette-overlay class (glass shell, data-ui="v2")
// Loads the real app stylesheet.
import ReactDOM from 'react-dom/client'
import '../../index.css'
import { AddRowModal } from '../../features/history/HistoryModals'
import OpeningDateModal from '../../features/holdings/OpeningDateModal'
import DeleteAllDialog from '../../features/dividends/DeleteAllDialog'
import { CommandPalette } from '../../components/shell/CommandPalette'
import type { Holding } from '../../types'

const modals = {
  'add-row': <AddRowModal onSubmit={async () => {}} onCancel={() => {}} />,
  'opening-date': <OpeningDateModal holdings={[{ id: 'holding-1', script: 'TCS' } as Holding]} onSkip={() => {}} onSaved={() => {}} />,
  'delete-all': <DeleteAllDialog currency="INR" count={3} onClose={() => {}} onDeleted={() => {}} />,
  'palette': <CommandPalette open onClose={() => {}} commands={[]} />,
}
const chosen = new URLSearchParams(window.location.search).get('modal') as keyof typeof modals
// The palette overlay is styled only inside the glass shell.
if (chosen === 'palette') document.documentElement.dataset.ui = 'v2'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <>
    <div data-testid="page" style={{ height: 4000 }}>Background page</div>
    {modals[chosen]}
  </>,
)
