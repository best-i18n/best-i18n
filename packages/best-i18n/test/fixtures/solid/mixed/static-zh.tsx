
export function Words() { return `你好`; }
export function Rich(props) { return <>{`阅读`}<a href={props.href}>{`文档`}</a>{`。`}</>; }
export function Page(props) {
  const title = () => `你好`;
  return <section><h1>{title()}</h1><span>{((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${props.count} items` : `One item`)(props.count)}</span><Rich href="/docs" /></section>;
}

export function Stored() { const content = `你好`; return content; }

export function Repeated(props) {
  return <div>{<>{`阅读`}<a href={props.href}>{`文档`}</a>{`。`}</>}{<>{`阅读`}<a href={props.href}>{`文档`}</a>{`。`}</>}</div>;
}
export function Details(props) {
  return <article><label>{`Open`}</label>{<>{`Hi ${props.name}, `}<b><i>{`welcome`}</i></b>{`!`}</>}<button onClick={props.onClick}>{`你好`}</button></article>;
}
export function Attribute(props) {
  return <img alt={`你好`} src={props.src} />;
}
