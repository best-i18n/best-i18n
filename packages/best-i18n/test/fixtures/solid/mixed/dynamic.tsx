const __i18nM3 = (l) => (l === "zh" ? `你好` : `Hello`);
const __i18nM2 = (l, c0) => (l === "zh" ? <>{`阅读`}{c0(`文档`)}{`。`}</> : <>{`Read `}{c0(`docs`)}{`.`}</>);
const __i18nM1 = (l) => (l === "zh" ? `你好` : `Hello`);
import { getLocale as __i18nGetLocale } from "best-i18n/solid";

export function Words() { return <>{__i18nM1(__i18nGetLocale())}</>; }
export function Rich(props) { return <>{__i18nM2(__i18nGetLocale(), (__i18nChild) => <a href={props.href}>{__i18nChild}</a>)}</>; }
export function Page(props) {
  const title = () => __i18nM3(__i18nGetLocale());
  return <section><h1>{title()}</h1><span>{(__i18nGetLocale() === "zh" ? ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${props.count} items` : `One item`)(props.count) : ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${props.count} items` : `One item`)(props.count))}</span><Rich href="/docs" /></section>;
}

export function Stored() { const content = <>{__i18nM1(__i18nGetLocale())}</>; return content; }

export function Repeated(props) {
  return <div>{__i18nM2(__i18nGetLocale(), (__i18nChild) => <a href={props.href}>{__i18nChild}</a>)}{__i18nM2(__i18nGetLocale(), (__i18nChild) => <a href={props.href}>{__i18nChild}</a>)}</div>;
}
export function Details(props) {
  return <article><label>{(__i18nGetLocale() === "zh" ? `Open` : `Open`)}</label>{(__i18nGetLocale() === "zh" ? <>{`Hi ${props.name}, `}<b><i>{`welcome`}</i></b>{`!`}</> : <>{`Hi ${props.name}, `}<b><i>{`welcome`}</i></b>{`!`}</>)}<button onClick={props.onClick}>{__i18nM3(__i18nGetLocale())}</button></article>;
}
export function Attribute(props) {
  return <img alt={__i18nM1(__i18nGetLocale())} src={props.src} />;
}
