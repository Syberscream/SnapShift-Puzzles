(function(){
  function parseUnlockResponseText(raw){
    if (!raw) return null;
    try{
      return JSON.parse(raw);
    }catch(e){}
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start){
      try{
        return JSON.parse(raw.slice(start, end + 1));
      }catch(e){}
    }
    return {
      ok: false,
      loggedIn: true,
      error_code: "invalid_json_response",
      msg: "Could not confirm the unlock response cleanly."
    };
  }

  async function submitUnlockRequest(payload){
    try{
      const response = await fetch("/api/puzzle_unlock_apply.php", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      const raw = await response.text();
      return parseUnlockResponseText(raw);
    }catch(e){}
    return null;
  }

  async function resolveUnlockOutcome(result, options){
    const opts = options && typeof options === "object" ? options : {};
    if (result && result.ok && result.loggedIn){
      return { ok: true, result, recovered: false, msg: "" };
    }
    if (typeof opts.refresh === "function"){
      await Promise.resolve(opts.refresh()).catch(() => {});
    }
    let unlockedNow = false;
    if (typeof opts.isUnlocked === "function"){
      unlockedNow = !!(await Promise.resolve(opts.isUnlocked()).catch(() => false));
    }
    if (unlockedNow){
      return { ok: true, result, recovered: true, msg: "" };
    }
    return {
      ok: false,
      result,
      recovered: false,
      msg: String(result && result.msg || opts.fallbackMessage || "Could not unlock this puzzle right now. Please try again.")
    };
  }

  window.SnapshiftUnlockClient = {
    parseUnlockResponseText,
    submitUnlockRequest,
    resolveUnlockOutcome
  };
})();
