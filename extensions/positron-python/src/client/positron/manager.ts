/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable global-require */
/* eslint-disable class-methods-use-this */
// eslint-disable-next-line import/no-unresolved
import * as positron from 'positron';
import * as path from 'path';
import * as fs from 'fs-extra';

import { Event, EventEmitter } from 'vscode';
import { IServiceContainer } from '../ioc/types';
import { PythonExtension } from '../api/types';
import { pythonRuntimeDiscoverer } from './discoverer';
import { traceInfo } from '../logging';
import { IConfigurationService } from '../common/types';
import { PythonRuntimeSession } from './session';
import { PythonRuntimeExtraData } from './runtime';
import { EXTENSION_ROOT_DIR } from '../common/constants';
import { JupyterKernelSpec } from '../jupyter-adapter.d';

/**
 * Provides Python language runtime metadata and sessions to Positron;
 * implements positron.LanguageRuntimeManager.
 */
export class PythonRuntimeManager implements positron.LanguageRuntimeManager {
    /**
     * A map of Python interpreter paths to their language runtime metadata.
     */
    readonly registeredPythonRuntimes: Map<string, positron.LanguageRuntimeMetadata> = new Map();

    private readonly onDidDiscoverRuntimeEmitter = new EventEmitter<positron.LanguageRuntimeMetadata>();

    constructor(
        private readonly serviceContainer: IServiceContainer,
        private readonly pythonApi: PythonExtension,
        private readonly activatedPromise: Promise<void>,
    ) {
        this.onDidDiscoverRuntime = this.onDidDiscoverRuntimeEmitter.event;
    }

    /**
     * Discovers all Python language runtimes/environments available to the
     * extension.
     *
     * @returns An async generator that yields Python language runtime metadata.
     */
    discoverRuntimes(): AsyncGenerator<positron.LanguageRuntimeMetadata> {
        return this.discoverPythonRuntimes();
    }

    /**
     * An event that fires when a new Python language runtime is discovered.
     */
    onDidDiscoverRuntime: Event<positron.LanguageRuntimeMetadata>;

    /**
     * Registers a new language runtime with Positron.
     *
     * @param runtimeMetadata The metadata for the runtime to register.
     */
    public registerLanguageRuntime(runtime: positron.LanguageRuntimeMetadata): void {
        // Save the runtime for later use
        const extraData = runtime.extraRuntimeData as PythonRuntimeExtraData;
        this.registeredPythonRuntimes.set(extraData.pythonPath, runtime);
        this.onDidDiscoverRuntimeEmitter.fire(runtime);
    }

    /**
     * Creates a new Python language runtime session.
     *
     * @param runtimeMetadata The metadata for the runtime to create.
     * @param sessionMetadata The metadata for the session to create.
     *
     * @returns A promise that resolves to the new language runtime session.
     */
    async createSession(
        runtimeMetadata: positron.LanguageRuntimeMetadata,
        sessionMetadata: positron.RuntimeSessionMetadata,
    ): Promise<positron.LanguageRuntimeSession> {
        traceInfo('createPythonSession: getting service instances');

        const configService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);

        // Extract the extra data from the runtime metadata; it contains the
        // environment ID that was saved when the metadata was created.
        const extraData: PythonRuntimeExtraData = runtimeMetadata.extraRuntimeData as PythonRuntimeExtraData;
        if (!extraData || !extraData.pythonPath) {
            throw new Error(`Runtime metadata missing Python path: ${JSON.stringify(extraData)}`);
        }

        // Check Python kernel debug and log level settings
        // NOTE: We may need to pass a resource to getSettings to support multi-root workspaces
        traceInfo('createPythonSession: getting extension runtime settings');

        const settings = configService.getSettings();
        const debug = settings.languageServerDebug;
        const logLevel = settings.languageServerLogLevel;
        const { quietMode } = settings;

