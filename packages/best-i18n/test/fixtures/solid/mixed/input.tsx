import { t, plural } from 'best-i18n/macro';
import { Trans, Trans as T } from 'best-i18n/solid/macro';

export function Words() { return <Trans>Hello</Trans>; }
export function Rich(props) { return <Trans>Read <a href={props.href}>docs</a>.</Trans>; }
export function Page(props) {
  const title = () => t`Hello`;
  return <section><h1>{title()}</h1><span>{plural(props.count, `One item`, `${props.count} items`)}</span><Rich href="/docs" /></section>;
}

export function Stored() { const content = <Trans>Hello</Trans>; return content; }

export function Repeated(props) {
  return <div><Trans>Read <a href={props.href}>docs</a>.</Trans><Trans>Read <a href={props.href}>docs</a>.</Trans></div>;
}
export function Details(props) {
  return <article><label>{t.ctx('verb')`Open`}</label><T>Hi {props.name}, <b><i>welcome</i></b>!</T><button onClick={props.onClick}>{t`Hello`}</button></article>;
}
export function Attribute(props) {
  return <img alt={<T>Hello</T>} src={props.src} />;
}
export function Named(props) {
  return <p><Trans locale="zh">Hello</Trans><Trans locale={props.lang}>Read <a href={props.href}>docs</a>.</Trans>{t.locale('zh')`Hello`}</p>;
}
