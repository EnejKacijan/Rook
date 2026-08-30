import { chromium } from 'playwright-core'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const htmlPath = path.join(root, 'tmp', 'pdfs', 'adaptive-strength-app-product-overview.html')
const pdfPath = path.join(root, 'output', 'pdf', 'adaptive-strength-app-product-overview.pdf')
const qaPath = path.join(root, 'tmp', 'pdfs', 'adaptive-strength-app-product-overview-qa.png')
const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({
  path: pdfPath,
  format: 'A4',
  landscape: true,
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
})
await page.emulateMedia({ media: 'screen' })
await page.screenshot({ path: qaPath, fullPage: true })
console.log(pdfPath)
console.log(qaPath)
await browser.close()
