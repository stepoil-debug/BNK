export const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

export function money(value: number | null | undefined): string {
  return currencyFormatter.format(Number(value ?? 0));
}

export function parseCurrencyToNumber(value: string): number {
  const cleaned = value
    .replace(/R\$\s?/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  return Number(cleaned || 0);
}

export function formatDateBR(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString('pt-BR');
}
