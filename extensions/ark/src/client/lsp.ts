/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit, PBC.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
	createClientSocketTransport,
	MessageTransports,
	MessageReader
} from 'vscode-languageclient/node';

import { trace, traceOutputChannel } from './logging';

// A global instance of the LSP language client provided by this language pack
let client: LanguageClient;

/**
 * Activate the language server; returns a promise that resolves to the port on
 * which the client is listening.
 *
 * @param context The VSCode extension context.
 */
export async function activateLsp(context: vscode.ExtensionContext): Promise<number> {

	return new Promise((resolve, reject) => {

		// Define server options for the language server; this is a callback
		// that creates and returns the reader/writer stream for TCP
		// communication.
		const serverOptions = async () => {

			// Find an open port for the language server to listen on.
			trace('Finding open port for R language server...');
			const portfinder = require('portfinder');
			const port = await portfinder.getPortPromise();
			const address = `127.0.0.1:${port}`;

			// Create our own socket transport
			const transport = await createClientSocketTransport(port);

			// Allow kernel startup to proceed
			resolve(port);

			// Wait for the language server to connect to us
			trace(`Waiting to connect to language server at ${address}...`);
			const protocol = await transport.onConnected();
			trace(`Connected to language server at ${address}, returning protocol transports`);

			return {
				reader: protocol[0],
				writer: protocol[1],
			};

		};

		const clientOptions: LanguageClientOptions = {
			documentSelector: [{ scheme: 'file', language: 'r' }],
			synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher('**/*.R') },
			traceOutputChannel: traceOutputChannel(),
		};

		trace('Creating ARK language client...');
		client = new LanguageClient('ark', 'ARK Language Server', serverOptions, clientOptions);
		client.onDidChangeState(event => {
			trace(`ARK language client state changed ${event.oldState} => ${event.newState}`);
		});

		context.subscriptions.push(client.start());

		client.onReady().then(() => {
			trace('ARK language client is ready');
		});
	});
}

export function deactivate(): Thenable<void> | undefined {
	return client?.stop();
}
