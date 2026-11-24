/**
 * Normaliza texto para busca e correspondência local sem acentos nem distinção de maiúsculas.
 */
export function normalizeTextForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
