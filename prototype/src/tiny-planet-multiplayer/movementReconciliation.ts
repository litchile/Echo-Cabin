export interface MovementReconciliationDecision {
  applySnapshot: boolean
  preserveLocalPrediction: boolean
}

export const decideMovementReconciliation = (
  snapshotSequence: number,
  latestLocalSequence: number,
  serverMoving: boolean,
): MovementReconciliationDecision => {
  if (snapshotSequence < latestLocalSequence) {
    return {
      applySnapshot: false,
      preserveLocalPrediction: true,
    }
  }
  return {
    applySnapshot: true,
    preserveLocalPrediction: serverMoving,
  }
}
