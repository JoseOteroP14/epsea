/**
 * Matches how ListQuestion / DependentListQuestion persist the answer:
 * `String(option.value ?? option.id)`.
 */
export function questionOptionSelectionKey(option: {
  id?: unknown;
  value?: unknown;
}): string {
  const o = option as { value?: unknown; id?: unknown };
  if (o.value != null && o.value !== "") return String(o.value);
  if (o.id != null && o.id !== "") return String(o.id);
  return "";
}

/**
 * Find the option row for a stored answer (value or id, string/number).
 */
export function findOptionMatchingStoredValue(
  items: readonly any[] | undefined,
  storedValue: unknown,
): any | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  if (storedValue === undefined || storedValue === null || storedValue === "") {
    return undefined;
  }

  const key = String(storedValue);

  const byUiKey = items.find((o) => questionOptionSelectionKey(o) === key);
  if (byUiKey) return byUiKey;

  const num = Number(storedValue);
  const numericCoherent =
    typeof storedValue === "number"
      ? true
      : typeof storedValue === "string" &&
        storedValue.trim() !== "" &&
        Number.isFinite(num) &&
        String(num) === storedValue.trim();

  return items.find(
    (o: any) =>
      o?.id === storedValue ||
      o?.id === num ||
      String(o?.id) === key ||
      o?.value === storedValue ||
      (o?.value != null && String(o.value) === key) ||
      (numericCoherent &&
        o?.value != null &&
        typeof o.value !== "boolean" &&
        Number(o.value) === num) ||
      o?.name === storedValue,
  );
}
