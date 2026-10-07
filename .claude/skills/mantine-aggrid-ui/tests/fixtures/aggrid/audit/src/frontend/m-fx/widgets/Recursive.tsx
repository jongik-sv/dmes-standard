export function Recursive() {
  function poll() {
    load().then(() => { setTimeout(poll, 5000); });
  }
  useEffect(() => { setTimeout(poll, 100); }, []);
  const again = async () => { await x(); setTimeout(again, 10); };
  setTimeout(again, 1);
  setTimeout(() => once(), 10);
  setTimeout(once, 10);
  return null;
}
