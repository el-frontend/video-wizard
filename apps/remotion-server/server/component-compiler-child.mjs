// Renderer-owned compiler. Source exists only in the virtual file map.
import ts from 'typescript';
import { build } from 'esbuild';
import { posix } from 'node:path';
const K = ts.SyntaxKind;
const allowed = new Set(
  'SourceFile EndOfFileToken FunctionDeclaration Parameter ObjectBindingPattern BindingElement Identifier Block ReturnStatement VariableStatement VariableDeclarationList VariableDeclaration StringLiteral NumericLiteral TrueKeyword FalseKeyword NullKeyword PropertyAccessExpression ElementAccessExpression BinaryExpression ParenthesizedExpression CallExpression ExpressionStatement ObjectLiteralExpression PropertyAssignment ShorthandPropertyAssignment ArrayLiteralExpression ConditionalExpression QuestionToken ColonToken PrefixUnaryExpression ImportDeclaration ImportClause NamedImports ImportSpecifier ExportDeclaration NamedExports ExportSpecifier ExportKeyword DefaultKeyword JsxElement JsxOpeningElement JsxClosingElement JsxSelfClosingElement JsxAttributes JsxAttribute JsxExpression JsxText WhitespaceTrivia TypeReference TypeLiteral PropertySignature NumberKeyword StringKeyword BooleanKeyword VoidKeyword TypeAliasDeclaration InterfaceDeclaration ArrayType ArrowFunction EqualsGreaterThanToken ImportKeyword AsExpression TypeParameter LiteralType UnionType IfStatement'
    .split(' ')
    .map((n) => K[n])
);
const binary = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '===',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
  '&&',
  '||',
  '??',
]);
const forbidden = new Set(
  'Math.random random Date performance window globalThis document self parent top navigator location fetch XMLHttpRequest WebSocket EventSource Worker Audio AudioContext eval Function require process module exports global setTimeout setInterval requestAnimationFrame queueMicrotask constructor prototype __proto__ this arguments __host __visual __output'.split(
    ' '
  )
);
const tags = new Set(['div', 'span', 'p', 'strong', 'img']);
const methods = new Set([
  'fromTo',
  'floor',
  'ceil',
  'round',
  'max',
  'min',
  'abs',
  'sin',
  'cos',
  'sqrt',
  'pow',
  'clamp',
  'mapRange',
  'interpolate',
  'createElement',
]);
const exportsByModule = {
  react: ['createElement'],
  remotion: ['interpolate'],
  gsap: ['clamp', 'mapRange'],
  '@studio/visual': [],
};
const decls = {
  react:
    'export function createElement(tag:string,attrs:unknown,...children:unknown[]): JSX.Element;',
  remotion: 'export function interpolate(n:number,input:number[],output:number[]):number;',
  gsap: 'export function clamp(min:number,max:number,n:number):number;export function mapRange(a:number,b:number,c:number,d:number,n:number):number;',
  '@studio/visual':
    'export type VisualInput<P=Record<string,unknown>>={props:P;timeMs:number;context:VisualContext};export type NativeInput<P=Record<string,unknown>>={props:P;context:VisualContext;root:VisualElement;element:ElementFactory;timeline:Timeline};',
};
function propsType(node) {
  if (node.type === 'object')
    return (
      '{' +
      Object.entries(node.properties)
        .map(
          ([k, n]) =>
            JSON.stringify(k) + (node.required?.includes(k) ? '' : '?') + ':' + propsType(n)
        )
        .join(';') +
      '}'
    );
  if (node.type === 'array') return '(' + propsType(node.items) + ')[]';
  return node.enum?.map((v) => JSON.stringify(v)).join('|') || node.type;
}
async function compile({ manifest, files, sourceHash }) {
  const paths = Object.keys(files),
    declared = new Set(manifest.dependencies),
    extern = new Map();
  function resolveImport(spec, from) {
    if (!spec.startsWith('.')) {
      if (!declared.has(spec) || !Object.hasOwn(exportsByModule, spec))
        throw Error('Importación no declarada.');
      return spec;
    }
    if (!/^\.\.?\/[\w./-]+$/.test(spec)) throw Error('Ruta relativa no válida.');
    const base = posix.normalize(posix.join(posix.dirname(from), spec));
    const candidates = [
      base,
      base + '.ts',
      base + '.tsx',
      base + '/index.ts',
      base + '/index.tsx',
    ].filter((p) => Object.hasOwn(files, p));
    if (candidates.length !== 1) throw Error('La ruta no resuelve a un archivo único del bundle.');
    return candidates[0];
  }
  const target = ts.ScriptTarget.ES2022;
  for (const file of paths) {
    const sf = ts.createSourceFile(
      file,
      files[file],
      target,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const fail = (node, message) => {
      throw Error(
        file + ':' + (sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1) + ' ' + message
      );
    };
    if (sf.parseDiagnostics.length) fail(sf, 'Sintaxis no válida.');
    if (
      sf.referencedFiles.length ||
      sf.typeReferenceDirectives.length ||
      sf.libReferenceDirectives.length ||
      /@ts-(ignore|nocheck|expect-error)/.test(files[file])
    )
      fail(sf, 'Directiva no admitida.');
    function visit(node) {
      if (
        ts.isPrefixUnaryExpression(node) &&
        ![K.PlusToken, K.MinusToken, K.ExclamationToken].includes(node.operator)
      )
        fail(node, 'Operador no admitido.');
      if (ts.isBinaryExpression(node)) {
        if (!binary.has(node.operatorToken.getText(sf))) fail(node, 'Operador no admitido.');
        visit(node.left);
        visit(node.right);
        return;
      }
      if (!allowed.has(node.kind)) fail(node, 'Construcción no admitida: ' + K[node.kind]);
      if (ts.isIdentifier(node) && forbidden.has(node.text))
        fail(node, 'Identificador no admitido: ' + node.text);
      if (ts.isStringLiteral(node) && forbidden.has(node.text))
        fail(node, 'Propiedad no admitida.');
      if (
        ts.isElementAccessExpression(node) &&
        !ts.isStringLiteral(node.argumentExpression) &&
        !ts.isNumericLiteral(node.argumentExpression)
      )
        fail(node, 'Usa un índice literal.');
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (
          !ts.isIdentifier(expr) &&
          !(ts.isPropertyAccessExpression(expr) && methods.has(expr.name.text))
        )
          fail(node, 'Llamada no admitida.');
      }
      if (ts.isVariableDeclarationList(node) && !(node.flags & ts.NodeFlags.Const))
        fail(node, 'Usa enlaces const.');
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) {
          try {
            const spec = node.moduleSpecifier.text;
            const dest = resolveImport(spec, file);
            extern.set(file + '\0' + spec, dest);
            if (!Object.hasOwn(files, dest)) {
              const bindings = ts.isImportDeclaration(node)
                ? node.importClause?.namedBindings
                : node.exportClause;
              if (!bindings?.elements || node.importClause?.name)
                throw Error('Usa imports nombrados de la fachada.');
              for (const item of bindings.elements) {
                const name = (item.propertyName ?? item.name).text;
                if (
                  !(dest === '@studio/visual' && ['VisualInput', 'NativeInput'].includes(name)) &&
                  !exportsByModule[dest].includes(name)
                )
                  throw Error('Exportación no admitida: ' + name);
              }
            }
          } catch (e) {
            fail(node, e.message);
          }
        }
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        if (manifest.engine !== 'remotion' || !tags.has(node.tagName.getText(sf)))
          fail(node, 'Etiqueta visual no admitida.');
        for (const attr of node.attributes.properties)
          if (!ts.isJsxAttribute(attr) || !['style', 'assetId'].includes(attr.name.getText(sf)))
            fail(attr, 'Atributo no admitido.');
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }
  // All author files, including unused files, are type-checked against virtual declarations.
  const globalDecl =
    'interface Array<T>{length:number;[index:number]:T} interface Boolean{} interface Function{} interface CallableFunction extends Function{} interface NewableFunction extends Function{} interface IArguments{} interface Number{} interface Object{} interface RegExp{} interface String{} type Record<K extends string,T>={[P in K]:T}; declare const Math:{floor(n:number):number;ceil(n:number):number;round(n:number):number;min(...n:number[]):number;max(...n:number[]):number;abs(n:number):number;sin(n:number):number;cos(n:number):number;sqrt(n:number):number;pow(a:number,b:number):number}; declare namespace JSX{interface Element {readonly __visual:true} interface IntrinsicElements{[tag:string]:{style?:Record<string,string|number>;assetId?:string}}} type VisualElement={readonly id:number};type Css=Record<string,string|number>;type ElementFactory=(parent:VisualElement,tag:"div"|"span"|"p"|"strong"|"img",opts?:{style?:Css;text?:string;assetId?:string})=>VisualElement;type Timeline={fromTo(target:VisualElement,from:Css,to:Css,at:number):void};type VisualContext={fontFamilies:string[];canvas:{width:number;height:number;fps:number};size:{width:number;height:number};durationMs:number;appearance:{foreground:string;background:string;accent:string;surface:string;family:string;weight:number;size:number;lineHeight:number};assets:Record<string,{url:string;width?:number;height?:number;mediaType:string;fontFamily?:string}>};';
  const virtual = { ...files, '__global.d.ts': globalDecl };
  for (const [id, value] of Object.entries(decls)) virtual[id + '.d.ts'] = value;
  const input =
    '{props:' +
    propsType(manifest.propsSchema) +
    ';context:VisualContext;' +
    (manifest.engine === 'remotion'
      ? 'timeMs:number'
      : 'root:VisualElement;element:ElementFactory;timeline:Timeline') +
    '}';
  // Give unannotated single-argument default functions the canonical contextual type.
  for (const p of [manifest.entry]) {
    const sf = ts.createSourceFile(p, files[p], target, true);
    const fn = sf.statements.find(
      (n) => ts.isFunctionDeclaration(n) && n.modifiers?.some((m) => m.kind === K.DefaultKeyword)
    );
    if (fn && fn.parameters.length === 1 && !fn.parameters[0].type) {
      const at = fn.parameters[0].name.end;
      virtual[p] = files[p].slice(0, at) + ':' + input + files[p].slice(at);
    }
  }
  const spec = './' + manifest.entry;
  virtual['__check.ts'] =
    'import impl from ' +
    JSON.stringify(spec) +
    '; const check: (input:' +
    input +
    ')=>' +
    (manifest.engine === 'remotion' ? 'JSX.Element' : 'void') +
    '=impl;';
  const options = {
    noLib: true,
    noEmit: true,
    strict: true,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    target,
    types: [],
    allowImportingTsExtensions: true,
  };
  const read = (p) => virtual[p.replace(/^\//, '')];
  const host = {
    getSourceFile(p) {
      const code = read(p);
      if (code !== undefined) return ts.createSourceFile(p, code, target, true);
    },
    getDefaultLibFileName: () => '',
    writeFile() {},
    getCurrentDirectory: () => '',
    getDirectories: () => [],
    fileExists: (p) => read(p) !== undefined,
    readFile: read,
    getCanonicalFileName: (p) => p,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    resolveModuleNames(names, from) {
      return names.map((name) => {
        const dest = from === '__check.ts' ? manifest.entry : extern.get(from + '\0' + name);
        return dest
          ? {
              resolvedFileName: Object.hasOwn(files, dest) ? dest : dest + '.d.ts',
              extension: dest.endsWith('.tsx') ? ts.Extension.Tsx : ts.Extension.Ts,
            }
          : undefined;
      });
    },
  };
  const program = ts.createProgram([...paths, '__global.d.ts', '__check.ts'], options, host);
  const diag = ts.getPreEmitDiagnostics(program)[0];
  if (diag) {
    const file = diag.file?.fileName;
    throw Error(
      (file && file in files ? file : manifest.entry) +
        ':' +
        (diag.file && diag.start !== undefined
          ? diag.file.getLineAndCharacterOfPosition(diag.start).line + 1
          : 1) +
        ' ' +
        ts.flattenDiagnosticMessageText(diag.messageText, ' ').slice(0, 450)
    );
  }
  const checker = program.getTypeChecker();
  const entryImport = program.getSourceFile('__check.ts').statements[0].importClause.name;
  const signature = checker.getTypeAtLocation(entryImport).getCallSignatures()[0];
  if (signature?.getParameters().length !== 1)
    throw Error(manifest.entry + ':1 La exportación debe recibir un parámetro de contexto.');
  if (
    manifest.engine === 'hyperframes' &&
    !(signature.getReturnType().flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined))
  )
    throw Error(manifest.entry + ':1 La fábrica nativa debe devolver void.');
  const result = await build({
    entryPoints: [manifest.entry],
    write: false,
    bundle: true,
    format: 'iife',
    globalName: '__output',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    logLevel: 'silent',
    jsxFactory: '__host.createElement',
    plugins: [
      {
        name: 'virtual-graph',
        setup(b) {
          b.onResolve({ filter: /.*/ }, ({ path, importer }) => {
            const dest = importer ? resolveImport(path, importer) : path;
            return { path: dest, namespace: Object.hasOwn(files, dest) ? 'source' : 'facade' };
          });
          b.onLoad({ filter: /.*/, namespace: 'source' }, ({ path }) => ({
            contents: files[path],
            loader: path.endsWith('.tsx') ? 'tsx' : 'ts',
          }));
          b.onLoad({ filter: /.*/, namespace: 'facade' }, ({ path }) => ({
            contents: exportsByModule[path]
              .map((n) => 'export const ' + n + '=__host.' + n + ';')
              .join('\n'),
            loader: 'js',
          }));
        },
      },
    ],
  });
  return (
    '(globalThis.__studioVisualModules??=Object.create(null))[' +
    JSON.stringify(sourceHash) +
    ']=function(__host){' +
    result.outputFiles[0].text +
    'return __output.default};\n'
  );
}
try {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  process.stdout.write(JSON.stringify({ module: await compile(JSON.parse(data)) }));
} catch (e) {
  process.stdout.write(
    JSON.stringify({ error: e instanceof Error ? e.message : 'No se pudo compilar.' })
  );
}
