import { useState, useEffect } from 'preact/hooks';

function calcTime(targetDate) {
  const [y, m, d] = targetDate.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const diff = target - Date.now();
  if (diff <= 0) return { launched: true };
  return {
    launched: false,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    mins: Math.floor((diff % 3600000) / 60000),
    secs: Math.floor((diff % 60000) / 1000),
  };
}

export function useCountdown(targetDate) {
  const [time, setTime] = useState(() => calcTime(targetDate));

  useEffect(() => {
    const id = setInterval(() => setTime(calcTime(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return time;
}
