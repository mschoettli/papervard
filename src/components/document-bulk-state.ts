export type BulkSelectionState = {
  allResults: boolean;
  selectedIds: string[];
  excludedIds: string[];
};

export type BulkSelectionAction =
  | { type: "select-visible"; ids: string[] }
  | { type: "select-all-results" }
  | { type: "toggle"; id: string }
  | { type: "clear" };

export const initialBulkSelection: BulkSelectionState = {
  allResults: false,
  selectedIds: [],
  excludedIds: []
};

export function reduceBulkSelection(state: BulkSelectionState, action: BulkSelectionAction): BulkSelectionState {
  if (action.type === "clear") return initialBulkSelection;
  if (action.type === "select-all-results") return { allResults: true, selectedIds: [], excludedIds: [] };
  if (action.type === "select-visible") {
    return { allResults: false, selectedIds: [...new Set(action.ids)], excludedIds: [] };
  }
  if (state.allResults) {
    const excluded = new Set(state.excludedIds);
    if (excluded.has(action.id)) excluded.delete(action.id);
    else excluded.add(action.id);
    return { ...state, excludedIds: [...excluded] };
  }
  const selected = new Set(state.selectedIds);
  if (selected.has(action.id)) selected.delete(action.id);
  else selected.add(action.id);
  return { ...state, selectedIds: [...selected] };
}

export function selectedDocumentCount(state: BulkSelectionState, total: number) {
  return state.allResults ? Math.max(0, total - state.excludedIds.length) : state.selectedIds.length;
}

export function isDocumentSelected(state: BulkSelectionState, documentId: string) {
  return state.allResults ? !state.excludedIds.includes(documentId) : state.selectedIds.includes(documentId);
}
