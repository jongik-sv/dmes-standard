export default function Page() {
  function chooseDetail(row: Row) {
    props.onSnapshotChange({ id: row.id });
  }
  return null;
}
