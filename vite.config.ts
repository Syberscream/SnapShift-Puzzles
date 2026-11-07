import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'web');
const pages = Object.fromEntries(
  readdirSync(root)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), resolve(root, f)]),
);

/**
 * Paint every page with the admin's last-known look before anything else
 * loads (no flash of the default background). The page's own script still
 * fetches the current look and caches it for next time.
 */
const THEME_BOOT = `(function(){try{var t=JSON.parse(localStorage.getItem('ss_theme')||'null'),s=document.documentElement.style;
if(!t){s.setProperty('--theme-bg-image','none');return;}
var u=function(k,v){if(v!==undefined&&v!==null)s.setProperty(k,String(v));};
u('--theme-bg-image',t.backgroundImage?'url("'+String(t.backgroundImage).replace(/"/g,'%22')+'")':'none');
u('--theme-bg-opacity',t.backgroundOpacity);
if(t.backgroundFit){u('--theme-bg-size',t.backgroundFit==='repeat'?'auto':t.backgroundFit);u('--theme-bg-repeat',t.backgroundFit==='repeat'?'repeat':'no-repeat');}
if(t.backgroundBlur!==undefined)u('--theme-bg-blur',t.backgroundBlur+'px');
u('--theme-panel-alpha',t.panelOpacity);u('--theme-base',t.baseColor);u('--theme-panel',t.panelColor);
u('--pill',t.pillColor);u('--button',t.buttonColor);u('--accent',t.accentColor);}catch(e){}})();`;

const SITE_URL = 'https://snapshiftpuzzles.com';
/** Pages that shouldn't appear in search results. */
const NOINDEX = ['admin.html', 'account.html', '404.html', 'supporter.html'];

const themeBoot = {
  name: 'snapshift-theme-boot',
  transformIndexHtml: {
    order: 'pre' as const,
    handler: (html: string, ctx: { filename: string }) => {
      // Link previews: the 1200×630 site picture by default (pages with their own
      // puzzle or event get theirs from the Worker), and large cards on X/Twitter.
      const out = html.replace('<meta property="og:image" content="/img/logo.png" />', `<meta property="og:image" content="${SITE_URL}/img/share.jpg" />`);
      const file = ctx.filename.split('/').pop() ?? '';
      const tags = [
        { tag: 'script', children: THEME_BOOT, injectTo: 'head-prepend' as const },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' }, injectTo: 'head' as const },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' }, injectTo: 'head' as const },
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' as const },
        { tag: 'meta', attrs: { property: 'og:site_name', content: 'SnapShift Puzzles' }, injectTo: 'head' as const },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' as const },
        ...(NOINDEX.includes(file) ? [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex' }, injectTo: 'head' as const }] : []),
      ];
      return { html: out, tags };
    },
  },
};

export default defineConfig({
  plugins: [themeBoot],
  root,
  publicDir: resolve(import.meta.dirname, 'public'),
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'shared') } },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: pages },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '/media': 'http://127.0.0.1:8787' } },
});
