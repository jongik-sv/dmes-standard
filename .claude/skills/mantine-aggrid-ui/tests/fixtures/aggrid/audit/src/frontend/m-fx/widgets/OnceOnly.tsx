export function OnceOnly() {
  useEffect(() => { setTimeout(done, 10); setTimeout(() => done(), 20); obj.setInterval(x, 1); }, []);
  const done = () => {};
  return null;
}
