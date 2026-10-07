export default function Page() {
  const { onSnapshotChange } = useTabPage();
  const handleSearch = () => { onSnapshotChange({ q: filters }); };
  const selectedLabel = useMemo(() => 1, []);
  async function pickWinner(r: Row) { onSnapshotChange({ r }); }
  return <Grid />;
}
