function Screen() {
  const [x, setX] = useState<SomeForm>({});
  return <Input onChange={(e) => setX(e)} />;
}
export default Screen;
