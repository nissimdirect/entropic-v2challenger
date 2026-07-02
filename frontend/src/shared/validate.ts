/**
 * Entropic v2 — IPC schema validation using ajv.
 * Validates commands, responses, and project files against JSON schemas.
 */
import Ajv from 'ajv'
import commandSchema from './schemas/ipc-command.schema.json'
import responseSchema from './schemas/ipc-response.schema.json'
import projectSchema from './schemas/project.schema.json'

export interface ValidationResult {
  valid: boolean
  errors?: string[]
}

const ajv = new Ajv({ allErrors: true })

const validateCommandSchema = ajv.compile(commandSchema)
const validateResponseSchema = ajv.compile(responseSchema)
const validateProjectSchema = ajv.compile(projectSchema)

function formatErrors(errors: typeof validateCommandSchema.errors): string[] {
  if (!errors) return []
  return errors.map((e) => {
    const path = e.instancePath || '/'
    return `${path}: ${e.message ?? 'unknown error'}`
  })
}

export function validateCommand(cmd: unknown): ValidationResult {
  const valid = validateCommandSchema(cmd)
  if (valid) return { valid: true }
  return { valid: false, errors: formatErrors(validateCommandSchema.errors) }
}

export function validateResponse(resp: unknown): ValidationResult {
  const valid = validateResponseSchema(resp)
  if (valid) return { valid: true }
  return { valid: false, errors: formatErrors(validateResponseSchema.errors) }
}

export function validateProject(project: unknown): ValidationResult {
  const valid = validateProjectSchema(project)
  if (valid) return { valid: true }
  return { valid: false, errors: formatErrors(validateProjectSchema.errors) }
}
