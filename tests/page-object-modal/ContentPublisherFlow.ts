import { expect, test, type Browser, type BrowserContext, type Page, type Locator } from '@playwright/test';

type RequiredEnvKey = 'GOOGLE_EMAIL' | 'GOOGLE_PASSWORD';
type EnvRecord = Record<string, string | undefined>;
type GlobalWithProcess = typeof globalThis & { process?: { env?: EnvRecord } };

function getEnvSnapshot(): EnvRecord {
  const globalProcess = (globalThis as GlobalWithProcess).process;
  return globalProcess?.env ?? {};
}
const envSnapshot = getEnvSnapshot();

export function getMissingEnvVars(): RequiredEnvKey[] {
  const required: RequiredEnvKey[] = ['GOOGLE_EMAIL', 'GOOGLE_PASSWORD'];
  const env = getEnvSnapshot();
  return required.filter((k) => !env[k]);
}

interface FlowOptions {
  locale?: string;
  permissions?: Parameters<BrowserContext['grantPermissions']>[0];
}

export class ContentPublisherFlow {
  private readonly credentials = {
    email: envSnapshot.GOOGLE_EMAIL as string,
    password: envSnapshot.GOOGLE_PASSWORD as string,
  };
  private readonly documentTitle = `Playwright Content Publisher ${Date.now()}`;
  private readonly documentBody =
    'This document was generated automatically by the Playwright smoke test for the Content Publisher add-on.';

  static async create(browser: Browser, options: FlowOptions = {}): Promise<ContentPublisherFlow> {
    const context = await browser.newContext({
      locale: options.locale ?? 'en-US',
      permissions: [...(options.permissions ?? ['clipboard-read', 'clipboard-write'])],
    });
    const page = await context.newPage();
    return new ContentPublisherFlow(context, page);
  }

  constructor(private readonly context: BrowserContext, private readonly page: Page) {}

  async dispose() {
    try {
      await this.context.close();
    } catch {}
  }

  // 1) Login
  async loginToGoogle() {
    await test.step('Sign into Google', async () => {
      await this.page.goto('https://accounts.google.com/signin/v2/identifier', { waitUntil: 'load' });
      await this.page.locator('input[type="email"]').fill(this.credentials.email);
      await this.page.getByRole('button', { name: /^Next$/i }).click();
      await this.page.waitForSelector('input[type="password"]', { state: 'visible', timeout: 30_000 });
      await this.page.locator('input[type="password"]').fill(this.credentials.password);
      await this.page.getByRole('button', { name: /^Next$/i }).click();
      await this.page.waitForLoadState('networkidle');
      if (!/https:\/\/docs\.google\.com/.test(this.page.url())) {
        await this.page.goto('https://docs.google.com/document/u/0/', { waitUntil: 'domcontentloaded' });
      }
    });
  }

  // 2) Create Google Doc
  async createDocument() {
    await test.step('Create Google Doc', async () => {
      await this.page.goto('https://docs.google.com/document/create', { waitUntil: 'domcontentloaded' });
      await Promise.race([this.page.waitForLoadState('networkidle').catch(() => null), this.page.waitForTimeout(2_000)]);
      const titleInput = await this.waitForTitleInput();
      await titleInput.click({ delay: 150 });
      await titleInput.fill(this.documentTitle);
      await titleInput.evaluate((e) => ('blur' in e ? (e as any).blur() : undefined));
      const editorFrame = this.page.frameLocator('iframe.docs-texteventtarget-iframe');
      const editable = editorFrame.locator('[contenteditable="true"]').first();
      await editable.waitFor({ state: 'visible', timeout: 60_000 });
      await editable.focus();
      await this.page.keyboard.insertText(this.documentBody);
      await this.page.waitForTimeout(500);
    });
  }

