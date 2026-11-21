const root = document.getElementById('player');
const target = root.dataset.parentOrigin;
const instance = location.pathname.split('/').at(-2);
const nonce = crypto.randomUUID();
Object.assign(root.dataset, { instance, nonce });
const post = (type) => parent.postMessage({ type, version: 1, instance, nonce }, target);
async function connect(event) {
  const message = event.data;
  if (
    event.source !== parent ||
    event.origin !== target ||
    message?.type !== 'studio.connect' ||
    message.version !== 1 ||
    message.instance !== instance ||
    message.nonce !== nonce ||
    typeof message.ticket !== 'string'
  )
    return;
  removeEventListener('message', connect);
  try {
    const res = await fetch('./session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: message.ticket }),
    });
    if (!res.ok) throw new Error();
    const script = document.createElement('script');
    script.src = './player.js';
    script.onerror = () => post('studio.error');
    document.body.append(script);
  } catch {
    post('studio.error');
  }
}
addEventListener('message', connect);
post('studio.connecting');
