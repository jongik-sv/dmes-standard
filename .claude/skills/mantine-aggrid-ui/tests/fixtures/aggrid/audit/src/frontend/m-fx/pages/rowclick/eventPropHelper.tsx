export default function Page() {
  const { onSnapshotChange } = useTabPage();
  const remember = async (v: string): Promise<void> => { onSnapshotChange({ v }); };
  return <Grid onSelectionChanged={(e) => remember(e.id)} />;
}
