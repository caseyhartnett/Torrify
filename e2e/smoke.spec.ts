import { expect, test, type Page } from '@playwright/test'

const SETTINGS_STORAGE_KEY = 'torrify.web.settings.v1'
const RECENT_FILES_STORAGE_KEY = 'torrify.web.recent.v1'
const gatewayRoutePattern =
  /https:\/\/(gateway\.test|the-gateway-production\.up\.railway\.app|the-gatekeeper-production\.up\.railway\.app)\/api\/chat(?:\/free)?/
const renderRoutePattern = /.+\/api\/render$/

const asciiStl = [
  'solid smoke_cube',
  'facet normal 0 0 -1',
  'outer loop',
  'vertex 0 0 0',
  'vertex 20 0 0',
  'vertex 20 20 0',
  'endloop',
  'endfacet',
  'facet normal 0 0 -1',
  'outer loop',
  'vertex 0 0 0',
  'vertex 20 20 0',
  'vertex 0 20 0',
  'endloop',
  'endfacet',
  'facet normal 0 0 1',
  'outer loop',
  'vertex 0 0 30',
  'vertex 20 20 30',
  'vertex 20 0 30',
  'endloop',
  'endfacet',
  'facet normal 0 0 1',
  'outer loop',
  'vertex 0 0 30',
  'vertex 0 20 30',
  'vertex 20 20 30',
  'endloop',
  'endfacet',
  'facet normal 0 -1 0',
  'outer loop',
  'vertex 0 0 0',
  'vertex 20 0 30',
  'vertex 20 0 0',
  'endloop',
  'endfacet',
  'facet normal 0 -1 0',
  'outer loop',
  'vertex 0 0 0',
  'vertex 0 0 30',
  'vertex 20 0 30',
  'endloop',
  'endfacet',
  'facet normal 0 1 0',
  'outer loop',
  'vertex 0 20 0',
  'vertex 20 20 0',
  'vertex 20 20 30',
  'endloop',
  'endfacet',
  'facet normal 0 1 0',
  'outer loop',
  'vertex 0 20 0',
  'vertex 20 20 30',
  'vertex 0 20 30',
  'endloop',
  'endfacet',
  'facet normal -1 0 0',
  'outer loop',
  'vertex 0 0 0',
  'vertex 0 20 30',
  'vertex 0 0 30',
  'endloop',
  'endfacet',
  'facet normal -1 0 0',
  'outer loop',
  'vertex 0 0 0',
  'vertex 0 20 0',
  'vertex 0 20 30',
  'endloop',
  'endfacet',
  'facet normal 1 0 0',
  'outer loop',
  'vertex 20 0 0',
  'vertex 20 0 30',
  'vertex 20 20 30',
  'endloop',
  'endfacet',
  'facet normal 1 0 0',
  'outer loop',
  'vertex 20 0 0',
  'vertex 20 20 30',
  'vertex 20 20 0',
  'endloop',
  'endfacet',
  'endsolid smoke_cube'
].join('\n')

const gatewaySseBody = [
  'data: {"choices":[{"delta":{"content":"<assistant>Generated code for smoke test.</assistant>"}}]}',
  '',
  'data: {"choices":[{"delta":{"content":"<openscad>cube([10,10,10]);</openscad>"}}]}',
  '',
  'data: [DONE]',
  ''
].join('\n')

async function setEditorCode(page: Page, code: string): Promise<void> {
  const editorInput = page.getByRole('textbox', { name: 'Editor content' })
  await expect(editorInput).toBeVisible()
  await editorInput.click({ force: true })
  await page.keyboard.press('Control+A')
  await page.keyboard.type(code)
}

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
  await setEditorCode(page, 'cube([10, 10, 10]);')

  const renderButton = page.getByRole('button', { name: 'Refresh' })
  await expect(renderButton).toBeEnabled()
  await renderButton.click()

  await expect(page.locator('[data-testid="stl-viewer"] canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send to AI' })).toBeEnabled()
})

test('3d viewer remains operational for orbit and zoom interactions', async ({ page }) => {
  await setEditorCode(page, 'cube([10, 20, 30]);')

  const renderButton = page.getByRole('button', { name: 'Refresh' })
  await expect(renderButton).toBeEnabled()
  await renderButton.click()

  const viewerCanvas = page.locator('[data-testid="stl-viewer"] canvas')
  await expect(viewerCanvas).toBeVisible()

  const before = await viewerCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL('image/png'))
  const box = await viewerCanvas.boundingBox()
  expect(box).not.toBeNull()
  if (!box) {
    throw new Error('Expected STL viewer canvas bounds')
  }

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.38, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(150)

  const afterRotate = await viewerCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL('image/png'))
  expect(afterRotate).not.toBe(before)

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.wheel(0, 700)
  await page.waitForTimeout(150)

  const afterZoom = await viewerCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL('image/png'))
  expect(afterZoom).not.toBe(afterRotate)

  await expect(page.getByRole('button', { name: 'Send to AI' })).toBeEnabled()
})

test('render error diagnosis sends a single gateway request and stays responsive', async ({ page }) => {
  let diagnosisRequestCount = 0

  await setEditorCode(page, 'cube([12, 12, 12]);')

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

  await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      electronAPI: typeof window.electronAPI
    }
    globalWindow.electronAPI.renderStl = async () => ({
      success: false,
      timestamp: Date.now(),
      error: 'Parser error near line 1',
      diagnostics: {
        renderId: 'playwright-diagnosis',
        route: 'api',
        failureClass: 'syntax',
        failureStage: 'api_response',
        fallbackAttempted: false,
        fallbackUsed: false,
        userMessage:
          'OpenSCAD reported a syntax or parser error. Check for missing semicolons, braces, or invalid module calls.'
      }
    })
  })

  const renderButton = page.getByRole('button', { name: 'Refresh' })
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
