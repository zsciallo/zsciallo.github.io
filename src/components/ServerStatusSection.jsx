import { ServerIPCard } from './ServerIPCard';
import { CountdownTimer } from './CountdownTimer';

export function ServerStatusSection({ config, status }) {
  const isOffline = !status.loading && !status.online;
  if (isOffline && config.launchDate) {
    return <CountdownTimer targetDate={config.launchDate} subMessage={config.downSubMessage} />;
  }
  if (!isOffline) {
    return <ServerIPCard ip={config.serverIP} />;
  }
  return null;
}
