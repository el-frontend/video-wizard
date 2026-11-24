// Host-owned facade. A factory receives opaque handles, never the DOM or the GSAP instance.
globalThis.mountStudioVisual = function (container, sourceHash, props, context, parent, origin) {
  const factory = globalThis.__studioVisualModules[sourceHash];
  const child = gsap.timeline({ paused: true });
  const nodes = new Map();
  function handle(node) {
    const token = Object.freeze({ id: nodes.size });
    nodes.set(token, node);
    return token;
  }
  const root = handle(container);
  const styles = new Set(
    'color backgroundColor fontFamily fontSize fontWeight lineHeight textAlign whiteSpace display width height padding margin borderRadius opacity transform alignItems justifyContent gap flexDirection objectFit'.split(
      ' '
    )
  );
  const tween = new Set(
    'x y xPercent yPercent opacity scale scaleX scaleY rotation duration ease'.split(' ')
  );
  function values(input, keys) {
    const result = {};
    for (const [key, value] of Object.entries(input || {})) {
      if (
        !keys.has(key) ||
        !['string', 'number'].includes(typeof value) ||
        !/^[-#%.,()\w\s]+$/.test(String(value)) ||
        /url\s*\(|image-set\s*\(/i.test(String(value))
      )
        throw Error('Propiedad visual no admitida.');
      result[key] = value;
    }
    return result;
  }
  function element(target, tag, options = {}) {
    if (
      !nodes.has(target) ||
      !['div', 'span', 'p', 'strong', 'img'].includes(tag) ||
      nodes.size > 1024
    )
      throw Error('Elemento visual no válido.');
    const node = document.createElement(tag);
    if (tag === 'img') {
      const asset = context.assets[options.assetId];
      if (!asset || !asset.mediaType.startsWith('image/')) throw Error('Imagen no declarada.');
      node.src = asset.url;
    } else node.textContent = options.text ?? '';
    Object.assign(node.style, values(options.style, styles));
    nodes.get(target).append(node);
    return handle(node);
  }
  const timeline = {
    fromTo(token, from, to, at) {
      const node = nodes.get(token);
      if (!node || !Number.isFinite(at) || at < 0 || at > context.durationMs / 1000)
        throw Error('Posición de tween no válida.');
      child.fromTo(node, values(from, tween), values(to, tween), at);
    },
  };
  factory({ clamp: gsap.utils.clamp, mapRange: gsap.utils.mapRange })({
    props,
    context,
    root,
    element,
    timeline,
  });
  parent.add(child, origin);
  child.paused(false);
};
