import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { BaselineWatcher } from '../../../src/git/baseline';
import type { Baseline } from '../../../src/shared/messages';
import { EDITOR_COMMANDS } from '../../../src/shared/protocolConstants';

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
    // Activate first: an open racing the startup of a fresh profile can land in a text tab.
    const extension = vscode.extensions.all.find((candidate) =>
      candidate.packageJSON?.contributes?.customEditors?.some((editor: { viewType: string }) => editor.viewType === VIEW_TYPE),
    );
    assert.ok(extension, 'the extension under test should be installed');
    await extension.activate();
    await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
    await waitFor(() => activeViewType() === VIEW_TYPE, 'custom editor tab to be active', 30_000);
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

  await check('Switch replaces the tab in both directions and never loses unsaved changes', async () => {
    // In-place replacement of a dirty editor needs `reopenActiveEditorWith` (VS Code 1.100+).
    const inPlace = (await vscode.commands.getCommands(true)).includes('reopenActiveEditorWith');
    await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
    await waitFor(() => activeViewType() === VIEW_TYPE, 'custom editor tab');

    // Clean document: every version replaces the tab.
    await vscode.commands.executeCommand('mdotion.toggleEditor');
    await waitFor(() => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString(), 'text editor');
    await waitFor(() => tabsFor(uri) === 1, 'the visual tab to be replaced');

    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(2, 0), 'Unsaved. ');
    assert.ok(await vscode.workspace.applyEdit(edit));
    await vscode.commands.executeCommand('mdotion.toggleEditor');
    await waitFor(() => activeViewType() === VIEW_TYPE, 'custom editor tab again');
    if (inPlace) {
      await waitFor(() => tabsFor(uri) === 1, 'the text tab to be replaced');
    } else {
      assert.ok(tabsFor(uri) <= 2, 'older IDEs keep the dirty tab open instead of discarding it');
    }
    await sleep(500);
    assert.ok(findDocument(uri)?.getText().includes('Unsaved. '), 'unsaved changes survive the switch');
  });

  await check('Copy All Markdown copies the whole file', async () => {
    await vscode.env.clipboard.writeText('');
    await vscode.commands.executeCommand('mdotion.copyMarkdown');
    assert.strictEqual(await vscode.env.clipboard.readText(), findDocument(uri)?.getText());
  });

  await check('Use / Stop Using as Default update the Markdown editor association', async () => {
    const associations = () =>
      vscode.workspace.getConfiguration('workbench').inspect<Record<string, string>>('editorAssociations')?.globalValue ?? {};
    await vscode.commands.executeCommand('mdotion.useAsDefault');
    assert.strictEqual(associations()['*.md'], VIEW_TYPE);
    assert.strictEqual(associations()['*.markdown'], VIEW_TYPE);
    await vscode.commands.executeCommand('mdotion.stopUsingAsDefault');
    assert.strictEqual(associations()['*.md'], undefined);
  });

  await check('Toggle Outline and Go to Heading reach the visual editor without touching the file', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('mdotion.toggleOutline'), 'Toggle Outline is registered');
    assert.ok(commands.includes('mdotion.goToHeading'), 'Go to Heading is registered');
    // Start clean: older IDEs keep the text tab of the previous check open next to the visual one.
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await waitFor(() => tabsFor(uri) === 0, 'every tab of the file to close');
    await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
    await waitFor(() => activeViewType() === VIEW_TYPE, 'custom editor tab');
    const before = findDocument(uri)?.getText();
    await vscode.commands.executeCommand('mdotion.toggleOutline');
    await vscode.commands.executeCommand('mdotion.toggleOutline');
    await sleep(1000);
    assert.strictEqual(findDocument(uri)?.isDirty, false, 'the outline is view state, not content');
    assert.strictEqual(findDocument(uri)?.getText(), before);
  });

  await check('every editor command is registered and none of them touches the file', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of EDITOR_COMMANDS) {
      assert.ok(commands.includes(`mdotion.${command}`), `mdotion.${command} is registered`);
    }
    await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
    await waitFor(() => activeViewType() === VIEW_TYPE, 'custom editor tab');
    const before = findDocument(uri)?.getText();
    for (const command of ['toggleFoldAll', 'toggleFoldAll', 'foldSection', 'unfoldSection', 'find', 'findNext', 'showShortcuts', 'showShortcuts', 'showChanges', 'nextChange', 'showChanges']) {
      await vscode.commands.executeCommand(`mdotion.${command}`);
      await sleep(150);
    }
    await sleep(1000);
    assert.strictEqual(findDocument(uri)?.isDirty, false, 'folding, find, shortcuts and changes are view state');
    assert.strictEqual(findDocument(uri)?.getText(), before);
  });

  await check('reads the last commit of a file through the Git extension', async () => {
    // Inside the workspace, like a real project: VS Code 1.85 does not open repositories outside it.
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.tmpdir();
    fs.mkdirSync(path.join(workspace, 'tests/e2e/out'), { recursive: true });
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(workspace, 'tests/e2e/out/git-')));
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=MDotion', '-c', 'user.email=e2e@mdotion.app', '-c', 'commit.gpgsign=false', ...args], { cwd: repo });
    const notes = vscode.Uri.file(path.join(repo, 'notes.md'));
    git('init', '-q');
    fs.writeFileSync(notes.fsPath, '# Committed\r\n\nFirst version.\n');
    git('add', 'notes.md');
    git('commit', '-q', '-m', 'first');
    fs.writeFileSync(notes.fsPath, '# Committed\n\nEdited, not committed.\n');
    fs.writeFileSync(path.join(repo, 'new.md'), 'Never committed.\n');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(notes));

    // A repository created after startup is only found by a scan; open it like the Source Control view does.
    type TestRepository = { rootUri: vscode.Uri; status(): Promise<void> };
    const gitApi = (
      await vscode.extensions
        .getExtension<{ getAPI(version: 1): { openRepository(root: vscode.Uri): Promise<TestRepository | null>; repositories: TestRepository[] } }>('vscode.git')!
        .activate()
    ).getAPI(1);
    const opened = await gitApi.openRepository(vscode.Uri.file(repo));
    console.log(`    git repositories: ${gitApi.repositories.map((r) => r.rootUri.fsPath).join(', ')} (opened: ${opened ? 'yes' : 'no'})`);
    const received: Baseline[] = [];
    const watcher = new BaselineWatcher(notes, (baseline) => received.push(baseline));
    const fresh = new BaselineWatcher(vscode.Uri.file(path.join(repo, 'new.md')), (baseline) => received.push(baseline));
    try {
      await watcher.refresh();
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      await waitFor(
        () => received.some((baseline) => baseline.status === 'ok'),
        `the HEAD version (git extension: ${gitExtension ? (gitExtension.isActive ? 'active' : 'inactive') : 'missing'}, received: ${JSON.stringify(received.map((baseline) => baseline.status))})`,
        20_000,
      );
      const ok = received.find((baseline) => baseline.status === 'ok') as Extract<Baseline, { status: 'ok' }>;
      assert.strictEqual(ok.text, '# Committed\n\nFirst version.\n', 'HEAD content with LF line endings');
      assert.match(ok.commit, /^[0-9a-f]{7}$/);

      received.length = 0;
      await fresh.refresh();
      assert.deepStrictEqual(received.at(-1), { status: 'untracked' });

      // A new commit is sent again without being asked.
      received.length = 0;
      git('commit', '-q', '-am', 'second');
      // What Source Control's Refresh does; the file watcher alone can take long on CI machines.
      await opened?.status();
      await waitFor(
        () => received.some((baseline) => baseline.status === 'ok' && baseline.text.includes('Edited, not committed.')),
        'the new HEAD after a commit',
        20_000,
      );
    } finally {
      watcher.dispose();
      fresh.dispose();
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      fs.rmSync(repo, { recursive: true, force: true });
    }
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
    throw new Error(`MDotion e2e failures:\n${failures.join('\n')}`);
  }
}

function activeViewType(): string | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom ? input.viewType : undefined;
}

function describeActiveTab(): string {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!tab) {
    return 'none';
  }
  const kind =
    tab.input instanceof vscode.TabInputCustom
      ? `custom ${tab.input.viewType}`
      : tab.input instanceof vscode.TabInputText
        ? 'text'
        : tab.input instanceof vscode.TabInputWebview
          ? `webview ${tab.input.viewType}`
          : 'other';
  return `"${tab.label}" (${kind})`;
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

async function waitFor(condition: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${what} (active tab: ${describeActiveTab()})`);
    }
    await sleep(100);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
