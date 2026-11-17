import { useEffect, useState } from 'preact/hooks';
import { getTheme, subscribeTheme, toggleTheme } from '../lib/theme';

/** [theme, toggle] for the site theme ('dark' or 'light'), kept in sync across
 *  every component and tab that shows it. */
export function useTheme() {
  const [theme, setTheme] = useState(getTheme);
  useEffect(() => subscribeTheme(setTheme), []);
  return [theme, toggleTheme];
}
