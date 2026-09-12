import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const entries = fs.readdirSync(rootDir);
const plugins = entries.filter(item => {
  const p = path.join(rootDir, item);
  return fs.statSync(p).isDirectory() && 
         fs.existsSync(path.join(p, 'plugin.json')) &&
         (fs.existsSync(path.join(p, 'plugin.ts')) || fs.existsSync(path.join(p, 'src/index.ts')));
});

console.log('Building plugins:', plugins);

for (const plugin of plugins) {
  const pluginDir = path.join(rootDir, plugin);
  const tsEntry = fs.existsSync(path.join(pluginDir, 'plugin.ts'))
    ? path.join(pluginDir, 'plugin.ts')
    : path.join(pluginDir, 'src/index.ts');
  const outFile = path.join(pluginDir, 'plugin.js');

  try {
    await esbuild.build({
      entryPoints: [tsEntry],
      bundle: true,
      minify: false,
      outfile: outFile,
      format: 'iife',
      globalName: 'PluginModule',
      treeShaking: true,
      platform: 'browser',
      target: 'es2020',
      footer: { js: 'Object.assign(globalThis, PluginModule);' }
    });
    console.log(`✓ Compiled ${plugin} -> plugin.js`);
  } catch (err) {
    console.error(`✗ Failed to compile ${plugin}:`, err);
    process.exitCode = 1;
  }
}
