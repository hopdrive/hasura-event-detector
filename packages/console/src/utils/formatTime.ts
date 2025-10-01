export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInHours = diffInMs / (1000 * 60 * 60);

  // If less than 24 hours ago, show relative time
  if (diffInHours < 24) {
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHoursRounded = Math.floor(diffInHours);

    if (diffInMinutes < 1) {
      return 'just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else {
      return `${diffInHoursRounded}h ago`;
    }
  }

  // If more than 24 hours ago, show formatted date with day of week
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };

  return date.toLocaleDateString('en-US', options);
};