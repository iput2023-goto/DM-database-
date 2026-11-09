export function getCivilizationColor(civil: string | null | undefined): {
  bg: string;
  text: string;
  border: string;
  badge: string;
} {
  if (!civil) {
    return {
      bg: 'bg-slate-800',
      text: 'text-slate-300',
      border: 'border-slate-700',
      badge: 'bg-slate-700 text-slate-200'
    };
  }

  const isMulti = civil.includes('/') || civil.length > 2;

  if (isMulti) {
    return {
      bg: 'bg-amber-950/40',
      text: 'text-amber-300',
      border: 'border-amber-600/50',
      badge: 'bg-gradient-to-r from-amber-600 to-yellow-500 text-white shadow-sm'
    };
  }

  if (civil.includes('火')) {
    return {
      bg: 'bg-red-950/40',
      text: 'text-red-400',
      border: 'border-red-600/50',
      badge: 'bg-red-600 text-white'
    };
  }
  if (civil.includes('水')) {
    return {
      bg: 'bg-sky-950/40',
      text: 'text-sky-400',
      border: 'border-sky-600/50',
      badge: 'bg-sky-600 text-white'
    };
  }
  if (civil.includes('自然')) {
    return {
      bg: 'bg-emerald-950/40',
      text: 'text-emerald-400',
      border: 'border-emerald-600/50',
      badge: 'bg-emerald-600 text-white'
    };
  }
  if (civil.includes('光')) {
    return {
      bg: 'bg-yellow-950/40',
      text: 'text-yellow-400',
      border: 'border-yellow-600/50',
      badge: 'bg-yellow-500 text-slate-900 font-semibold'
    };
  }
  if (civil.includes('闇')) {
    return {
      bg: 'bg-purple-950/40',
      text: 'text-purple-400',
      border: 'border-purple-600/50',
      badge: 'bg-purple-800 text-purple-100'
    };
  }
  if (civil.includes('ゼロ') || civil.includes('無色')) {
    return {
      bg: 'bg-slate-900',
      text: 'text-slate-400',
      border: 'border-slate-600',
      badge: 'bg-slate-600 text-white'
    };
  }

  return {
    bg: 'bg-slate-800',
    text: 'text-slate-300',
    border: 'border-slate-700',
    badge: 'bg-slate-700 text-slate-200'
  };
}

