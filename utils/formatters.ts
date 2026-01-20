
export const getSafeArray = (obj: any, key: string): any[] => {
  if (!obj) return [];
  const val = obj[key];
  return Array.isArray(val) ? val : [];
};

export const getSafeObject = (obj: any, key: string, defaultVal: any = {}) => {
  if (!obj || !obj[key]) return defaultVal;
  return obj[key];
};

// Clean raw review text by removing common Amazon return reason prefixes
export const cleanReviewText = (text: string): string => {
  return text.replace(/^(UNWANTED_ITEM|ORDERED_WRONG_ITEM)[：: -]\s*/i, '').trim();
};

export const formatPercent = (val: number | undefined | null) => `${((val || 0) * 100).toFixed(1)}%`;

export const formatNumber = (val: number | undefined | null) => new Intl.NumberFormat('en-US').format(val || 0);
