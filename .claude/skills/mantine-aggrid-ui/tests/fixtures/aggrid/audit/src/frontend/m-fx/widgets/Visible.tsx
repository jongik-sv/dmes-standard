export function Visible() {
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') tick(); }, 1000);
    return () => clearInterval(id);
  }, []);
  return null;
}
