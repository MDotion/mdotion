import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Baseline } from '../shared/messages';

/**
 * The subset of the built-in Git extension API (`vscode.git`, version 1) used here.
 * Declared locally: the extension is optional, and nothing else of its API is needed.
 */
interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitApi;
}

interface GitApi {
  readonly state: 'uninitialized' | 'initialized';
  readonly onDidChangeState: vscode.Event<'uninitialized' | 'initialized'>;
  readonly onDidOpenRepository: vscode.Event<GitRepository>;
  getRepository(uri: vscode.Uri): GitRepository | null;
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}

interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: { readonly HEAD: { readonly commit?: string } | undefined; readonly onDidChange: vscode.Event<void> };
  show(ref: string, filePath: string): Promise<string>;
  getCommit(ref: string): Promise<{ hash: string; commitDate?: Date; authorDate?: Date }>;
}

async function getGitApi(): Promise<GitApi | null> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) {
    return null;
  }
  try {
    const exports = extension.isActive ? extension.exports : await extension.activate();
    return exports.enabled ? exports.getAPI(1) : null;
  } catch {
    return null;
  }
}

/** Resolves once the Git extension has discovered the repositories of the workspace. */
function whenInitialized(api: GitApi): Promise<void> {
  if (api.state === 'initialized') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const subscription = api.onDidChangeState((state) => {
      if (state === 'initialized') {
        subscription.dispose();
        resolve();
      }
    });
  });
}

/**
 * The repository of a file, also when it is reached through a symbolic link
 * (Git knows repositories by their real path: /private/var, not /var, on macOS).
 */
function findRepository(api: GitApi, uri: vscode.Uri): { repository: GitRepository; filePath: string } | null {
  const repository = api.getRepository(uri);
  if (repository) {
    return { repository, filePath: uri.fsPath };
  }
  let real: string;
  try {
    real = realpathSync.native(uri.fsPath);
  } catch {
    return null;
  }
  const viaRealPath = real === uri.fsPath ? null : api.getRepository(vscode.Uri.file(real));
  return viaRealPath ? { repository: viaRealPath, filePath: real } : null;
}

/** The file as it is in HEAD. Never throws: anything unexpected is reported as `none`. */
async function readBaseline(api: GitApi, uri: vscode.Uri): Promise<Baseline> {
  if (uri.scheme !== 'file') {
    return { status: 'none' };
  }
  const found = findRepository(api, uri);
  if (!found) {
    return { status: 'none' };
  }
  const { repository, filePath } = found;
  const head = repository.state.HEAD?.commit;
  if (!head) {
    // A repository without commits yet: everything in it is new.
    return { status: 'untracked' };
  }
  let text: string;
  try {
    text = await repository.show(head, filePath);
  } catch {
    // Not in HEAD: a new file (Git reports renames only once they are staged).
    return { status: 'untracked' };
  }
  let committedAt: number | null = null;
  try {
    const commit = await repository.getCommit(head);
    committedAt = (commit.commitDate ?? commit.authorDate)?.getTime() ?? null;
  } catch {
    // The date is only shown as a hint.
  }
  return { status: 'ok', text: text.replace(/\r\n/g, '\n'), commit: head.slice(0, 7), committedAt };
}

/**
 * Sends the HEAD version of one file to `onBaseline` and sends it again when the
 * repository moves (commit, checkout, pull) or appears (git init, late discovery).
 */
export class BaselineWatcher implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  private api: GitApi | null = null;
  private watched: GitRepository | null = null;
  private lastHead: string | undefined;
  private started = false;
  private disposed = false;
  private sequence = 0;

  constructor(
    private readonly uri: vscode.Uri,
    private readonly onBaseline: (baseline: Baseline) => void,
  ) {}

  /** Sends the baseline now; the first call also starts watching the repository. */
  async refresh(): Promise<void> {
    if (!this.started) {
      this.started = true;
      this.api = await getGitApi();
      if (this.api) {
        await whenInitialized(this.api);
        this.subscriptions.push(this.api.onDidOpenRepository(() => void this.send()));
      }
    }
    await this.send();
  }

  /** VS Code's own line diff against HEAD, for whoever wants the text view. */
  async openTextDiff(): Promise<void> {
    const api = this.api ?? (await getGitApi());
    if (!api) {
      return;
    }
    const name = path.basename(this.uri.fsPath);
    await vscode.commands.executeCommand('vscode.diff', api.toGitUri(this.uri, 'HEAD'), this.uri, `${name} (HEAD ↔ Working Tree)`, {
      preview: true,
    });
  }

  dispose(): void {
    this.disposed = true;
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  private async send(): Promise<void> {
    const sequence = ++this.sequence;
    const baseline = this.api ? await readBaseline(this.api, this.uri) : ({ status: 'none' } as const);
    if (this.api) {
      this.watch(findRepository(this.api, this.uri)?.repository ?? null);
    }
    // A newer request may have finished first (two commits in a row).
    if (!this.disposed && sequence === this.sequence) {
      this.onBaseline(baseline);
    }
  }

  private watch(repository: GitRepository | null): void {
    if (!repository || repository === this.watched) {
      return;
    }
    this.watched = repository;
    this.lastHead = repository.state.HEAD?.commit;
    this.subscriptions.push(
      repository.state.onDidChange(() => {
        const head = repository.state.HEAD?.commit;
        if (head !== this.lastHead) {
          this.lastHead = head;
          void this.send();
        }
      }),
    );
  }
}
