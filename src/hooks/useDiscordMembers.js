import { useState, useEffect } from 'preact/hooks';

function inviteCode(discordUrl) {
  if (!discordUrl) return null;
  const match = discordUrl.match(/(?:discord\.gg|discord\.com\/invite)\/([^/?#]+)/);
  return match ? match[1] : null;
}

export function useDiscordMembers(discordUrl) {
  const [members, setMembers] = useState(null);

  useEffect(() => {
    const code = inviteCode(discordUrl);
    if (!code) return;

    fetch(`https://discord.com/api/v10/invites/${code}?with_counts=true`)
      .then(r => r.json())
      .then(data => {
        if (typeof data.approximate_member_count === 'number') {
          setMembers(data.approximate_member_count);
        }
      })
      .catch(() => {});
  }, [discordUrl]);

  return members;
}