  // 3) Open Pantheon add-on and click first Allow
  async openPantheonAndClickFirstAllow() {
    await test.step('Open Pantheon add-on and click first Allow', async () => {
      const sidePanelRegion = this.page.getByRole('complementary', { name: /Side panel/i });
      const sidePanelVisible = await sidePanelRegion.isVisible({ timeout: 1_000 }).catch(() => false);
      if (!sidePanelVisible) {
        const openPanel = this.page.getByRole('button', { name: /Show (?:side )?panel/i }).first();
        if (await openPanel.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await openPanel.click({ delay: 50 });
          await this.page.waitForTimeout(500);
        }
      }
      const launcherById = this.page
        .locator(
          [
            `[id="AKfycbzjfgx9TaDghCrCXShdFOCnSz_qYl2gTujLd2frM-psFNjpx9BjHwYbQT6XqDtpy3Bb:1"] > .app-switcher-button-icon-container`,
            `#AKfycbzjfgx9TaDghCrCXShdFOCnSz_qYl2gTujLd2frM-psFNjpx9BjHwYbQT6XqDtpy3Bb > .app-switcher-button-icon-container`,
          ].join(', ')
        )
        .first();
      if (await launcherById.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await launcherById.click({ delay: 50 }).catch(() => undefined);
      } else {
        await this.page
          .locator('img[alt="Pantheon"], img[alt*="Pantheon"], div[aria-label="Pantheon"], div[aria-label*="Pantheon"]')
          .first()
          .click({ delay: 50 })
          .catch(() => undefined);
      }
      await this.page.waitForTimeout(1000);

      // Click inside add-on host iframe: [alt="Allow access"]
      await this.clickInAddonHost((f) => f.locator('[alt="Allow access"]').first());
      // Click Allow button inside the modal
      await this.clickDriveScopeModalAllow();


      // Re-acquire iframe and click Connect/Go to playground (buffer after modal)
      await this.page.waitForTimeout(1000);
      const hostIframe = this.page.locator('.add-on-host-content > iframe').first();
      const hostFrame = await hostIframe.contentFrame();
      if (!hostFrame) {
        throw new Error('Add-on host frame not available after Allow.');
      }
      const connectImg = hostFrame.getByRole('img', { name: /Connect to playground/i }).first();
      const goImg = hostFrame.getByRole('img', { name: /Go to playground/i }).first();
      const connectVisible = await connectImg.isVisible({ timeout: 1500 }).catch(() => false);
      const target = connectVisible ? connectImg : goImg;
      await expect(target).toBeVisible({ timeout: 60_000 });
      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await target.click({ delay: 50 }).catch(async () => {
        await target.click({ delay: 50, force: true }).catch(() => undefined);
      });


    });
  }

  // Click inside the add-on host iframe under .add-on-host-content using a frame-scoped locator factory
  async clickInAddonHost(getTarget: (frame: any) => Locator) {
    const container = this.page.locator('.add-on-host-content').first();
    await expect(container).toBeVisible({ timeout: 60_000 });

    const frameElement = container.locator('iframe').first();
    await expect(frameElement).toBeVisible({ timeout: 60_000 });

    const frame = await frameElement.contentFrame();
    if (!frame) {
      throw new Error('Add-on host frame not available.');
    }

    const target = getTarget(frame);
    await expect(target).toBeVisible({ timeout: 60_000 });
    await target.scrollIntoViewIfNeeded().catch(() => undefined);
    await target.click({ delay: 50 }).catch(async () => {
      await target.click({ delay: 50, force: true }).catch(() => undefined);
    });
  }

  // Focus the Drive scope modal (top-level) and click Allow if visible
  private async clickDriveScopeModalAllow() {
    const modal = this.page.locator('.request-file-scope-modal');
    await expect(modal).toBeVisible({ timeout: 60_000 });

    // Focus modal container (helps ensure key/click routing to dialog)
    const container = this.page.locator('.request-file-scope-modal-container');
    await container.click({ trial: true }).catch(() => undefined);
    await modal.click({ trial: true }).catch(() => undefined);

    // Robust Allow selector set (mirrors v1 flow)
    const allowBtn = modal
      .locator('[role="button"], .jfk-button, button')
      .filter({ hasText: /^Allow$/i })
      .first();

    await expect(allowBtn).toBeVisible({ timeout: 10_000 });
    await allowBtn.click({ delay: 50 }).catch(async () => {
      await allowBtn.click({ delay: 50, force: true }).catch(() => undefined);
    });

    // Wait for dialog to close
    await modal.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  }

  // Stubs required by the spec to compile; full implementations will be added step-by-step
  async openAddonSidebar() {
    await this.openPantheonAndClickFirstAllow();
  }

  async connectPlaygroundIfNeeded() {
    // Minimal: handle Drive modal if it appears after opening the add-on
    await this.clickDriveScopeModalAllow();
  }

  async publishDocument(): Promise<string> {
    await test.step('Handle Drive Allow modal (trimmed phase)', async () => {
      await this.clickDriveScopeModalAllow();
    });
    return this.page.url();
  }

  async verifyPublishedContent(_publishedUrl: string) {
    // Not implemented in this trimmed phase. Present to satisfy the spec flow.
  }

  private async waitForTitleInput() {
    const candidateSelectors = [
      'input[aria-label="Document title"]',
      'input[aria-label="Rename"]',
      '[role="textbox"][aria-label*="Title"]',
    ];
    for (const selector of candidateSelectors) {
      const locator = this.page.locator(selector).first();
      if (await locator.isVisible({ timeout: 2_000 }).catch(() => false)) return locator;
    }
    const fallback = this.page.getByLabel(/Document title|Rename|Untitled/i);
    await expect(fallback).toBeVisible({ timeout: 60_000 });
    return fallback;
  }
}