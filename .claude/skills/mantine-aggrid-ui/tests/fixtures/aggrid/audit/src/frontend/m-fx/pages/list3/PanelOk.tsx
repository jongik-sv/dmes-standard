import { searchDrops } from "./api";
export function PanelOk() {
  searchDrops({});
  return <GridPanel />;
}
