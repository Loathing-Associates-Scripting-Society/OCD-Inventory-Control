import {Button, ButtonGroup, Classes, UL} from '@blueprintjs/core';
import {Classes as Popover2Classes, Popover2} from '@blueprintjs/popover2';
import {
  CleanupRule,
  CleanupRuleset,
  InventoryState,
  isInventoryLocation,
  ItemInfo,
  ReadonlyCleanupRuleset,
  ReadonlyInventoryState,
} from '@philter/common';
import classNames from 'classnames';
import React, {memo, useCallback, useMemo, useState} from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import {areEqual, FixedSizeList} from 'react-window';
import {CleanupRulePicker} from './CleanupRulePicker';
import {NumericInputLite} from './NumericInputLite';
import './TableItemCleanup.css';

/* eslint-disable react/no-unescaped-entities */

/**
 * Adds a zero-width space (ZWSP) after each comma (`,`) in the given string.
 * This allows the `overflow-wrap: break-word` CSS rule to break long numbers
 * across multiple lines.
 */
const addZwspAfterComma = (str: string) => str.replace(/,/g, ',\u200B');

/**
 * Launches the in-game item description page in a popup window.
 * @param descid Item descid
 */
const itemDescriptionPopup = (descid: string) => {
  window
    .open(`/desc_item.php?whichitem=${descid}`, 'name', 'height=200,width=214')
    ?.focus();
};

/**
 * Tag for items whose mall price is at minimum value.
 *
 * This is a lightweight replica of Blueprint.js's `<Tag>` component.
 */
const MinMallPriceTag = () => (
  <span
    className={classNames(
      Classes.TAG,
      Classes.MINIMAL,
      Classes.INTENT_PRIMARY,
      'TableItemCleanup__ColumnMallPrice--minimum'
    )}
    title="Is at minimum mall price"
  >
    min
  </span>
);

export type RuleChangeHandler = (
  itemId: number,
  newRuleOrReducer: React.SetStateAction<CleanupRule | null>
) => void;

interface TableItemCleanupRowProps extends React.ComponentProps<'div'> {
  inventory: ReadonlyInventoryState;
  item: Readonly<ItemInfo>;
  onRuleChange: RuleChangeHandler;
  rule: Readonly<CleanupRule | null>;
}

/**
 * Row component for `<TableItemCleanup/>`.
 */
// eslint-disable-next-line prefer-arrow-callback
const TableItemCleanupRow = memo(function TableItemCleanupRow({
  className,
  inventory,
  item,
  onRuleChange,
  rule,
  ...restProps
}: TableItemCleanupRowProps) {
  return (
    <div className={`TableItemCleanup__Row ${className || ''}`} {...restProps}>
      <div className="TableItemCleanup__Cell TableItemCleanup__ColumnItemName">
        <a
          className={classNames(
            Classes.BUTTON,
            Classes.MINIMAL,
            'TableItemCleanup__ItemImageLink'
          )}
          onClick={() => itemDescriptionPopup(item.descid)}
          tabIndex={0}
          title="View item description"
        >
          <img
            className="TableItemCleanup__ItemImage"
            alt={item.name}
            src={`/images/itemimages/${item.image}`}
          />
        </a>
        <a
          className={classNames(
            Classes.BUTTON,
            Classes.MINIMAL,
            'TableItemCleanup__ItemNameLink'
          )}
          href={`https://kol.coldfront.net/thekolwiki/index.php/Special:Search?search=${item.name}&go=Go`}
          rel="noopener noreferrer"
          target="_blank"
          tabIndex={0}
          title="Visit KoL wiki page"
        >
          <span dangerouslySetInnerHTML={{__html: item.name}}></span>
          {inventory.inventory[item.id] > 0 && (
            <>
              {' '}
              <i>({inventory.inventory[item.id]})</i>
            </>
          )}
        </a>
      </div>
      <div className="TableItemCleanup__Cell TableItemCleanup__ColumnClosetAmount">
        {inventory.closet[item.id] || 0}
      </div>
      <div className="TableItemCleanup__Cell TableItemCleanup__ColumnStorageAmount">
        {inventory.storage[item.id] || 0}
      </div>
      <div className="TableItemCleanup__Cell TableItemCleanup__ColumnDisplayCaseAmount">
        {inventory.displayCase[item.id] || 0}
      </div>
      <div className="TableItemCleanup__Cell TableItemCleanup__ColumnMallPrice">
        {item.mallPrice && addZwspAfterComma(item.mallPrice.toLocaleString())}
        {item.mallPrice !== null && item.isMallPriceAtMinimum && (
          <MinMallPriceTag />
        )}
      </div>
      <div className="TableItemCleanup__Cell TableItemCleanup__ColumnKeepAmount">
        <NumericInputLite
          className="TableItemCleanup__InputKeepAmount"
          disabled={!rule || rule.action === 'KEEP'}
          fill
          min={0}
          onChange={event => {
            const value = Number(event.target.value);
            if (Number.isInteger(value)) {
              onRuleChange(
                item.id,
                rule => rule && {...rule, keepAmount: value}
              );
            }
          }}
          value={rule?.keepAmount || 0}
        />
      </div>
      <div className="TableItemCleanup__Cell TableItemCleanup__ColumnAction">
        <CleanupRulePicker
          item={item}
          onChange={useCallback(
            newRuleOrReducer => onRuleChange(item.id, newRuleOrReducer),
            [item.id, onRuleChange]
          )}
          rule={rule}
        />
      </div>
    </div>
  );
},
areEqual);

