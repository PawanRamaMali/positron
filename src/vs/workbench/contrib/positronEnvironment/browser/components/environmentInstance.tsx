/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./environmentInstance';
import * as React from 'react';
import { FixedSizeListProps, FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { KeyboardEvent, useEffect, useRef, useState } from 'react'; // eslint-disable-line no-duplicate-imports
import { DisposableStore } from 'vs/base/common/lifecycle';
import { positronClassNames } from 'vs/base/common/positronUtilities';
import { EnvironmentVariableItem } from 'vs/workbench/contrib/positronEnvironment/browser/components/environmentVariableItem';
import { IEnvironmentVariableItem } from 'vs/workbench/services/positronEnvironment/common/interfaces/environmentVariableItem';
import { EnvironmentVariableGroup } from 'vs/workbench/contrib/positronEnvironment/browser/components/environmentVariableGroup';
import { IEnvironmentVariableGroup } from 'vs/workbench/services/positronEnvironment/common/interfaces/environmentVariableGroup';
import { EnvironmentEntry, IPositronEnvironmentInstance } from 'vs/workbench/services/positronEnvironment/common/interfaces/positronEnvironmentService';

/**
 * Constants.
 */
const DEFAULT_NAME_COLUMN_WIDTH = 130;
const MINIMUM_NAME_COLUMN_WIDTH = 100;
const TYPE_VISIBILITY_THRESHOLD = 250;

/**
 * isEnvironmentVariableGroup user-defined type guard.
 * @param _ The entry.
 * @returns Whether the entry is IEnvironmentVariableGroup.
 */
const isEnvironmentVariableGroup = (_: EnvironmentEntry): _ is IEnvironmentVariableGroup => {
	return 'title' in _;
};

/**
 * isEnvironmentVariableItem user-defined type guard.
 * @param _ The entry.
 * @returns Whether the entry is IEnvironmentVariableItem.
 */
const isEnvironmentVariableItem = (_: EnvironmentEntry): _ is IEnvironmentVariableItem => {
	return 'path' in _;
};

/**
 * EnvironmentInstanceProps interface.
 */
interface EnvironmentInstanceProps {
	hidden: boolean;
	width: number;
	height: number;
	positronEnvironmentInstance: IPositronEnvironmentInstance;
}

/**
 * EnvironmentInstance component.
 * @param props A EnvironmentInstanceProps that contains the component properties.
 * @returns The rendered component.
 */
export const EnvironmentInstance = (props: EnvironmentInstanceProps) => {
	// Reference hooks.
	const ref = useRef<HTMLDivElement>(undefined!);

	// State hooks.
	const [nameColumnWidth, setNameColumnWidth] = useState(DEFAULT_NAME_COLUMN_WIDTH);
	const [detailsColumnWidth, setDetailsColumnWidth] =
		useState(props.width - DEFAULT_NAME_COLUMN_WIDTH);
	const [typeVisible, setTypeVisible] =
		useState(props.width - DEFAULT_NAME_COLUMN_WIDTH > TYPE_VISIBILITY_THRESHOLD);
	const [entries, setEntries] = useState<EnvironmentEntry[]>([]);
	const [resizingColumn, setResizingColumn] = useState(false);
	const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
	const [focused, setFocused] = useState(false);

	// Main useEffect hook.
	useEffect(() => {
		// Create the disposable store for cleanup.
		const disposableStore = new DisposableStore();

		// Add the onDidChangeState event handler.
		disposableStore.add(
			props.positronEnvironmentInstance.onDidChangeState(state => {
				// TODO
			})
		);

		// Add the onDidChangeEnvironmentGrouping event handler.
		disposableStore.add(
			props.positronEnvironmentInstance.onDidChangeEnvironmentGrouping(() => {
				// For the moment, simply re-render everything.
				// setMarker(generateUuid());
			})
		);

		// Add the onDidChangeEnvironmentItems event handler.
		disposableStore.add(
			props.positronEnvironmentInstance.onDidChangeEnvironmentSorting(() => {
				// For the moment, simply re-render everything.
				// setMarker(generateUuid());
			})
		);

		// Add the onDidChangeEntries event handler.
		disposableStore.add(
			props.positronEnvironmentInstance.onDidChangeEntries(entries =>
				setEntries(entries)
			)
		);

		// Return the cleanup function that will dispose of the event handlers.
		return () => disposableStore.dispose();
	}, []);

	// Width useEffect hook.
	useEffect(() => {
		// Calculate the new details column width.
		const newDetailsColumnWidth = Math.max(
			props.width - nameColumnWidth,
			Math.trunc(props.width / 3)
		);

		// Adjust the column widths.
		setNameColumnWidth(props.width - newDetailsColumnWidth);
		setDetailsColumnWidth(newDetailsColumnWidth);

		// Set the type visibility.
		setTypeVisible(newDetailsColumnWidth > TYPE_VISIBILITY_THRESHOLD);
	}, [props.width]);

	// // Entries useEffect hook.
	// useEffect(() => {
	// 	/**
	// 	 * Helper to select the first entry, if there is one.
	// 	 */
	// 	const selectFirstEntry = () => {
	// 		if (entries.length) {
	// 			setSelectedId(entries[0].id);
	// 		}
	// 	};

	// 	// If there isn't selected entry, select the first entry. Otherwise, ensure that the
	// 	// selected entry is still exists in the entries. If it doesn't, select the first entry.
	// 	if (!selectedId) {
	// 		selectFirstEntry();
	// 	} else {
	// 		const selectedEntryIndex = entries.findIndex(entry => entry.id === selectedId);
	// 		if (selectedEntryIndex === -1) {
	// 			selectFirstEntry();
	// 		}
	// 	}
	// }, [entries]);

	/**
	 * Handles onKeyDown events.
	 * @param e A KeyboardEvent<HTMLDivElement> that describes a user interaction with the keyboard.
	 */
	const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		// Process the code.
		switch (e.code) {
			// Up arrow key.
			case 'ArrowUp': {
				// Eat the event.
				e.preventDefault();
				e.stopPropagation();

				const selectedEntryIndex = entries.findIndex(entry => entry.id === selectedId);
				if (selectedEntryIndex > 0) {
					setSelectedId(entries[selectedEntryIndex - 1].id);
				}
				break;
			}

			// Down arrow key.
			case 'ArrowDown': {
				// Eat the event.
				e.preventDefault();
				e.stopPropagation();

				const selectedEntryIndex = entries.findIndex(entry => entry.id === selectedId);
				if (selectedEntryIndex < entries.length - 1) {
					setSelectedId(entries[selectedEntryIndex + 1].id);
				}

				break;
			}

			// Left arrow key.
			case 'ArrowLeft': {
				// Eat the event.
				e.preventDefault();
				e.stopPropagation();

				const selectedEntryIndex = entries.findIndex(entry => entry.id === selectedId);
				const selectedEntry = entries[selectedEntryIndex];
				if (isEnvironmentVariableGroup(selectedEntry)) {
					if (selectedEntry.expanded) {
						props.positronEnvironmentInstance.collapseEnvironmentVariableGroup(
							selectedEntry.id
						);
					}
				} else if (isEnvironmentVariableItem(selectedEntry) && selectedEntry.hasChildren) {
					if (selectedEntry.expanded) {
						props.positronEnvironmentInstance.collapseEnvironmentVariableItem(
							selectedEntry.path
						);
					}
				}
				break;
			}

			// Right arrow key.
			case 'ArrowRight': {
				// Eat the event.
				e.preventDefault();
				e.stopPropagation();

				const selectedEntryIndex = entries.findIndex(entry => entry.id === selectedId);
				const selectedEntry = entries[selectedEntryIndex];
				if (isEnvironmentVariableGroup(selectedEntry)) {
					if (!selectedEntry.expanded) {
						props.positronEnvironmentInstance.expandEnvironmentVariableGroup(
							selectedEntry.id
						);
					}
				} else if (isEnvironmentVariableItem(selectedEntry) && selectedEntry.hasChildren) {
					if (!selectedEntry.expanded) {
						props.positronEnvironmentInstance.expandEnvironmentVariableItem(
							selectedEntry.path
						);
					}
				}
				break;
			}
		}
	};

	// /**
	//  * Handles onClick events.
	//  */
	// const handleClick = () => {
	// };

	/**
	 * startResizeNameColumn event handler.
	 */
	const startResizeNameColumnHandler = () => {
		setResizingColumn(true);
	};

	/**
	 * resizeNameColumn event handler.
	 * @param x The X delta.
	 */
	const resizeNameColumnHandler = (x: number) => {
		resizeNameColumn(x);
	};

	/**
	 * stopResizeNameColumn event handler.
	 * @param x The X delta.
	 */
	const stopResizeNameColumnHandler = (x: number) => {
		resizeNameColumn(x);
		setResizingColumn(false);
	};

	/**
	 * Resizes the name column.
	 * @param x The X delta.
	 */
	const resizeNameColumn = (x: number) => {
		// Calculate the new column widths.
		const newNameColumnWidth = Math.min(
			Math.max(nameColumnWidth + x, MINIMUM_NAME_COLUMN_WIDTH),
			Math.trunc(2 * props.width / 3)
		);
		const newDetailsColumnWidth = props.width - newNameColumnWidth;

		// Adjust the column widths.
		setNameColumnWidth(newNameColumnWidth);
		setDetailsColumnWidth(newDetailsColumnWidth);

		// Set the type visibility.
		setTypeVisible(newDetailsColumnWidth > TYPE_VISIBILITY_THRESHOLD);
	};

	/**
	 * Renders the entries.
	 * @returns The rendered entries.
	 */
	const renderEntries = () => {
		return entries.map(entry => {
			if (isEnvironmentVariableGroup(entry)) {
				return (
					<EnvironmentVariableGroup
						key={entry.id}
						environmentVariableGroup={entry}
						focused={focused}
						selected={selectedId === entry.id}
						positronEnvironmentInstance={props.positronEnvironmentInstance}
					/>
				);
			} else if (isEnvironmentVariableItem(entry)) {
				return (
					<EnvironmentVariableItem
						key={entry.id}
						nameColumnWidth={nameColumnWidth}
						detailsColumnWidth={detailsColumnWidth - 1}
						typeVisible={typeVisible}
						environmentVariableItem={entry}
						focused={focused}
						selected={selectedId === entry.id}
						onStartResizeNameColumn={startResizeNameColumnHandler}
						onResizeNameColumn={resizeNameColumnHandler}
						onStopResizeNameColumn={stopResizeNameColumnHandler}
						positronEnvironmentInstance={props.positronEnvironmentInstance}
					/>
				);
			} else {
				// It's a bug to get here.
				return null;
			}
		});
	};

	// Create the class names.
	const classNames = positronClassNames(
		'environment-instance',
		{ 'resizing': resizingColumn }
	);

	const Row = ({ index, style }: ListChildComponentProps<EnvironmentEntry>) => {
		const entry = entries[index];
		if (isEnvironmentVariableGroup(entry)) {
			return (
				<div style={style}>
					<EnvironmentVariableGroup
						key={entry.id}
						environmentVariableGroup={entry}
						focused={focused}
						selected={selectedId === entry.id}
						positronEnvironmentInstance={props.positronEnvironmentInstance}
					/>
				</div>
			);
		} else if (isEnvironmentVariableItem(entry)) {
			return (
				<div style={style}>
					<EnvironmentVariableItem
						key={entry.id}
						nameColumnWidth={nameColumnWidth}
						detailsColumnWidth={detailsColumnWidth - 1}
						typeVisible={typeVisible}
						environmentVariableItem={entry}
						focused={focused}
						selected={selectedId === entry.id}
						onStartResizeNameColumn={startResizeNameColumnHandler}
						onResizeNameColumn={resizeNameColumnHandler}
						onStopResizeNameColumn={stopResizeNameColumnHandler}
						positronEnvironmentInstance={props.positronEnvironmentInstance}
					/>
				</div>
			);
		} else {
			// It's a bug to get here.
			return null;
		}

	};

	// Render.
	return (
		<div
			ref={ref}
			className={classNames}
			tabIndex={0}
			hidden={props.hidden}
			onKeyDown={handleKeyDown}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
		>
			<List
				width={props.width}
				height={props.height}
				itemCount={entries.length}
				itemSize={26}
			>
				{Row}
			</List>
		</div>
	);
};
