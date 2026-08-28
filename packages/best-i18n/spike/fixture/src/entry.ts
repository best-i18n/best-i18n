import { used } from './messages-mod.ts'

const count = Number(globalThis.location.hash.slice(1))

document.body.textContent = used('world', count)