interface TableItemCleanupRowData {
  inventory: ReadonlyInventoryState;
  items: readonly Readonly<ItemInfo>[];
  cleanupRules: ReadonlyCleanupRuleset;
  onRuleChange: RuleChangeHandler;
}

/**
 * Callback that returns the item key for react-window.
 */
const itemKeyCallback = (index: number, data: TableItemCleanupRowData) =>
  data.items[index].id;

// This function must be a stable value for React to properly use memoization.
// Since the data prop changes whenever the cleanup ruleset is modified, this
// component itself does not benefit from `React.memo()`. However, the
// underlying component _does_ benefit from `React.memo()`.
const TableItemCleanupRowWrapper = ({
  data: {cleanupRules, onRuleChange, inventory, items},
  index,
  style,
}: {
  data: TableItemCleanupRowData;
  index: number;
  style?: React.CSSProperties;
  isScrolling?: boolean;
}) => (
  <TableItemCleanupRow
    inventory={inventory}
    item={items[index]}
    onRuleChange={onRuleChange}
    rule={cleanupRules[items[index].id]}
    style={style}
  />
);

/**
 * Sets the `tabIndex` of a HTML element to -1.
 * This enables keyboard-based scrolling on the react-window container.
 * (Page Up/Down, Arrow Up/Down, Home/End)
 */
const setTabIndexOnRefElement = (refElement: HTMLElement | null) => {
  if (refElement) {
    refElement.tabIndex = -1;
  }
};

interface TableItemCleanupPropsBase {
  /**
   * Cleanup ruleset.
   * If an item in `items` does not have a rule here, a default rule ("UNKN") is
   * used.
   */
  cleanupRules: ReadonlyCleanupRuleset;
  /**
   * Whether the Reset button is disabled.
   */
  disableReset?: boolean;
  /**
   * Whether the Save button is disabled.
   */
  disableSave?: boolean;
  /** Inventory state. Used to show item quantities for each row. */
  inventory: ReadonlyInventoryState;
  /** Items to display in the table. */
  items: readonly Readonly<ItemInfo>[];
  /**
   * Callback that is called when a rule is modified.
   * The argument is a function that takes the previous ruleset as argument and
   * returns a new ruleset.
   *
   * This implementation is necessary to prevent the entire table from being
   * re-rendered (causing lag) on every input change.
   */
  onChange?: (
    updater: (prevCleanupRules: CleanupRuleset) => CleanupRuleset
  ) => void;
  /**
   * Called when the user clicks the Reset button.
   */
  onReset?: () => void;
  /**
   * Called when the user edits a rule for an item.
   * If not given, the default implementation calls `onChange` instead.
   */
  onRuleChange?: RuleChangeHandler;
  /**
   * Called when the user clicks the Save button.
   */
  onSave?: () => void;
}

type Sort = keyof InventoryState | 'name' | 'price';

interface TableItemCleanupProps
  extends TableItemCleanupPropsBase,
    Omit<React.ComponentProps<'div'>, keyof TableItemCleanupPropsBase> {}

