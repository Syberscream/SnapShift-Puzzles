(function(global){
  const api = {};
  api.normalizeCatId = function(value){
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  };
  api.normalizeSrc = function(value){
    try{
      let v = String(value || '').trim();
      if (!v) return '';
      try{ v = decodeURIComponent(v); }catch(e){}
      v = v.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
      return v.toLowerCase();
    }catch(e){ return ''; }
  };
  api.listSources = function(items){
    const out = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const raw = item && typeof item === 'object' ? item.src : item;
      const key = api.normalizeSrc(raw);
      if (key) out.push(key);
    });
    return out;
  };
  api.buildRecord = function(raw, items){
    const incoming = (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.unlockedSrcs)) ? raw.unlockedSrcs : [];
    const clean = [];
    const seen = new Set();
    incoming.forEach((src) => {
      const key = api.normalizeSrc(src);
      if (!key || seen.has(key)) return;
      seen.add(key);
      clean.push(key);
    });
    const list = api.listSources(items);
    const firstSrc = list[0] || '';
    if (firstSrc && !seen.has(firstSrc)) {
      seen.add(firstSrc);
      clean.unshift(firstSrc);
    }
    return {
      record: { version: 2, unlockedSrcs: clean, updatedAt: new Date().toISOString() },
      set: new Set(clean),
      list,
    };
  };
  api.buildState = function(unlockedMap, categoryId, items){
    const catId = api.normalizeCatId(categoryId || '');
    const raw = unlockedMap && typeof unlockedMap === 'object' ? unlockedMap[catId] : null;
    const built = api.buildRecord(raw, items);
    const list = Array.isArray(items) ? items : [];
    let nextLockedIdx = list.findIndex((item) => !api.isUnlockedSrc(built.set, item && typeof item === 'object' ? item.src : item));
    if (nextLockedIdx < 0) nextLockedIdx = list.length;
    return { categoryId: catId, record: built.record, set: built.set, unlockedCount: built.set.size || (list.length ? 1 : 0), nextLockedIdx };
  };
  api.isUnlockedSrc = function(unlockedSet, value){
    const key = api.normalizeSrc(value);
    return !!key && unlockedSet instanceof Set && unlockedSet.has(key);
  };
  api.fetchUnlockedMap = async function(endpoint){
    try{
      const r = await fetch(endpoint || '/api/unlocked_get.php', { credentials:'include', cache:'no-store' });
      const j = await r.json().catch(() => null);
      if (j && j.ok && j.loggedIn && j.unlocked && typeof j.unlocked === 'object') return j.unlocked;
    }catch(e){}
    return {};
  };
  api.pushUnlockedMap = async function(endpoint, unlockedMap){
    try{
      const r = await fetch(endpoint || '/api/unlocked_set.php', {
        method:'POST', credentials:'include', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ unlocked: unlockedMap || {} })
      });
      const j = await r.json().catch(() => null);
      if (j && j.ok && j.loggedIn && j.unlocked && typeof j.unlocked === 'object') return j.unlocked;
    }catch(e){}
    return null;
  };
  global.SnapshiftPuzzleAccess = api;
})(window);