        // If required, also locate an available port for the debugger
        traceInfo('createPythonSession: locating available debug port');
        const portfinder = require('portfinder');
        let debugPort;
        if (debug) {
            if (debugPort === undefined) {
                debugPort = 5678; // Default port for debugpy
            }
            debugPort = await portfinder.getPortPromise({ port: debugPort });
        }

        const command = extraData.pythonPath;
        const lsScriptPath = path.join(EXTENSION_ROOT_DIR, 'python_files', 'positron', 'positron_language_server.py');
        const args = [
            command,
            lsScriptPath,
            '-f',
            '{connection_file}',
            '--logfile',
            '{log_file}',
            `--loglevel=${logLevel}`,
            `--session-mode=${sessionMetadata.sessionMode}`,
        ];
        if (debugPort) {
            args.push(`--debugport=${debugPort}`);
        }
        if (quietMode) {
            args.push('--quiet');
        }

        // Create a kernel spec for this Python installation. The kernel spec is
        // only provided for new sessions; existing (restored) sessions already
        // have one.
        const kernelSpec: JupyterKernelSpec = {
            argv: args,
            display_name: `${runtimeMetadata.runtimeName}`,
            language: 'Python',
        };

        traceInfo(`createPythonSession: kernelSpec argv: ${args}`);

        // Create an adapter for the kernel to fulfill the LanguageRuntime interface.
        traceInfo(`createPythonSession: creating PythonRuntime`);
        return new PythonRuntimeSession(
            runtimeMetadata,
            sessionMetadata,
            this.serviceContainer,
            this.pythonApi,
            kernelSpec,
        );
    }

    /**
     * Restores (reconnects to) an existing Python session.
     *
     * @param runtimeMetadata The metadata for the runtime to restore
     * @param sessionMetadata The metadata for the session to restore
     *
     * @returns The restored session.
     */
    async restoreSession(
        runtimeMetadata: positron.LanguageRuntimeMetadata,
        sessionMetadata: positron.RuntimeSessionMetadata,
    ): Promise<positron.LanguageRuntimeSession> {
        return new PythonRuntimeSession(runtimeMetadata, sessionMetadata, this.serviceContainer, this.pythonApi);
    }

    /**
     * Validates the metadata for a Python language runtime.
     *
     * @param metadata The metadata to validate.
     * @returns The validated metadata.
     */
    async validateMetadata(metadata: positron.LanguageRuntimeMetadata): Promise<positron.LanguageRuntimeMetadata> {
        // Extract the extra data from the runtime metadata
        const extraData: PythonRuntimeExtraData = metadata.extraRuntimeData as PythonRuntimeExtraData;
        if (!extraData || !extraData.pythonPath) {
            throw new Error(`Runtime metadata missing Python path: ${JSON.stringify(extraData)}`);
        }

        // Ensure that the Python interpreter exists
        const exists = await fs.pathExists(extraData.pythonPath);
        if (!exists) {
            // Consider: Could we return metadata for an interpreter compatible
            // with the one requested rather than throwing?
            throw new Error(`Python interpreter path is missing: ${extraData.pythonPath}`);
        }

        // Metadata is valid
        return metadata;
    }

    /**
     * Wrapper for Python runtime discovery method that caches the metadata
     * before it's returned to Positron.
     */
    private async *discoverPythonRuntimes(): AsyncGenerator<positron.LanguageRuntimeMetadata> {
        // Get the async generator for Python runtimes
        const discoverer = pythonRuntimeDiscoverer(this.serviceContainer, this.activatedPromise);

        // As each runtime metadata element is returned, cache and return it
        for await (const runtime of discoverer) {
            // Save a copy of the metadata for later use
            const extraData = runtime.extraRuntimeData as PythonRuntimeExtraData;
            this.registeredPythonRuntimes.set(extraData.pythonPath, runtime);

            // Return the runtime to Positron
            yield runtime;
        }
    }
}
