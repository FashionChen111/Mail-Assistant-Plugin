import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire, isBuiltin } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const optional = ['deasync', 'supports-color'] // Optional async cookie stores and debug coloring.

// DSH 0.2.3-alpha.2's profile resolver cannot load tough-cookie's `punycode/` import.
const { metafile } = await build({
  absWorkingDir: root,
  entryPoints: [require.resolve('ews-javascript-api')],
  outfile: 'dist/ews.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  legalComments: 'eof',
  external: optional,
  metafile: true,
})

const external = metafile.outputs['dist/ews.cjs'].imports.filter(({ path }) => !isBuiltin(path) && !optional.includes(path))
if (external.length > 0) {
  throw new Error(`Unbundled EWS dependencies: ${external.map(({ path }) => path).join(', ')}`)
}

const packageDirs = new Set(Object.keys(metafile.inputs).map((input) => {
  const match = input.match(/(?:.*\/)?node_modules\/(?:@[^/]+\/)?[^/]+/)
  if (!match) throw new Error(`Unexpected EWS bundle input: ${input}`)
  return match[0]
}))
const notices = await Promise.all([...packageDirs].sort().map(async (packageDir) => {
  const dir = join(root, packageDir)
  const { name, version, license } = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  const legalFiles = (await readdir(dir)).filter((file) => /^(licen[cs]e|notice|copying)([-.]|$)/i.test(file))
  const texts = await Promise.all(legalFiles.sort().map((file) => readFile(join(dir, file), 'utf8')))
  if (texts.length === 0) {
    const readme = await readFile(join(dir, 'README.md'), 'utf8')
    const start = readme.search(/^(?:#{1,6} )?license\s*$/im)
    if (start === -1) throw new Error(`Missing license notice for ${name}@${version}`)
    texts.push(readme.slice(start))
  }
  return [`${name}@${version} (${license})`, ...texts].join('\n\n')
}))
await writeFile(join(root, 'dist/ews-notices.txt'), notices.join('\n\n---\n\n'))
