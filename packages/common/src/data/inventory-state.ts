/** Represents the inventory state of the player. */
export interface InventoryState {
  /** Amount of each item in closet */
  closet: {[itemId: number]: number};
  /** Amount of each item in display case */
  displayCase: {[itemId: number]: number};
  /** Amount of each item in inventory */
  inventory: {[itemId: number]: number};
  /** Amount of each item in storage */
  storage: {[itemId: number]: number};
}

/** Read-only variant of `InventoryState` */
export type ReadonlyInventoryState = {
  readonly [P in keyof InventoryState]: Readonly<InventoryState[P]>;
};

export function isInventoryLocation(
  name: string
): name is keyof InventoryState {
  return ['closet', 'displayCase', 'inventory', 'storage'].includes(name);
}
