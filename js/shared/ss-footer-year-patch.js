(function(){
  var yearEl = document.getElementById('footerYear');
  if (yearEl && !yearEl.textContent) yearEl.textContent = String(new Date().getFullYear());
})();
