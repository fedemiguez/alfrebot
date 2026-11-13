"use client";

export type CategoryChip = {
  id: string;
  label: string;
};

/**
 * Chips de categoría (touch ≥48px). Cliente: el padre filtra el catálogo.
 */
export function StoreCategoryChips({
  chips,
  activeId,
  onSelect,
}: {
  chips: CategoryChip[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (chips.length <= 1) return null;

  return (
    <div
      className="store-category-chips"
      role="tablist"
      aria-label="Categorías"
    >
      {chips.map((chip) => {
        const active = chip.id === activeId;
        return (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`store-category-chip${active ? " is-active" : ""}`}
            onClick={() => onSelect(chip.id)}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
