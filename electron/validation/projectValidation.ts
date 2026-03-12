/**
 * Project structure validation for Torrify .torrify/.json files.
 * Used by main process before save/load operations.
 */

type ProjectRecord = Record<string, unknown>
type ProjectBackend = 'openscad' | 'build123d'

function resolveProjectBackend(record: ProjectRecord): { valid: boolean; backend?: ProjectBackend } {
  const rawBackend = record.cadBackend ?? record.backend
  if (rawBackend === undefined) {
    return { valid: true }
  }

  if (rawBackend === 'openscad' || rawBackend === 'build123d') {
    return { valid: true, backend: rawBackend }
  }

  return { valid: false }
}

/** Check that an object has the shape of a saved Torrify project (version, code, chat, etc.). */
export function validateProject(project: unknown): boolean {
  if (!project || typeof project !== 'object') {
    return false
  }

  const record = project as ProjectRecord
  // Check required fields
  if (typeof record.version !== 'number' || record.version < 1) {
    return false
  }

  if (record.savedAt !== undefined && typeof record.savedAt !== 'string') {
    return false
  }

  if (typeof record.code !== 'string') {
    return false
  }

  if (record.stlBase64 !== null && typeof record.stlBase64 !== 'string') {
    return false
  }

  if (!resolveProjectBackend(record).valid) {
    return false
  }

  if (!Array.isArray(record.chat)) {
    return false
  }

  // Validate chat messages structure
  for (const msg of record.chat) {
    if (!msg || typeof msg !== 'object') {
      return false
    }
    const messageRecord = msg as Record<string, unknown>
    if (
      typeof messageRecord.id !== 'number' ||
      typeof messageRecord.text !== 'string' ||
      !['user', 'bot'].includes(messageRecord.sender as string) ||
      typeof messageRecord.timestamp !== 'string'
    ) {
      return false
    }
  }

  return true
}
