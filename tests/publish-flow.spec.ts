import { test , expect} from '@playwright/test';
import { ContentPublisherFlow, getMissingEnvVars } from './page-object-modal/ContentPublisherFlow';

const missingEnv = getMissingEnvVars();

test.skip(missingEnv.length > 0, `Missing required env vars: ${missingEnv.join(', ')}`);

test.describe.configure({ mode: 'serial' });

test.describe('Content Publisher publish flow', () => {
  test.describe.configure({ timeout: 60_000 });

  test('publishes the current Google Doc to Pantheon', async ({ browser }) => {
    const flow = await ContentPublisherFlow.create(browser);
    try {
      await flow.loginToGoogle();
      await flow.createDocument();
      await flow.openAddonSidebar();
      await flow.connectPlaygroundIfNeeded();
      const publishedUrl = await flow.publishDocument();
      await flow.verifyPublishedContent(publishedUrl);
    } finally {
      await flow.dispose();
    }
  });

});