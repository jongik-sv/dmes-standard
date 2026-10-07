"use client";
// P-R8: 행 클릭·선택 처리가 onSnapshotChange 를 부른다
import { useCallback } from "react";
export default function Page() {
  const { onSnapshotChange } = useTabPage();
  const publish = (row: Row) => { onSnapshotChange({ selected: row.id }); };
  const handleRowClick = useCallback((row: Row) => { publish(row); }, [publish]);
  const other = () => { onSnapshotChange({ q: 1 }); };
  return <AgDataGrid rows={rows} onRowClick={handleRowClick} />;
}
