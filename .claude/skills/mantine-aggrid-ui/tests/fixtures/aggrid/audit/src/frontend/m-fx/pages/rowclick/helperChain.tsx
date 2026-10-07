export default function Page() {
  const { onSnapshotChange } = useTabPage();
  const a = () => { onSnapshotChange(1); };
  const b = () => { a(); };
  const c = () => { b(); };
  const d = useCallback(() => { c(); }, []);
  const onRowSelectedHandler = React.useCallback<() => void>(() => { d(); }, [d]);
  return null;
}
