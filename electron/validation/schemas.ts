import { z } from 'zod'
import { MAX_OUTPUT_FILE_SIZE } from '../constants'

// Size limits
export const MAX_CODE_SIZE = 1024 * 1024 // 1MB
export const MAX_PATH_LENGTH = 1024 // 1KB
export const MAX_SETTINGS_SIZE = 10 * 1024 // 10KB
export const MAX_IMAGE_DATA_URL_SIZE = 5 * 1024 * 1024 // 5MB

// Core schemas
export const CodeSchema = z.string().max(MAX_CODE_SIZE)

export const CADBackendSchema = z.enum(['openscad', 'build123d'])

export const LLMProviderSchema = z.enum([
  'gemini',
  'openai',
  'anthropic',
  'custom',
  'openrouter',
  'ollama',
  'gateway'
])

export const SettingsSchema = z.object({
  cadBackend: CADBackendSchema,
  openscadPath: z.string().max(512),
  build123dPythonPath: z.string().max(512),
  llm: z.object({
    provider: LLMProviderSchema,
    model: z.string().max(100),
    apiKey: z.string().max(500),
    enabled: z.boolean(),
    customEndpoint: z.string().max(512).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(1000000).optional(),
    gatewayBaseUrl: z.string().max(512).optional(),
    gatewayLicenseKey: z.string().max(500).optional()
  }),
  analytics: z
    .object({
      enabled: z.boolean()
    })
    .optional(),
  recentFiles: z
    .array(
      z.object({
        filePath: z.string().max(MAX_PATH_LENGTH),
        lastOpened: z.string()
      })
    )
    .max(10)
    .optional()
    .default([]),
  hasSeenDemo: z.boolean().optional()
})

export const FilePathSchema = z.string().max(MAX_PATH_LENGTH)

export const GatewayRequestSchema = z.object({
  licenseKey: z.string().max(500).optional(),
  body: z.unknown().optional()
})

export const WindowTitleSchema = z.string().max(256)

const ImageDataUrlSchema = z
  .string()
  .max(MAX_IMAGE_DATA_URL_SIZE)
  .refine((value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value), {
    message: 'Expected base64 image data URL'
  })

export const LLMMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(MAX_CODE_SIZE),
  imageDataUrls: z.array(ImageDataUrlSchema).max(16).optional()
})

export const LLMRequestPayloadSchema = z.object({
  messages: z.array(LLMMessageSchema).min(1).max(200),
  currentCode: CodeSchema.optional(),
  cadBackend: CADBackendSchema.optional(),
  apiContext: z.string().max(MAX_CODE_SIZE).optional()
})

export const StreamIdSchema = z.string().min(1).max(256)

const MAX_STL_BASE64_LENGTH = Math.ceil((MAX_OUTPUT_FILE_SIZE * 4) / 3) + 4
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export const StlBase64Schema = z
  .string()
  .min(1)
  .max(MAX_STL_BASE64_LENGTH)
  .regex(BASE64_PATTERN)
