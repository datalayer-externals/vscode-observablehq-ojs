import type { ErrorArray } from "@hpcc-js/observable-md";
import * as path from "path";
import * as vscode from "vscode";
import { Diagnostic } from "./diagnostic";
import { diagnostics } from "./grammar";

export class Preview {
    protected _diagnostic: Diagnostic;

    static currentPanel: Preview | undefined;

    static readonly viewType = "OJSPreview";

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionPath: string;
    private _disposables: vscode.Disposable[] = [];

    static async createOrShow(ctx: vscode.ExtensionContext, textDocument: vscode.TextDocument) {

        // If we already have a panel, show it.
        if (Preview.currentPanel) {
            // Preview.currentPanel._panel.reveal();
            return Promise.resolve();
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            Preview.viewType,
            "OJS Preview",
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.join(ctx.extensionPath, "dist"))]
            }
        );

        Preview.currentPanel = new Preview(panel, ctx);
        return Preview.currentPanel.init(textDocument);
    }

    static revive(panel: vscode.WebviewPanel, ctx: vscode.ExtensionContext) {
        Preview.currentPanel = new Preview(panel, ctx);
    }

    private constructor(panel: vscode.WebviewPanel, ctx: vscode.ExtensionContext) {
        this._panel = panel;
        this._diagnostic = Diagnostic.attach(ctx);
        this._extensionPath = ctx.extensionPath;

        // Set the webview's initial html content
        this._panel.webview.html = this.getHtmlForWebview(this._panel.webview);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        // this._panel.onDidChangeViewState(
        //     e => {
        //         if (this._panel.visible) {
        //             this._panel.webview.html = this.getHtmlForWebview(this._panel.webview);
        //         }
        //     },
        //     null,
        //     this._disposables
        // );
    }

    _callbackID = 0;
    _callbacks = {};
    async init(doc: vscode.TextDocument) {
        // Handle messages from the webview
        this._diagnostic.setRuntime(doc.uri, []);
        let runtimeErrors = [];
        setInterval(() => {
            if (runtimeErrors) {
                runtimeErrors.forEach(e => {
                    this._diagnostic.setRuntime(doc.uri, diagnostics(doc, e));
                });
                runtimeErrors = [];
            }
        }, 1000);
        return new Promise((resolve, reject) => {
            this._panel.webview.onDidReceiveMessage(message => {
                const callback = this._callbacks[message.callbackID];
                if (callback) {
                    callback(message.content);
                } else {
                    switch (message.command) {
                        case "loaded":
                            resolve();
                            break;
                        case "errors":
                            runtimeErrors.push(message.content);
                            // this._diagnostic.setRuntime(doc.uri, diagnostics(doc, message.content));
                            break;
                        case "alert":
                            vscode.window.showErrorMessage(message.content);
                            break;
                    }
                }
            }, null, this._disposables);
        });
    }

    echo(content) {
        this._panel.webview.postMessage({ command: "echo", content });
    }

    evaluate(content): Promise<ErrorArray> {
        return new Promise((resolve, reject) => {
            const callbackID = ++this._callbackID;
            this._callbacks[callbackID] = (...args: any[]) => {
                delete this._callbacks[callbackID];
                resolve(...args);
            };
            this._panel.webview.postMessage({ command: "evaluate", content, callbackID });
        });
    }

    pull(url): Promise<string> {
        return new Promise((resolve, reject) => {
            const callbackID = ++this._callbackID;
            this._callbacks[callbackID] = (...args: any[]) => {
                delete this._callbacks[callbackID];
                resolve(...args);
            };
            this._panel.webview.postMessage({ command: "pull", url, callbackID });
        });
    }

    dispose() {
        Preview.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private getHtmlForWebview(webview: vscode.Webview) {
        // Local path to main script run in the webview
        const scriptPathOnDisk = vscode.Uri.file(
            path.join(this._extensionPath, "dist", "webview.js")
        );

        // And the uri we use to load this script in the webview
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();

        return `\
<!DOCTYPE html>
<html>

<head>
    <meta charset="utf-8">
    <title>Observable MD</title>
    <link href="https://cdn.jsdelivr.net/npm/@hpcc-js/common/font-awesome/css/font-awesome.min.css" rel="stylesheet">
    <style>
    body {
        padding:0px;
        margin:8px;
        background:white;
        color: black;
        overflow-x: scroll !important;
        overflow-y: scroll !important;
        max-width: 800px
    }
    </style>
</head>

<body>
    <div id="placeholder">
        ...loading...
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>

</html>
`;
    }
}

function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}