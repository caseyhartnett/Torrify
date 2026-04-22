import { expect, test } from '@playwright/test'

const SETTINGS_STORAGE_KEY = 'torrify.web.settings.v1'
const RECENT_FILES_STORAGE_KEY = 'torrify.web.recent.v1'
const gatewayRoutePattern =
  /https:\/\/(gateway\.test|the-gateway-production\.up\.railway\.app|the-gatekeeper-production\.up\.railway\.app)\/api\/chat(?:\/free)?/
const renderRoutePattern = /.+\/api\/render$/

const asciiStl = [
  'solid smoke',
  'facet normal 0 0 1',
  'outer loop',
  'vertex 0 0 0',
  'vertex 1 0 0',
  'vertex 0 1 0',
  'endloop',
  'endfacet',
  'endsolid smoke'
].join('\n')

const gatewaySseBody = [
  'data: {"choices":[{"delta":{"content":"<assistant>Generated code for smoke test.</assistant>"}}]}',
  '',
  'data: {"choices":[{"delta":{"content":"<openscad>cube([10,10,10]);</openscad>"}}]}',
  '',
  'data: [DONE]',
  ''
].join('\n')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ settingsKey, recentFilesKey }) => {
      localStorage.setItem(
        settingsKey,
        JSON.stringify({
          cadBackend: 'openscad',
          openscadPath: '',
          build123dPythonPath: '',
          llm: {
            provider: 'gateway',
            model: 'google/gemini-3-flash-preview',
            apiKey: '',
            enabled: true,
            temperature: 0.7,
            maxTokens: 2048,
            gatewayBaseUrl: 'https://gateway.test',
            gatewayLicenseKey: ''
          },
          recentFiles: [],
          hasSeenDemo: true
        })
      )
      localStorage.setItem(recentFilesKey, JSON.stringify([]))
    },
    { settingsKey: SETTINGS_STORAGE_KEY, recentFilesKey: RECENT_FILES_STORAGE_KEY }
  )

  await page.route(
    gatewayRoutePattern,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, X-License-Key',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        }
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-License-Key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Cache-Control': 'no-cache'
      },
      body: gatewaySseBody
    })
    }
  )

  await page.route(renderRoutePattern, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        }
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        stlBase64: Buffer.from(asciiStl, 'utf8').toString('base64')
      })
    })
  })

  await page.goto('/')
  await expect(page.getByText('AI Assistant')).toBeVisible()
})

test('text input accepts user message entry', async ({ page }) => {
  const input = page.getByPlaceholder('Type a message...')
  await input.fill('Create a simple cube mount')
  await expect(input).toHaveValue('Create a simple cube mount')
})

test('managed web runtime streams chat through the gateway adapter', async ({ page }) => {
  await page.getByPlaceholder('Type a message...').fill('Generate code')
  await page.getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByText('Generated code for smoke test.')).toBeVisible()
})

test('render action uses the configured web render API path', async ({ page }) => {
  await page.getByPlaceholder('Type a message...').fill('Generate code for render')
  await page.getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByText('Generated code for smoke test.')).toBeVisible()

  const renderButton = page.locator('button', { hasText: /refresh|render/i }).first()
  await expect(renderButton).toBeEnabled()
  await renderButton.click()

  await expect(page.getByRole('button', { name: 'Send to AI' })).toBeEnabled()
})

test('render error diagnosis sends a single gateway request and stays responsive', async ({ page }) => {
  let diagnosisRequestCount = 0

  await page.getByPlaceholder('Type a message...').fill('Generate code for diagnosis')
  await page.getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByText('Generated code for smoke test.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send to AI' })).toBeEnabled()

  await page.unroute(gatewayRoutePattern)
  await page.route(gatewayRoutePattern, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, X-License-Key',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        }
      })
      return
    }

    const payload = route.request().postDataJSON() as {
      messages?: Array<{ content?: string | Array<{ type: string; text?: string }> }>
    }
    const lastMessage = payload.messages?.[payload.messages.length - 1]
    const lastContent = Array.isArray(lastMessage?.content)
      ? lastMessage.content
          .filter((part) => part.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join('\n')
      : typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : ''

    if (lastContent.includes('Please help me understand and fix the error.')) {
      diagnosisRequestCount += 1
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-License-Key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Cache-Control': 'no-cache'
      },
      body: [
        'data: {"choices":[{"delta":{"content":"<assistant>Diagnosis complete.</assistant>"}}]}',
        '',
        'data: [DONE]',
        ''
      ].join('\n')
    })
  })

  await page.unroute(renderRoutePattern)
  await page.route(renderRoutePattern, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        }
      })
      return
    }

    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Parser error near line 1'
      })
    })
  })

  const renderButton = page.locator('button', { hasText: /refresh|render/i }).first()
  await expect(renderButton).toBeEnabled()
  await renderButton.click()

  await expect(page.getByText('Render Error')).toBeVisible()
  await expect(page.getByRole('button', { name: /Ask AI to Diagnose/i })).toBeVisible()

  await page.getByRole('button', { name: /Ask AI to Diagnose/i }).click()

  await expect(page.getByText('Diagnosis complete.')).toBeVisible()
  await expect(page.getByText(/I got this error when trying to render my OpenSCAD code/i)).toHaveCount(1)

  await page.waitForTimeout(300)

  expect(diagnosisRequestCount).toBe(1)
  await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled()
})
