export function fmt(n: number | undefined | null): string {
  const val = typeof n === "number" && !isNaN(n) ? n : Number(n) || 0;
  return `ETB ${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDecimal(n: number | undefined | null): string {
  const val = typeof n === "number" && !isNaN(n) ? n : Number(n) || 0;
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

