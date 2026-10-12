import { setSession } from '@store/slices/auth';
import { describe, expect, it } from 'vitest';

import { homeNavigationActions, homeNavigationSlice } from './homeNavigation';

describe('home navigation state', () => {
  it('keeps row selection when changing active categories', () => {
    let state = homeNavigationSlice.reducer(undefined, { type: '@@test/init' });
    state = homeNavigationSlice.reducer(
      state,
      homeNavigationActions.setCategorySelection({ slug: 'popular', index: 4 })
    );
    state = homeNavigationSlice.reducer(state, homeNavigationActions.setActiveCategory(2));
    expect(state).toMatchObject({
      activeCategory: 2,
      selectedByCategory: { popular: 4 },
    });
  });

  it('keeps category and selection indices nonnegative', () => {
    let state = homeNavigationSlice.reducer(undefined, homeNavigationActions.setActiveCategory(-2));
    state = homeNavigationSlice.reducer(
      state,
      homeNavigationActions.setCategorySelection({ slug: 'popular', index: -3 })
    );
    expect(state.activeCategory).toBe(0);
    expect(state.selectedByCategory.popular).toBe(0);
  });

  it('clears navigation state when the active session changes', () => {
    const selected = homeNavigationSlice.reducer(
      undefined,
      homeNavigationActions.setCategorySelection({ slug: 'popular', index: 4 })
    );
    const next = homeNavigationSlice.reducer(selected, setSession('another-session'));
    expect(next.selectedByCategory).toEqual({});
    expect(next.activeCategory).toBe(0);
  });
});
