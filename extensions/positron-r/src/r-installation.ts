/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as semver from 'semver';
import * as path from 'path';
import * as fs from 'fs';
import { extractValue, readLines } from './util';
import { Logger } from './extension';

/**
 * Represents a single installation of R on a user's system.
 */
export class RInstallation {
	// there are many reasons that we might deem a putative R installation to be unusable
	// downstream users of RInstallation should filter for `valid` is `true`
	public readonly valid: boolean = false;

	public readonly binpath: string = '';
	public readonly homepath: string = '';
	// The semVersion field was added because changing the version field from a string that's
	// "major.minor" to an instance of SemVer (conveying major.minor.patch) would have
	// downstream consequence I don't want to take on now. But we can probably rationalize this
	// in the future.
	public readonly semVersion: semver.SemVer = new semver.SemVer('0.0.1');
	public readonly version: string = '';
	public readonly arch: string = '';
	public readonly current: boolean = false;
	public readonly orthogonal: boolean = false;

	/**
	 * Represents an installation of R on the user's system.
	 *
	 * @param pth Filepath for an R "binary" (on macOS and linux, this is actually a
	 *   shell script)
	 * @param current Whether this installation is set as the current version of
	 *   R
	 */
	constructor(pth: string, current: boolean = false) {
		Logger.info(`Candidate R binary at ${pth}`);

		this.binpath = pth;
		this.current = current;

		if (os.platform() === 'win32') {
			// TODO: Windows - do we want something more robust here?
			this.homepath = path.join(pth, '..', '..');
		} else {
			const binLines = readLines(this.binpath);
			const re = new RegExp('Shell wrapper for R executable');
			if (!binLines.some(x => re.test(x))) {
				Logger.info('Binary is not a shell script wrapping the executable');
				return;
			}
			const targetLine = binLines.find(line => line.match('R_HOME_DIR'));
			if (!targetLine) {
				Logger.info('Can\'t determine R_HOME_DIR from the binary');
				return;
			}
			// macOS: R_HOME_DIR=/Library/Frameworks/R.framework/Versions/4.3-arm64/Resources
			// macOS non-orthogonal: R_HOME_DIR=/Library/Frameworks/R.framework/Resources
			// linux: R_HOME_DIR=/opt/R/4.2.3/lib/R
			const R_HOME_DIR = extractValue(targetLine, 'R_HOME_DIR');
			this.homepath = R_HOME_DIR;
			if (this.homepath === '') {
				Logger.info('Can\'t determine R_HOME_DIR from the binary');
				return;
			}
		}

		// orthogonality is a concern specific to macOS
		// a non-orthogonal R "binary" is hard-wired to launch the current version of R,
		// so it only works when it actually is the current version of R
		// learn more in https://github.com/r-lib/rig/blob/main/src/macos.rs
		// see is_orthogonal(), make_orthogonal_()
		const re2 = new RegExp('R[.]framework/Resources');
		this.orthogonal = !re2.test(this.homepath);

		// make sure to target a base package that contains compiled code, so the
		// 'Built' field contains the platform info
		const descPath = path.join(this.homepath, 'library', 'utils', 'DESCRIPTION');
		// We have actually seen an R "installation" that doesn't have the base packages!
		// https://github.com/posit-dev/positron/issues/1314
		if (!fs.existsSync(descPath)) {
			Logger.info(`Can\'t find DESCRIPTION for the utils package at ${descPath}`);
			return;
		}
		const descLines = readLines(descPath);
		const targetLine2 = descLines.filter(line => line.match('Built'))[0];
		if (!targetLine2) {
			Logger.info(`Can't find 'Built' field for the utils package in its DESCRIPTION: ${descPath}`);
			return;
		}
		// macOS arm64: Built: R 4.3.1; aarch64-apple-darwin20; 2023-06-16 21:52:54 UTC; unix
		// macOS intel: Built: R 4.3.1; x86_64-apple-darwin20; 2023-06-16 21:51:34 UTC; unix
		// linux: Built: R 4.2.3; x86_64-pc-linux-gnu; 2023-03-15 09:03:13 UTC; unix
		// windows: Built: R 4.3.2; x86_64-w64-mingw32; 2023-10-31 13:57:45 UTC; windows
		const builtField = extractValue(targetLine2, 'Built', ':');
		const builtParts = builtField.split(new RegExp(';\\s+'));

		const versionPart = builtParts[0];
		this.semVersion = semver.coerce(versionPart) ?? new semver.SemVer('0.0.1');
		this.version = this.semVersion.format();

		const platformPart = builtParts[1];
		const architecture = platformPart.match('^(aarch64|x86_64)');

		if (architecture) {
			const arch = architecture[1];

			// Remap known architectures to equivalent values used by Rig,
			// just for overall consistency and familiarity
			if (arch === 'aarch64') {
				this.arch = 'arm64';
			} else if (arch === 'x86_64') {
				this.arch = 'x86_64';
			} else {
				// Should never happen because of how our `match()` works
				console.warn(`Matched an unknown architecture '${arch}' for R '${this.version}'.`);
				this.arch = arch;
			}
		} else {
			// Unknown architecture
			this.arch = '';
		}

		this.valid = true;

		Logger.info(`R installation discovered: ${JSON.stringify(this, null, 2)}`);
	}
}
