// Individual actions act on exactly one transaction (e.g. renaming two transactions to the same name makes no sense),
// Group actions act on two or more (e.g. a transaction cannot be merged with itself), and
// "Both" actions act on any number of them.
export type ActionScope = "individual" | "group" | "both"

export type Action = {
  id: string
  label: string
  scope: ActionScope
  shortcut?: string
}

export const ACTIONS: Action[] = [
  { id: "rename", label: "Rename", scope: "individual", shortcut: "R" },
  // Placeholders: no group actions are implemented yet
  { id: "merge", label: "Merge", scope: "group", shortcut: "M" },
  { id: "delete", label: "Delete", scope: "both", shortcut: "D" }
]

export function actionsForCount(count: number): Action[] {
  return ACTIONS.filter((action) =>
    count === 1 ? action.scope !== "group" : action.scope !== "individual"
  )
}

export function isActionAvailable(id: string, count: number): boolean {
  return actionsForCount(count).some((action) => action.id === id)
}
