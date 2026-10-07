// 위젯 폴더(widgets): setInterval, 표시 확인 없음
export function Clock() {
  useEffect(() => {
    const id = setInterval(() => tick(), 1000);
    return () => clearInterval(id);
  }, []);
  return null;
}
