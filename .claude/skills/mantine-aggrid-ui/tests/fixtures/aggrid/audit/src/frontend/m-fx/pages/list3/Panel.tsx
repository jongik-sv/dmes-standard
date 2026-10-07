import { searchBoards } from "./api";
export function Panel() {
  searchBoards({});
  return <GridPanel />;
}
