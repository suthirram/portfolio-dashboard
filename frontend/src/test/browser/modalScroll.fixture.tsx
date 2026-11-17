// Browser fixture for modalScroll.browser.test.ts: a page tall enough to
// scroll, with one real app modal open on top. ?modal= picks the modal, so
// both styling paths are covered: AddRowModal (the shared modalBackdrop /
// modalCard inline styles) and OpeningDateModal (the .modal-overlay class
// with its own inline styles). Loads the real app stylesheet.
import ReactDOM from 'react-dom/client'
import '../../index.css'
import { AddRowModal } from '../../features/history/HistoryModals'
import OpeningDateModal from '../../features/holdings/OpeningDateModal'
import type { Holding } from '../../types'

const modals = {
  'add-row': <AddRowModal onSubmit={async () => {}} onCancel={() => {}} />,
  'opening-date': <OpeningDateModal holdings={[{ id: 'holding-1', script: 'TCS' } as Holding]} onSkip={() => {}} onSaved={() => {}} />,
}
const chosen = new URLSearchParams(window.location.search).get('modal') as keyof typeof modals

ReactDOM.createRoot(document.getElementById('root')!).render(
  <>
    <div data-testid="page" style={{ height: 4000 }}>Background page</div>
    {modals[chosen]}
  </>,
)
