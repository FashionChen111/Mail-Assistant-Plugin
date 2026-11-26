import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')

test('package.json declares a bundle and client manifest for DSH 0.2.0-rc.1', async () => {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, '@local/dsh-exchange')
  assert.equal(pkg.version, '1.4.0')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.engines.dsh, '0.2.0-rc.1')
  for (const name of ['dsh-credentials', 'dsh-home-paths', 'dsh-llm', 'dsh-tools']) {
    assert.equal(pkg.peerDependencies[`@deepseek-ai/${name}`], '0.2.0-rc.1')
    assert.equal(pkg.devDependencies[`@deepseek-ai/${name}`], '0.2.0-rc.1')
  }
  assert.ok(!Object.hasOwn(pkg.peerDependencies, '@deepseek-ai/dsh-error'))
  assert.equal(pkg.dependencies['ews-javascript-api'], '0.15.3')
  assert.ok(pkg.dependencies['@ewsjs/xhr'])
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['.'], './index.js')
  assert.equal(pkg.exports['./client'], './client.js')
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  assert.equal(pkg.exports['./icon'], './icon.svg')
  assert.equal(pkg.exports['./package.json'], './package.json')
})

test('locale/en.json, locale/zh.json, cordis.patch.yml, and icon.svg satisfy DSH metadata rules', async () => {
  const en = JSON.parse(await readFile(resolve(ROOT, 'locale/en.json'), 'utf8'))
  const zh = JSON.parse(await readFile(resolve(ROOT, 'locale/zh.json'), 'utf8'))
  assert.ok(en.meta.title && en.meta.description)
  assert.ok(zh.meta.title && zh.meta.description)
  const patch = await readFile(resolve(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id:\s*dsh-exchange/)
  assert.match(patch, /name:\s*['"]@local\/dsh-exchange['"]/)
  const iconBuf = await readFile(resolve(ROOT, 'icon.svg'), 'utf8')
  const iconStat = await stat(resolve(ROOT, 'icon.svg'))
  assert.ok(iconStat.size <= 256 * 1024)
  assert.match(iconBuf, /viewBox="0 0 36 36"/)
  assert.doesNotMatch(iconBuf, /<script|<style|<text|<image|foreignObject/i)
})

test('README.md and README.zh-CN.md cross-link with Shields.io badges and are packaged in package.json files', async () => {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'))
  assert.ok(Array.isArray(pkg.files) && pkg.files.includes('README.md') && pkg.files.includes('README.zh-CN.md'))

  const enReadme = await readFile(resolve(ROOT, 'README.md'), 'utf8')
  const zhReadme = await readFile(resolve(ROOT, 'README.zh-CN.md'), 'utf8')
  assert.match(enReadme, /README\.zh-CN\.md/)
  assert.match(enReadme, /img\.shields\.io/)
  assert.match(enReadme, /Activity History/i)
  assert.match(zhReadme, /README\.md/)
  assert.match(zhReadme, /img\.shields\.io/)
  assert.match(zhReadme, /操作历史/)
})
