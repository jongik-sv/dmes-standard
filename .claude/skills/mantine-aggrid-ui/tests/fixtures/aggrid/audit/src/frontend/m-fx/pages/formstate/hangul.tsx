export default function 화면() {
  const [폼Form, set폼Form] = useState({ a: 1 });
  const [검색Form, set검색Form] = useState({ a: 1 });
  const 열 = useMemo(() => [폼Form], [폼Form]);
  const columns = useMemo(() => [검색Form], [검색Form, 한글]);
  return <Input onChange={(e) => set폼Form(e)} />;
}
