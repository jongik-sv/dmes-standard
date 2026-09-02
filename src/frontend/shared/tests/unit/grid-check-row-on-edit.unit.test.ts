import { describe, expect, it, vi } from "vitest";
import { selectEditedRow } from "../../src/components/grid/AgDataGrid";

describe("AgDataGrid checkRowOnEdit", () => {
  it("selects an unselected editable row when the option is enabled", () => {
    const setSelected = vi.fn();

    selectEditedRow(true, true, {
      isSelected: () => false,
      setSelected,
    });

    expect(setSelected).toHaveBeenCalledOnce();
    expect(setSelected).toHaveBeenCalledWith(true);
  });

  it("does not change selection when the option is disabled or the row is already selected", () => {
    const setSelected = vi.fn();

    selectEditedRow(false, true, {
      isSelected: () => false,
      setSelected,
    });
    selectEditedRow(true, true, {
      isSelected: () => true,
      setSelected,
    });

    expect(setSelected).not.toHaveBeenCalled();
  });
});
