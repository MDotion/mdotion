import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const VIEW_TYPE = 'mdotion.markdownEditor';

export async function run(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdotion-e2e-'));
  const filePath = path.join(tmpDir, 'sample.md');
  const uri = vscode.Uri.file(filePath);
  const initial = [
    '# E2E title',
    '',
    'Paragraph with snake_case and a [link](https://example.com).',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '<div align="center">HTML</div>',
    '',
  ].join('\n');
  fs.writeFileSync(filePath, initial, 'utf8');

  const failures: string[] = [];
  const check = async (name: string, body: () => Promise<void>) => {
    try {
      await body();
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`  ✗ ${name}`);
    }
  };

  await check('opens the visual editor', async () => {
    await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
    await waitFor(() => activeViewType() === VIEW_TYPE, 'custom editor tab to be active');
  });

  await check('opening does not modify the file', async () => {
    await sleep(2500); // let the webview boot, parse and run its debounce
    const document = findDocument(uri);
    assert.ok(document, 'document should be open');
    assert.strictEqual(document.isDirty, false, 'document must not be dirty after opening');
    assert.strictEqual(document.getText(), initial);
  });

  await check('external edits do not make the webview write back', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(0, 11), ' changed');
    assert.ok(await vscode.workspace.applyEdit(edit));
    await sleep(1500);
    assert.strictEqual(findDocument(uri)?.getText(), initial.replace('# E2E title', '# E2E title changed'));
    await vscode.commands.executeCommand('undo');
  });

  await check('Switch replaces the tab in both directions, even with unsaved changes', async () => {
    await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
    await waitFor(() => activeViewType() === VIEW_TYPE, 'custom editor tab');
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(2, 0), 'Unsaved. ');
    assert.ok(await vscode.workspace.applyEdit(edit));

    await vscode.commands.executeCommand('mdotion.toggleEditor');
    await waitFor(() => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString(), 'text editor');
    await waitFor(() => tabsFor(uri) === 1, 'the visual tab to be replaced');

    await vscode.commands.executeCommand('mdotion.toggleEditor');
    await waitFor(() => activeViewType() === VIEW_TYPE, 'custom editor tab again');
    await waitFor(() => tabsFor(uri) === 1, 'the text tab to be replaced');
    assert.ok(findDocument(uri)?.getText().includes('Unsaved. '), 'unsaved changes survive the switch');
  });

  await check('Copy All Markdown copies the whole file', async () => {
    await vscode.env.clipboard.writeText('');
    await vscode.commands.executeCommand('mdotion.copyMarkdown');
    assert.strictEqual(await vscode.env.clipboard.readText(), findDocument(uri)?.getText());
  });

  await check('the theme is a persistent extension setting', async () => {
    const config = vscode.workspace.getConfiguration('mdotion');
    assert.strictEqual(config.inspect('theme')?.defaultValue, 'auto');
    await config.update('theme', 'dark', vscode.ConfigurationTarget.Global);
    assert.strictEqual(vscode.workspace.getConfiguration('mdotion').get('theme'), 'dark');
    await config.update('theme', undefined, vscode.ConfigurationTarget.Global);
  });

  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  if (failures.length > 0) {
    throw new Error(`Mdotion e2e failures:\n${failures.join('\n')}`);
  }
}

function activeViewType(): string | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom ? input.viewType : undefined;
}

function tabsFor(uri: vscode.Uri): number {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => {
      const input = tab.input;
      return (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) && input.uri.toString() === uri.toString();
    }).length;
}

function findDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
}

async function waitFor(condition: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await sleep(100);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
