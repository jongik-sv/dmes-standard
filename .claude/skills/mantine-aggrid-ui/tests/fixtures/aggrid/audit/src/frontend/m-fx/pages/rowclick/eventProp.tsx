export default function Page() {
  const { onSnapshotChange } = useTabPage();
  return <Grid onRowClicked={(e) => { onSnapshotChange({ r: e.data }); }} />;
}
