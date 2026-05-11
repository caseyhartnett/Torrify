import { useState, useCallback } from 'react'
import { logger } from '../../../utils/logger'

export interface CustomModel {
  id: string
  name: string
}

export interface CustomConnectionStatus {
  success: boolean
  message?: string
  error?: string
  endpoint?: string
  supportsResponses?: boolean
}

export function useCustomModels() {
  const [customModels, setCustomModels] = useState<CustomModel[]>([])
  const [isLoadingCustomModels, setIsLoadingCustomModels] = useState(false)
  const [customModelsError, setCustomModelsError] = useState<string | null>(null)
  const [customConnectionStatus, setCustomConnectionStatus] = useState<CustomConnectionStatus | null>(null)
  const [isCheckingCustomConnection, setIsCheckingCustomConnection] = useState(false)

  const loadCustomModels = useCallback(async (endpoint?: string) => {
    setIsLoadingCustomModels(true)
    setCustomModelsError(null)
    try {
      const result = await window.electronAPI.getCustomModels(endpoint)
      const models = result.models ?? []
      if (result.success && models.length > 0) {
        setCustomModels(models)
        return models
      }
      setCustomModels([])
      setCustomModelsError(result.error || 'No models found for this endpoint.')
      return []
    } catch (error) {
      logger.error('Failed to load custom models', error)
      setCustomModels([])
      setCustomModelsError('Failed to load models from custom endpoint.')
      return []
    } finally {
      setIsLoadingCustomModels(false)
    }
  }, [])

  const checkCustomConnection = useCallback(async (endpoint?: string) => {
    setIsCheckingCustomConnection(true)
    setCustomConnectionStatus(null)
    try {
      const result = await window.electronAPI.checkCustomConnection(endpoint)
      setCustomConnectionStatus(result)
      return result
    } catch (error) {
      logger.error('Failed to check custom endpoint connection', error)
      const status: CustomConnectionStatus = {
        success: false,
        error: 'Failed to check custom endpoint connection.'
      }
      setCustomConnectionStatus(status)
      return status
    } finally {
      setIsCheckingCustomConnection(false)
    }
  }, [])

  return {
    customModels,
    isLoadingCustomModels,
    customModelsError,
    customConnectionStatus,
    isCheckingCustomConnection,
    loadCustomModels,
    checkCustomConnection
  }
}
