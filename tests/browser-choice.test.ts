import test from 'node:test';
import assert from 'node:assert/strict';
import { browserPlan, identifyBrowser, parseDefaultBrowserPlist } from '../server/browser.ts';
test('default browser detection excludes nested version dictionaries', () => {
  const xml =
    '<plist><dict><key>LSHandlers</key><array><dict><key>LSHandlerPreferredVersions</key><dict><key>LSHandlerRoleAll</key><string>1</string></dict><key>LSHandlerRoleAll</key><string>com.google.chrome</string><key>LSHandlerURLScheme</key><string>https</string></dict></array></dict></plist>';
  assert.equal(parseDefaultBrowserPlist(xml), 'com.google.chrome');
  assert.equal(identifyBrowser('com.apple.safari'), undefined);
  assert.equal(identifyBrowser('com.google.chrome'), 'chrome');
  assert.equal(identifyBrowser('MSEdgeHTM'), 'edge');
  assert.equal(identifyBrowser('google-chrome.desktop'), 'chrome');
});
test('explicit browser selection chooses automation channel and separate profile', () => {
  assert.equal(browserPlan('chrome').channel, 'chrome');
  assert.equal(browserPlan('edge').channel, 'msedge');
  assert.equal(browserPlan('chromium').channel, undefined);
  assert.equal(browserPlan('chromium').mode, 'managed');
  assert.notEqual(browserPlan('chrome').profile, browserPlan('edge').profile);
});
