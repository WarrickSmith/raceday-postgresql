export function sanitizeString(value) {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (typeof value === 'object') {
    if ('$id' in value && typeof value.$id === 'string') {
      return sanitizeString(value.$id)
    }
    if ('id' in value && typeof value.id === 'string') {
      return sanitizeString(value.id)
    }
    if ('raceId' in value && typeof value.raceId === 'string') {
      return sanitizeString(value.raceId)
    }
    if ('entrantId' in value && typeof value.entrantId === 'string') {
      return sanitizeString(value.entrantId)
    }
  }

  return null
}

export function isMissingScalar(value) {
  return sanitizeString(value) === null
}

export function deriveEntrantIdFromEntrantDocument(doc) {
  return (
    sanitizeString(doc.entrantId) ||
    sanitizeString(doc.entrant_id) ||
    sanitizeString(doc.$id)
  )
}

export function deriveRaceIdFromEntrantDocument(doc) {
  return (
    sanitizeString(doc.raceId) ||
    sanitizeString(doc.race) ||
    sanitizeString(doc.race_id) ||
    sanitizeString(doc.raceDocument)
  )
}

export function deriveEntrantIdFromMoneyFlowDocument(doc) {
  return (
    sanitizeString(doc.entrantId) ||
    sanitizeString(doc.entrant) ||
    sanitizeString(doc.entrantDocument)
  )
}

export function deriveRaceIdFromMoneyFlowDocument(doc) {
  return (
    sanitizeString(doc.raceId) ||
    sanitizeString(doc.race) ||
    sanitizeString(doc.raceDocument)
  )
}

export function computeEntrantScalarUpdate(doc) {
  const update = {}
  if (isMissingScalar(doc.entrantId)) {
    const derivedEntrantId = deriveEntrantIdFromEntrantDocument(doc)
    if (derivedEntrantId) {
      update.entrantId = derivedEntrantId
    }
  }
  if (isMissingScalar(doc.raceId)) {
    const derivedRaceId = deriveRaceIdFromEntrantDocument(doc)
    if (derivedRaceId) {
      update.raceId = derivedRaceId
    }
  }
  return update
}

export function computeMoneyFlowScalarUpdate(doc, entrantInfo = null) {
  const update = {}

  if (isMissingScalar(doc.entrantId)) {
    const derivedEntrantId = deriveEntrantIdFromMoneyFlowDocument(doc) || sanitizeString(entrantInfo?.entrantId)
    if (derivedEntrantId) {
      update.entrantId = derivedEntrantId
    }
  }

  if (isMissingScalar(doc.raceId)) {
    const derivedRaceId =
      deriveRaceIdFromMoneyFlowDocument(doc) ||
      sanitizeString(entrantInfo?.raceId)
    if (derivedRaceId) {
      update.raceId = derivedRaceId
    }
  }

  return update
}

export function shouldSkipUpdate(update) {
  return !update || Object.keys(update).length === 0
}
