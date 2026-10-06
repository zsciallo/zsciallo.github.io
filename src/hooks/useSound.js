import { useEffect, useState } from 'preact/hooks';
import { setSoundEnabled, soundEnabled, subscribeSound } from '../lib/sound';

/** [enabled, toggle] for the global sound setting, kept in sync across every
 *  component and tab that shows it. */
export function useSound() {
  const [on, setOn] = useState(soundEnabled);
  useEffect(() => subscribeSound(setOn), []);
  return [on, () => setSoundEnabled(!soundEnabled())];
}
