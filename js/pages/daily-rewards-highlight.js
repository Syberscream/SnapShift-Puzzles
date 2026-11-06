(function(){
  const highlightGroups = {
    'daily-challenge': ['daily-challenge'],
    'claim-now': ['claim-now'],
    'leaderboard-medals': ['leaderboard-medals','medals'],
    'ratings': ['ratings']
  };

  let clearTimer = null;

  function getTargetIds(hashOrId){
    const raw = String(hashOrId || '').replace(/^#/, '').trim();
    if (!raw) return [];
    return highlightGroups[raw] || [raw];
  }

  function clearHighlights(){
    document.querySelectorAll('.copyCard.is-flash').forEach(el => el.classList.remove('is-flash'));
    if (clearTimer){
      clearTimeout(clearTimer);
      clearTimer = null;
    }
  }

  function focusSection(hashOrId, pushHash){
    const ids = getTargetIds(hashOrId);
    if (!ids.length) return false;

    const cards = ids
      .map(id => document.getElementById(id))
      .filter(Boolean);

    if (!cards.length) return false;

    clearHighlights();

    cards.forEach(card => card.classList.add('is-flash'));

    const lead = cards[0];
    try {
      lead.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      lead.scrollIntoView(true);
    }

    if (pushHash) {
      try {
        history.replaceState(null, '', '#' + ids[0]);
      } catch (e) {
        location.hash = ids[0];
      }
    }

    clearTimer = setTimeout(() => {
      cards.forEach(card => card.classList.remove('is-flash'));
      clearTimer = null;
    }, 2200);

    return true;
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a.btnSoft[href^="#"]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (!href || href === '#') return;
    if (!document.querySelector(href)) return;
    event.preventDefault();
    focusSection(href, true);
  });

  window.addEventListener('hashchange', () => {
    focusSection(location.hash, false);
  });

  window.addEventListener('load', () => {
    if (location.hash) {
      setTimeout(() => focusSection(location.hash, false), 80);
    }
  });
})();
