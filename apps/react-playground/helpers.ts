export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function formatDate(date: Date): string {
  if (!(date instanceof Date)) {
    console.log(date);
    date = new Date(date);
    console.log(date);
  }
  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = String(date.getDate()).padStart(2, '0');
  const monthName = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();

  return `${dayName}, ${dayNum} ${monthName}, ${year}`;
}
