# Security Policy

## Supported versions

Security fixes are made on the latest released version of MDotion.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report them privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** ([private vulnerability reporting](https://github.com/SebastianI5/mdotion/security/advisories/new)). Include the MDotion and editor versions, the steps or Markdown file that trigger the problem, and its impact.

You should receive an answer within a few days. Once a fix is available it will be released and the advisory published, crediting the reporter unless they prefer otherwise.

## Scope

MDotion renders untrusted Markdown inside a VS Code webview. Issues of particular interest include:

- script execution or HTML injection from Markdown content (the webview uses a strict Content Security Policy and sanitizes HTML previews);
- links or messages that make the extension run commands, open files or URLs without a user action;
- content changed or lost when a file is saved.
