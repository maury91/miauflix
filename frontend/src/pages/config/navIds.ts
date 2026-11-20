/** The navigation IDs of the configuration pages, shared by the pages and their parts. */

/** A configuration value's control. */
export const configFieldNavId = (key: string) => `config:${key}`;

/** A service group and its controls. */
export const serviceGroupNav = (groupName: string) => {
  const group = `config-group:${groupName}`;
  return {
    group,
    optional: `${group}:optional`,
    advanced: `${group}:advanced`,
    actions: `${group}:actions`,
    save: `${group}:save`,
    test: `${group}:test`,
  };
};
