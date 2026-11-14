/** Ids linking each tab to its panel: `aria-controls` one way, `aria-labelledby` the other. */
export const tabId = (tabsId: string, id: string) => `${tabsId}-tab-${id}`;
export const panelId = (tabsId: string, id: string) => `${tabsId}-panel-${id}`;
