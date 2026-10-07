// audit-exceptions.json: P-R14 info 로 올라 있는 파일
export function WidgetFrame() {
  useEffect(() => { const id = setInterval(refresh, 1000); return () => clearInterval(id); }, []);
  return null;
}
