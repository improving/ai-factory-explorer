// The tabs of the inspector. The first one is the default, and the URL writes a tab only when it is not the first.
export const TABS = [
  ['specs', 'Specs'],
  ['signals', 'Signals'],
  ['learn', 'Learn'],
  ['owner', 'Owner/Tool'],
  ['lifecycle', 'Lifecycle'],
] as const
export type TabId = (typeof TABS)[number][0]
export const TAB_IDS: TabId[] = TABS.map(([id]) => id)

// The tabs of a part: the Lifecycle tab needs a host, because it has no content for any other part.
export const tabIdsFor = (host: boolean): TabId[] => (host ? TAB_IDS : TAB_IDS.filter((id) => id !== 'lifecycle'))
