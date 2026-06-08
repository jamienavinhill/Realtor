export function cn(...classes: (string | undefined | null | boolean | { [key: string]: boolean })[]) {
  return classes
    .flatMap((c) => {
      if (!c) return [];
      if (typeof c === 'string') return c.split(' ');
      if (typeof c === 'object') {
        return Object.entries(c)
          .filter(([_, value]) => !!value)
          .map(([key]) => key);
      }
      return [];
    })
    .filter(Boolean)
    .join(' ');
}