// eslint-disable-next-line prefer-arrow-callback
export const TableItemCleanup = memo(function TableItemCleanup({
  // className is already provided by React.ComponentProps<'div'>
  // eslint-disable-next-line react/prop-types
  className,
  cleanupRules,
  disableReset,
  disableSave,
  inventory,
  items,
  onChange,
  onReset,
  onRuleChange,
  onSave,
  ...restProps
}: TableItemCleanupProps) {
  const defaultRuleChangeHandler = useCallback(
    (
      itemId: number,
      newRuleOrReducer: React.SetStateAction<CleanupRule | null>
    ) =>
      onChange?.(prevCleanupRules => {
        const newRule =
          typeof newRuleOrReducer === 'function'
            ? newRuleOrReducer(prevCleanupRules[itemId] || null)
            : newRuleOrReducer;
        if (newRule) return {...prevCleanupRules, [itemId]: newRule};
        else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const {[itemId]: _removed, ...restCleanupRules} = prevCleanupRules;
          return restCleanupRules;
        }
      }),
    [onChange]
  );

  const [sort, setSort] = useState<Sort>('name');
  const [sortAscending, setSortAscending] = useState(true);

  const sortedItems = useMemo<readonly Readonly<ItemInfo>[]>(() => {
    const itemsCopy = [...items];

    if (isInventoryLocation(sort)) {
      itemsCopy.sort((a, b) => inventory[sort][a.id] - inventory[sort][b.id]);
    } else if (sort === 'name') {
      itemsCopy.sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0
      );
    } else if (sort === 'price') {
      itemsCopy.sort((a, b) => (a.mallPrice || 0) - (b.mallPrice || 0));
    }

    if (!sortAscending) {
      itemsCopy.reverse();
    }

    return itemsCopy;
  }, [items, sort, sortAscending, inventory]);

  const sortHeader = useCallback(
    (key: Sort) => {
      setSort(s => {
        if (key === s) {
          setSortAscending(value => !value);
        }

        return key;
      });
    },
    [setSort, setSortAscending]
  );

  const itemData = useMemo<TableItemCleanupRowData>(
    () => ({
      inventory,
      items: sortedItems,
      cleanupRules,
      onRuleChange: onRuleChange || defaultRuleChangeHandler,
    }),
    [
      defaultRuleChangeHandler,
      inventory,
      sortedItems,
      cleanupRules,
      onRuleChange,
    ]
  );

  const editorButtons = useMemo(
    () => (
      <ButtonGroup className="TableItemCleanup__EditorButtons">
        <Button
          disabled={disableSave}
          icon="saved"
          onClick={onSave}
          text="Save all"
        />
        <Button
          disabled={disableReset}
          icon="reset"
          onClick={onReset}
          text="Discard changes"
        />
        <Popover2
          className="TableItemCleanup__PopperFix"
          popoverClassName={Popover2Classes.POPOVER2_CONTENT_SIZING}
          content={
            <p>
              Select an action for each item. These actions will tell Philter
              how to process each item:
              <UL>
                <li>
                  Philter will warn you about uncategorized items, but will not
                  touch them.
                </li>
                <li>
                  "Mall sale" will use the lowest mall price <i>at cleanup</i>,
                  but never below the "min price".
                </li>
                <li>"Send as gift" actually uses Kmail, not the gift shop.</li>
                <li>
                  "Crafting" can use up other ingredients needed for the recipe,
                  even if you marked them as "Keep all".
                </li>
                <li>
                  "Pulverize" will send items to Smashbot if you can't use
                  Pulverize or Malus, but only in aftercore.
                </li>
                <li>
                  "Reminder" will show a reminder message during cleanup, but
                  won't touch the item.
                </li>
              </UL>
            </p>
          }
        >
          <Button icon="help" text="Help" />
        </Popover2>
      </ButtonGroup>
    ),
    [disableReset, disableSave, onReset, onSave]
  );

  return (
    <div className={classNames('TableItemCleanup', className)} {...restProps}>
      {editorButtons}
      <div className="TableItemCleanup__TableWrapper">
        <AutoSizer disableWidth>
          {({height: measuredHeight}) => (
            <div className="TableItemCleanup__Inner">
              <div className="TableItemCleanup__HeaderRow">
                <div
                  className="TableItemCleanup__HeaderCell TableItemCleanup__ColumnItemName"
                  onClick={() => sortHeader('name')}
                >
                  Item (Amount)
                </div>
                <div
                  className="TableItemCleanup__HeaderCell TableItemCleanup__ColumnClosetAmount"
                  onClick={() => sortHeader('closet')}
                >
                  <abbr title="Amount in Closet">C</abbr>
                </div>
                <div
                  className="TableItemCleanup__HeaderCell TableItemCleanup__ColumnStorageAmount"
                  onClick={() => sortHeader('storage')}
                >
                  <abbr title="Amount in Storage">S</abbr>
                </div>
                <div
                  className="TableItemCleanup__HeaderCell TableItemCleanup__ColumnDisplayCaseAmount"
                  onClick={() => sortHeader('displayCase')}
                >
                  <abbr title="Amount in Display Case">D</abbr>
                </div>
                <div
                  className="TableItemCleanup__HeaderCell TableItemCleanup__ColumnMallPrice"
                  onClick={() => sortHeader('price')}
                >
                  <abbr title="5th lowest mall price">Price</abbr>
                </div>
                <div className="TableItemCleanup__HeaderCell TableItemCleanup__ColumnKeepAmount">
                  Keep
                </div>
                <div className="TableItemCleanup__HeaderCell TableItemCleanup__ColumnAction">
                  Action
                </div>
              </div>
              <FixedSizeList
                className="TableItemCleanup__Body"
                height={measuredHeight}
                itemCount={items.length}
                itemData={itemData}
                itemKey={itemKeyCallback}
                itemSize={60}
                outerRef={setTabIndexOnRefElement}
                overscanCount={15}
                width="100%"
              >
                {TableItemCleanupRowWrapper}
              </FixedSizeList>
            </div>
          )}
        </AutoSizer>
      </div>
      {editorButtons}
    </div>
  );
});
